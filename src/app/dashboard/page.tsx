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
  saveCommitments,
  specFor,
  type Commitment,
} from '@/lib/commitments';
import { useWallet } from '@/components/WalletProvider';
import { fetchXlmBalance } from '@/lib/wallet';
import { InlineError } from '@/components/InlineError';
import { Skeleton } from '@/components/Skeleton';
import DashboardLoading from './loading';

type BalanceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; balance: string }
  | { status: 'unfunded'; friendbotUrl: string }
  | { status: 'error'; message: string };

export default function DashboardPage() {
  const { status, address } = useWallet();
  const [list, setList] = useState<Commitment[] | null>(null);
  const [balanceState, setBalanceState] = useState<BalanceState>({ status: 'idle' });

  useEffect(() => {
    setList(loadCommitments());
  }, []);

  const loadBalance = useCallback((addr: string, signal?: AbortSignal) => {
    setBalanceState({ status: 'loading' });
    fetchXlmBalance(addr, { signal })
      .then((res) => {
        if (signal?.aborted) return;
        if (res.status === 'success') {
          setBalanceState({ status: 'success', balance: res.balance });
        } else if (res.status === 'unfunded') {
          setBalanceState({ status: 'unfunded', friendbotUrl: res.friendbotUrl });
        } else {
          setBalanceState({ status: 'error', message: res.message });
        }
      })
      .catch((_err) => {
        if (signal?.aborted) return;
        setBalanceState({ status: 'error', message: "Couldn't load balance" });
      });
  }, []);

  useEffect(() => {
    if (!address || status !== 'connected') {
      setBalanceState({ status: 'idle' });
      return;
    }

    const controller = new AbortController();
    loadBalance(address, controller.signal);

    return () => {
      controller.abort();
    };
  }, [address, status, loadBalance]);

  const handleRetryBalance = () => {
    if (address) {
      loadBalance(address);
    }
  };

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

  if (!list) return <DashboardLoading />;

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
          {status === 'connected' ? (
            balanceState.status === 'loading' ? (
              <Skeleton width="110px" height="32px" style={{ marginTop: '4px' }} />
            ) : balanceState.status === 'success' ? (
              <b>{fmt(Number(balanceState.balance))}</b>
            ) : balanceState.status === 'unfunded' ? (
              <div className="stack" style={{ gap: '4px', marginTop: '4px' }}>
                <b style={{ fontSize: '1rem', color: 'var(--warn)' }}>Account not funded</b>
                <a
                  href={balanceState.friendbotUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="friendbot-link"
                >
                  Fund via Friendbot &rarr;
                </a>
              </div>
            ) : balanceState.status === 'error' ? (
              <div style={{ marginTop: '6px' }}>
                <InlineError
                  message="Couldn't load balance"
                  onRetry={handleRetryBalance}
                />
              </div>
            ) : (
              <b>n/a</b>
            )
          ) : (
            <b>{matured}</b>
          )}
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
    </section>
  );
}
