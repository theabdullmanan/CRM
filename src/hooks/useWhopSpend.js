import { useCallback, useEffect, useState } from 'react';
import { fetchWhopLifetime, fetchWhopSpend } from '../lib/whop';

const REFRESH_MS = 3 * 60 * 1000;
const LIFETIME_REFRESH_MS = 10 * 60 * 1000;
const EMPTY_TOTALS = { today: 0, yesterday: 0, week: 0, prevWeek: 0, d30: 0, prevD30: 0 };

/**
 * Fetches live payments straight from Whop for every given account, merges the totals,
 * and refreshes in the background every few minutes. Each account is fetched separately
 * so one revoked/bad key doesn't blank out the others — it's just reported in `errors`.
 */
export function useWhopSpend(accounts) {
  const [state, setState] = useState({ status: 'idle', totals: EMPTY_TOTALS, byDay: {}, byCustomerD30: {}, errors: [], updatedAt: null });
  const key = accounts.map((a) => a.id).sort().join(',');

  const load = useCallback(async (signal, isAccounts) => {
    if (!isAccounts.length) {
      setState({ status: 'empty', totals: EMPTY_TOTALS, byDay: {}, byCustomerD30: {}, errors: [], updatedAt: null });
      return;
    }
    setState((s) => ({ ...s, status: s.updatedAt ? 'refreshing' : 'loading' }));

    const results = await Promise.allSettled(isAccounts.map((a) => fetchWhopSpend([a], { signal })));
    if (signal.aborted) return;

    const totals = { ...EMPTY_TOTALS };
    const byDay = {};
    const byCustomerD30 = {};
    const errors = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        for (const k of Object.keys(totals)) totals[k] += r.value.totals[k];
        for (const [d, v] of Object.entries(r.value.byDay)) byDay[d] = (byDay[d] || 0) + v;
        for (const [who, v] of Object.entries(r.value.byCustomerD30)) byCustomerD30[who] = (byCustomerD30[who] || 0) + v;
      } else {
        errors.push(isAccounts[i].label || isAccounts[i].id);
      }
    });

    setState({
      status: errors.length === isAccounts.length ? 'error' : 'ready',
      totals, byDay, byCustomerD30, errors, updatedAt: new Date(),
    });
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal, accounts);
    const id = setInterval(() => load(ctrl.signal, accounts), REFRESH_MS);
    return () => { ctrl.abort(); clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, load]);

  return state;
}

/**
 * Lifetime spend across every given account, via Whop's aggregate stats endpoint (cheap — no
 * payment-by-payment pagination). Refreshes less often than useWhopSpend since it rarely swings.
 */
export function useWhopLifetime(accounts) {
  const [state, setState] = useState({ status: 'idle', amount: 0, errors: [], updatedAt: null });
  const key = accounts.map((a) => a.id).sort().join(',');

  const load = useCallback(async (signal, isAccounts) => {
    if (!isAccounts.length) {
      setState({ status: 'empty', amount: 0, errors: [], updatedAt: null });
      return;
    }
    setState((s) => ({ ...s, status: s.updatedAt ? 'refreshing' : 'loading' }));

    const results = await Promise.allSettled(isAccounts.map((a) => fetchWhopLifetime([a], { signal })));
    if (signal.aborted) return;

    let amount = 0;
    const errors = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') amount += r.value;
      else errors.push(isAccounts[i].label || isAccounts[i].id);
    });

    setState({ status: errors.length === isAccounts.length ? 'error' : 'ready', amount, errors, updatedAt: new Date() });
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal, accounts);
    const id = setInterval(() => load(ctrl.signal, accounts), LIFETIME_REFRESH_MS);
    return () => { ctrl.abort(); clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, load]);

  return state;
}
