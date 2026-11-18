import { useCallback, useEffect, useState } from 'react';
import { fetchWhopLifetime, fetchWhopSpend } from '../lib/whop';

const REFRESH_MS = 3 * 60 * 1000;
const LIFETIME_REFRESH_MS = 10 * 60 * 1000;
const EMPTY_TOTALS = { today: 0, yesterday: 0, week: 0, prevWeek: 0, d30: 0, prevD30: 0 };

const SPEND_CACHE_KEY = 'whop:spend:v1';
const LIFETIME_CACHE_KEY = 'whop:lifetime:v1';

const SPEND_DEFAULT = { status: 'idle', totals: EMPTY_TOTALS, byDay: {}, byCustomerD30: {}, transactions: [], errors: [], updatedAt: null };
const LIFETIME_DEFAULT = { status: 'idle', amount: 0, errors: [], updatedAt: null };

/**
 * Last-known-good snapshot of a Whop hook's state, kept in localStorage so the next time this
 * page opens (or a fresh tab loads it) we can paint real numbers immediately instead of a
 * loading placeholder, while a background refresh confirms the live figures.
 *
 * Merged onto `fallback` (never trusted as-is) so a cache written by an older build of this
 * hook — missing a field a newer build expects — can't crash the page it's meant to speed up.
 */
function readCache(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.updatedAt) return fallback;
    return { ...fallback, ...parsed, updatedAt: new Date(parsed.updatedAt) };
  } catch {
    return fallback;
  }
}

function writeCache(key, state) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Private browsing / quota exceeded — the cache is a nice-to-have, not required.
  }
}

function clearCache(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Fetches live payments straight from Whop for every given account, merges the totals,
 * and refreshes in the background every few minutes. Each account is fetched separately
 * so one revoked/bad key doesn't blank out the others — it's just reported in `errors`.
 *
 * `accountsLoading` should be true while the caller is still resolving which accounts exist
 * (e.g. its own Firestore query hasn't returned yet) — this hook waits for it to go false
 * before fetching, so an empty `accounts` array passed in during that window doesn't get
 * mistaken for "no Whop accounts configured" and wipe out the cached figures below.
 */
export function useWhopSpend(accounts, accountsLoading) {
  const [state, setState] = useState(() => readCache(SPEND_CACHE_KEY, SPEND_DEFAULT));
  const key = accounts.map((a) => a.id).sort().join(',');

  const load = useCallback(async (signal, isAccounts) => {
    if (!isAccounts.length) {
      setState({ ...SPEND_DEFAULT, status: 'empty' });
      clearCache(SPEND_CACHE_KEY);
      return;
    }
    setState((s) => ({ ...s, status: s.updatedAt ? 'refreshing' : 'loading' }));

    const results = await Promise.allSettled(isAccounts.map((a) => fetchWhopSpend([a], { signal })));
    if (signal.aborted) return;

    const totals = { ...EMPTY_TOTALS };
    const byDay = {};
    const byCustomerD30 = {};
    const transactions = [];
    const errors = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        for (const k of Object.keys(totals)) totals[k] += r.value.totals[k];
        for (const [d, v] of Object.entries(r.value.byDay)) byDay[d] = (byDay[d] || 0) + v;
        for (const [who, v] of Object.entries(r.value.byCustomerD30)) byCustomerD30[who] = (byCustomerD30[who] || 0) + v;
        for (const tx of r.value.transactions) transactions.push({ ...tx, accountLabel: isAccounts[i].label });
      } else {
        errors.push(isAccounts[i].label || isAccounts[i].id);
      }
    });
    transactions.sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));

    const next = {
      status: errors.length === isAccounts.length ? 'error' : 'ready',
      totals, byDay, byCustomerD30, transactions, errors, updatedAt: new Date(),
    };
    setState(next);
    if (next.status === 'ready') writeCache(SPEND_CACHE_KEY, next);
  }, []);

  useEffect(() => {
    if (accountsLoading) return undefined;
    const ctrl = new AbortController();
    load(ctrl.signal, accounts);
    const id = setInterval(() => load(ctrl.signal, accounts), REFRESH_MS);
    return () => { ctrl.abort(); clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, accountsLoading, load]);

  return state;
}

/**
 * Lifetime spend across every given account, via Whop's aggregate stats endpoint (cheap — no
 * payment-by-payment pagination). Refreshes less often than useWhopSpend since it rarely swings.
 * See useWhopSpend above for why `accountsLoading` matters.
 */
export function useWhopLifetime(accounts, accountsLoading) {
  const [state, setState] = useState(() => readCache(LIFETIME_CACHE_KEY, LIFETIME_DEFAULT));
  const key = accounts.map((a) => a.id).sort().join(',');

  const load = useCallback(async (signal, isAccounts) => {
    if (!isAccounts.length) {
      setState({ ...LIFETIME_DEFAULT, status: 'empty' });
      clearCache(LIFETIME_CACHE_KEY);
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

    const next = { status: errors.length === isAccounts.length ? 'error' : 'ready', amount, errors, updatedAt: new Date() };
    setState(next);
    if (next.status === 'ready') writeCache(LIFETIME_CACHE_KEY, next);
  }, []);

  useEffect(() => {
    if (accountsLoading) return undefined;
    const ctrl = new AbortController();
    load(ctrl.signal, accounts);
    const id = setInterval(() => load(ctrl.signal, accounts), LIFETIME_REFRESH_MS);
    return () => { ctrl.abort(); clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, accountsLoading, load]);

  return state;
}
