'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  effectiveStatus,
  fmt,
  loadCommitments,
  maturityOf,
  progressOf,
  projectedYield,
  saveCommitments,
  specFor,
  type Commitment,
} from '@/lib/commitments';
import { useWallet } from '@/components/WalletProvider';
import { fetchXlmBalance, shortAddress } from '@/lib/wallet';
import { fetchEscrowEvents, type DecodedEscrowEvent } from '@/lib/soroban/events';
import { explorerContractUrl } from '@/lib/config';

export default function DashboardPage() {
  const { status, address } = useWallet();
  const [list, setList] = useState<Commitment[] | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [recentEvents, setRecentEvents] = useState<DecodedEscrowEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  useEffect(() => {
    setList(loadCommitments());
  }, []);

  useEffect(() => {
    setBalance(null);
    if (address) {
      fetchXlmBalance(address).then(setBalance);
      setEventsLoading(true);
      setEventsError(null);
      fetchEscrowEvents({
        limit: 5,
        filters: { owner: address },
      })
        .then((res) => setRecentEvents(res.events))
        .catch((err) => setEventsError(err?.message || 'Failed to load activity'))
        .finally(() => setEventsLoading(false));
    } else {
      setRecentEvents([]);
    }
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
          <Link href="/create" className="btn btn-primary">
            Create your first
          </Link>
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

      <div className="row between wrap mt">
        <h2>Recent activity</h2>
        <Link href="/activity" className="btn btn-ghost small">
          View all activity &rarr;
        </Link>
      </div>
      {!address ? (
        <div className="card center">
          <p className="muted">Connect your wallet to see your recent contract activity.</p>
        </div>
      ) : eventsLoading ? (
        <div className="card center">
          <p className="muted">Loading recent on-chain events...</p>
        </div>
      ) : eventsError ? (
        <div className="card center">
          <p className="error-text small">{eventsError}</p>
        </div>
      ) : recentEvents.length === 0 ? (
        <div className="card center">
          <p className="muted">No recent on-chain activity found for your address.</p>
        </div>
      ) : (
        <div className="stack">
          {recentEvents.map((ev) => (
            <div key={ev.id} className="card row between wrap">
              <div className="row gap">
                <span className={`badge ${ev.kind}`}>{ev.kind}</span>
                <span>
                  {ev.commitmentId ? `Commitment #${ev.commitmentId}` : 'Contract Action'}
                </span>
                {ev.amount && <b className="small">{fmt(Number(ev.amount))} XLM</b>}
              </div>
              <div className="row gap muted small">
                <span>{new Date(ev.at).toLocaleDateString()}</span>
                {ev.txHash && (
                  <a
                    href={explorerContractUrl(ev.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="link"
                  >
                    tx
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
