import { startOfDay, subDays } from 'date-fns';
import { dayKey } from './spend';

const WHOP_PAYMENTS_URL = 'https://api.whop.com/api/v1/payments';
const PAGE_SIZE = 100;
const MAX_PAGES = 30; // safety cap: up to 3,000 paid payments per account

const money = (m) => (m ? Number(m.amount) || 0 : 0);
/** What the dashboard counts as "spend": what the customer paid, net of any refund. */
const netAmount = (p) => money(p.amount_charged ?? p.total) - money(p.refunded_amount);

/**
 * Pages through every `paid` payment on one Whop account, newest first, stopping once
 * results fall outside the `sinceDays` window (or the safety cap is hit).
 */
async function fetchAccountPayments(apiKey, sinceDays, signal) {
  const cutoff = startOfDay(subDays(new Date(), sinceDays)).getTime();
  const out = [];
  let after;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(WHOP_PAYMENTS_URL);
    url.searchParams.set('first', String(PAGE_SIZE));
    url.searchParams.append('statuses[]', 'paid');
    url.searchParams.set('order', 'paid_at');
    url.searchParams.set('direction', 'desc');
    if (after) url.searchParams.set('after', after);

    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal });
    if (!res.ok) throw new Error(`Whop API responded ${res.status}`);
    // eslint-disable-next-line no-await-in-loop
    const body = await res.json();
    const rows = body.data || [];
    out.push(...rows);

    const last = rows[rows.length - 1];
    const lastPaidAt = last?.paid_at ? new Date(last.paid_at).getTime() : null;
    if (!rows.length || !body.page_info?.has_next_page || (lastPaidAt != null && lastPaidAt < cutoff)) break;
    after = body.page_info.end_cursor;
  }
  return out.filter((p) => p.paid_at && new Date(p.paid_at).getTime() >= cutoff);
}

/**
 * Fetches live payments from every given Whop account ({ id, label, apiKey }), merges them,
 * and returns spend totals (today / yesterday / last 7 / prior 7 / last 30 / prior 30) plus a
 * day => amount map for the last 30 days, ready for dailySeries() from lib/spend.
 */
export async function fetchWhopSpend(accounts, { now = new Date(), signal } = {}) {
  const lists = await Promise.all(accounts.map((a) => fetchAccountPayments(a.apiKey, 60, signal)));
  const payments = lists.flat();

  const today = dayKey(now);
  const yesterday = dayKey(subDays(now, 1));
  const weekStart = startOfDay(subDays(now, 6)).getTime();
  const prevWeekStart = startOfDay(subDays(now, 13)).getTime();
  const d30Start = startOfDay(subDays(now, 29)).getTime();
  const prevD30Start = startOfDay(subDays(now, 59)).getTime();

  const totals = { today: 0, yesterday: 0, week: 0, prevWeek: 0, d30: 0, prevD30: 0 };
  const byDay = {};
  const byCustomerD30 = {}; // Whop member/customer id => their net spend in the last 30 days

  for (const p of payments) {
    const amount = netAmount(p);
    const date = new Date(p.paid_at);
    const t = date.getTime();
    const key = dayKey(date);
    if (key === today) totals.today += amount;
    if (key === yesterday) totals.yesterday += amount;
    if (t >= weekStart) totals.week += amount;
    if (t >= prevWeekStart && t < weekStart) totals.prevWeek += amount;
    if (t >= d30Start) {
      totals.d30 += amount;
      byDay[key] = (byDay[key] || 0) + amount;
      const who = p.member_id || p.user?.id || p.customer_email || p.id;
      byCustomerD30[who] = (byCustomerD30[who] || 0) + amount;
    }
    if (t >= prevD30Start && t < d30Start) totals.prevD30 += amount;
  }

  return { totals, byDay, byCustomerD30, count: payments.length };
}

// Far enough back to predate any Whop account; the API just returns zero-value points before it existed.
const LIFETIME_START = '2015-01-01';

/**
 * Lifetime spend, net of refunds, per account — via Whop's own aggregate stats endpoint
 * instead of paginating every payment the account has ever taken (could be tens of thousands).
 * gross_revenue = charged before refunds/fees; total_refunded = refunds. Their difference matches
 * the same "what the customer actually paid, net of refunds" semantics as fetchWhopSpend above.
 */
async function fetchAccountLifetime(account, signal) {
  const to = dayKey(new Date());
  const points = async (metric) => {
    const url = new URL(`https://api.whop.com/api/v1/stats/time_series/${metric}`);
    url.searchParams.set('account_id', account.accountId);
    url.searchParams.set('from', LIFETIME_START);
    url.searchParams.set('to', to);
    url.searchParams.set('interval', 'month');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${account.apiKey}` }, signal });
    if (!res.ok) throw new Error(`Whop stats API responded ${res.status}`);
    const body = await res.json();
    return (body.data?.points || []).reduce((s, p) => s + (p.value || 0), 0);
  };
  const [gross, refunded] = await Promise.all([points('gross_revenue'), points('total_refunded')]);
  return gross - refunded;
}

/** Looks up each account's Whop business id (needed by the stats endpoint) from one recent payment. */
async function resolveAccountId(apiKey, signal) {
  const url = new URL(WHOP_PAYMENTS_URL);
  url.searchParams.set('first', '1');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal });
  if (!res.ok) throw new Error(`Whop API responded ${res.status}`);
  const body = await res.json();
  const id = body.data?.[0]?.account_id;
  if (!id) throw new Error('Could not resolve this account’s Whop business id');
  return id;
}

/** Lifetime spend merged across every given account. */
export async function fetchWhopLifetime(accounts, { signal } = {}) {
  const totals = await Promise.all(accounts.map(async (a) => {
    const accountId = await resolveAccountId(a.apiKey, signal);
    return fetchAccountLifetime({ ...a, accountId }, signal);
  }));
  return totals.reduce((s, v) => s + v, 0);
}
