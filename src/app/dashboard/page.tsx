'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  effectiveStatus,
  fmt,
  loadCommitments,
  maturityOf,
  progressOf,
  projectedYield,
  resetCommitments,
  sampleCommitments,
  saveCommitments,
  specFor,
  subscribeCommitments,
  type Commitment,
} from '@/lib/commitments';
import { useWallet } from '@/components/WalletProvider';
import { fetchXlmBalance } from '@/lib/wallet';

interface Notice {
  message: string;
  canReset: boolean;
}

export default function DashboardPage() {
  const { status, address } = useWallet();
  const [list, setList] = useState<Commitment[] | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const reload = useCallback(() => {
    const result = loadCommitments();
    setList(result.items);

    const messages: string[] = [];
    let canReset = false;
    if (result.corrupt) {
      messages.push('Some saved commitments could not be read and were discarded.');
      canReset = true;
    } else if (result.dropped > 0) {
      messages.push(
        `${result.dropped} saved commitment${result.dropped === 1 ? '' : 's'} could not be validated and ${result.dropped === 1 ? 'was' : 'were'} skipped.`,
      );
      canReset = true;
    }
    if (result.storageUnavailable) {
      messages.push('Browser storage is unavailable, so changes are kept only for this session.');
    }
    setNotice(messages.length ? { message: messages.join(' '), canReset } : null);
  }, []);

  useEffect(() => {
    reload();
    return subscribeCommitments(reload);
  }, [reload]);

  useEffect(() => {
    setBalance(null);
    if (address) fetchXlmBalance(address).then(setBalance);
  }, [address]);

  function update(id: string, patch: Partial<Commitment>) {
    setList((prev) => {
      const next = (prev ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c));
      saveCommitments(next);
      return next;
    });
  }

  function remove(id: string) {
    setList((prev) => {
      const next = (prev ?? []).filter((c) => c.id !== id);
      saveCommitments(next);
      return next;
    });
  }

  function loadSamples() {
    saveCommitments([...(list ?? []), ...sampleCommitments()]);
    reload();
  }

  function resetStorage() {
    resetCommitments();
    reload();
  }

  if (!list) return <section className="container page">Loading...</section>;

  const live = list.filter((c) => ['active', 'matured'].includes(effectiveStatus(c)));
  const locked = live.reduce((s, c) => s + c.amount, 0);
  const yieldTotal = live.reduce((s, c) => s + projectedYield(c), 0);
  const matured = list.filter((c) => effectiveStatus(c) === 'matured').length;

  return (
    <section className="container page">
      <div className="row between wrap">
        <h1>Dashboard</h1>
        <Link href="/create" className="btn btn-primary">
          New commitment
        </Link>
      </div>

      {notice && (
        <div className="notice" role="status">
          <div className="row between wrap">
            <span>{notice.message}</span>
            {notice.canReset && (
              <button className="btn btn-ghost" onClick={resetStorage}>
                Reset demo data
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid4">
        <div className="card metric">
          <span className="muted">Active commitments</span>
          <b>{live.length}</b>
        </div>
        <div className="card metric">
          <span className="muted">Total locked</span>
          <b>{fmt(locked)}</b>
        </div>
        <div className="card metric">
          <span className="muted">Projected yield</span>
          <b>{fmt(yieldTotal)}</b>
        </div>
        <div className="card metric">
          <span className="muted">{status === 'connected' ? 'Wallet XLM (testnet)' : 'Ready to settle'}</span>
          <b>{status === 'connected' ? (balance ? fmt(Number(balance)) : 'n/a') : matured}</b>
        </div>
      </div>

      <h2 className="mt">Your commitments</h2>
      {list.length === 0 ? (
        <div className="card center">
          <p className="muted">No commitments yet.</p>
          <div className="row center-row">
            <Link href="/create" className="btn btn-primary">
              Create your first
            </Link>
            <button className="btn btn-ghost" onClick={loadSamples}>
              Load sample commitments
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          {list.map((c) => {
            const st = effectiveStatus(c);
            const pct = Math.round(progressOf(c) * 100);
            const left = Math.max(0, Math.ceil((maturityOf(c) - Date.now()) / 86_400_000));
            return (
              <article className="card commit" key={c.id}>
                <div className="row between wrap">
                  <div>
                    <h3>
                      {fmt(c.amount)} {c.asset}{' '}
                      <span className={`badge ${st}`}>{st}</span>
                      {c.demo && <span className="badge demo">demo</span>}
                    </h3>
                    <p className="muted small">
                      {c.id} &middot; {specFor(c.type).name} &middot; {c.apy}% APY &middot; max
                      loss {c.maxLoss}%
                    </p>
                  </div>
                  <div className="row">
                    {st === 'matured' && (
                      <button className="btn btn-primary" onClick={() => update(c.id, { status: 'settled' })}>
                        Settle
                      </button>
                    )}
                    {st === 'active' && (
                      <button
                        className="btn btn-ghost"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Exit early? A ${c.penalty}% penalty (${fmt((c.amount * c.penalty) / 100)} ${c.asset}) applies.`,
                            )
                          )
                            update(c.id, { status: 'exited' });
                        }}
                      >
                        Early exit
                      </button>
                    )}
                    {(st === 'settled' || st === 'exited') && (
                      <button className="btn btn-ghost" onClick={() => remove(c.id)}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <div className="bar" aria-label={`${pct}% of lock elapsed`}>
                  <div style={{ width: `${st === 'settled' || st === 'exited' ? 100 : pct}%` }} />
                </div>
                <p className="muted small">
                  {st === 'active'
                    ? `${pct}% elapsed, ${left} day${left === 1 ? '' : 's'} to maturity`
                    : st === 'matured'
                      ? `Matured. Projected payout ${fmt(c.amount + projectedYield(c))} ${c.asset}`
                      : st === 'settled'
                        ? `Settled with ${fmt(projectedYield(c))} ${c.asset} yield`
                        : `Exited early, ${fmt((c.amount * c.penalty) / 100)} ${c.asset} penalty paid`}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
