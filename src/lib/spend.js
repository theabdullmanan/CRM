import { format, subDays, startOfDay } from 'date-fns';
import { PAYMENT_TYPES } from './constants';
import { toDate } from './utils';

export const dayKey = (d) => format(d, 'yyyy-MM-dd');

/** Only recurring spend counts. The one-time setup fee is always excluded. */
export const countsAsSpend = (p) => PAYMENT_TYPES[p.type]?.countsAsSpend ?? false;

/**
 * Computes spend windows from payment docs.
 *  - today:    payments dated today
 *  - week:     last 7 days including today
 *  - d30:      last 30 days including today
 *  - lifetime: everything
 */
export function computeSpend(payments, now = new Date()) {
  const today = dayKey(now);
  const yesterday = dayKey(subDays(now, 1));
  const weekStart = startOfDay(subDays(now, 6));
  const prevWeekStart = startOfDay(subDays(now, 13));
  const d30Start = startOfDay(subDays(now, 29));
  const prevD30Start = startOfDay(subDays(now, 59));

  // prev* hold the equivalent previous period, used for % change.
  const totals = { today: 0, week: 0, d30: 0, lifetime: 0, setupFees: 0, yesterday: 0, prevWeek: 0, prevD30: 0 };
  const byClient = {};
  const byDay = {};

  for (const p of payments) {
    const amount = Number(p.amount) || 0;
    if (!countsAsSpend(p)) {
      if (p.type === 'setup_fee') totals.setupFees += amount;
      continue;
    }
    const date = toDate(p.date);
    if (!date) continue;
    const key = p.day || dayKey(date);

    const c = (byClient[p.clientId] ||= {
      clientId: p.clientId,
      clientName: p.clientName,
      today: 0, week: 0, d30: 0, lifetime: 0, prevWeek: 0, prevD30: 0, byDay: {},
      days: new Set(), first: date, last: date,
    });
    c.lifetime += amount;
    totals.lifetime += amount;
    c.days.add(key);
    if (date < c.first) c.first = date;
    if (date > c.last) c.last = date;
    if (key === today) { c.today += amount; totals.today += amount; }
    if (date >= weekStart) { c.week += amount; totals.week += amount; }
    if (date >= d30Start) { c.d30 += amount; totals.d30 += amount; }
    if (key === yesterday) totals.yesterday += amount;
    if (date >= prevWeekStart && date < weekStart) { c.prevWeek += amount; totals.prevWeek += amount; }
    if (date >= prevD30Start && date < d30Start) { c.prevD30 += amount; totals.prevD30 += amount; }

    byDay[key] = (byDay[key] || 0) + amount;
    c.byDay[key] = (c.byDay[key] || 0) + amount;
  }

  const clients = Object.values(byClient).map((c) => ({
    ...c,
    activeDays: c.days.size,
    avgDaily: c.days.size ? c.lifetime / c.days.size : 0,
  }));

  return { totals, clients, byDay };
}

export function dailySeries(byDay, days = 30, now = new Date()) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = subDays(now, i);
    const k = dayKey(d);
    out.push({ day: k, label: format(d, 'MMM d'), spend: byDay[k] || 0 });
  }
  return out;
}

/** Percent change from `prev` to `cur`; null when there is no base to compare against. */
export function pctChange(cur, prev) {
  if (!prev) return cur ? null : 0;
  return ((cur - prev) / prev) * 100;
}

/**
 * Groups a daily series into OHLC candles of `size` days (oldest first).
 * open = first day's spend, close = last day's, high/low = extremes inside the bucket.
 */
export function toCandles(series, size = 7) {
  const out = [];
  const start = series.length % size; // align so the last candle ends today
  for (let i = start; i < series.length; i += size) {
    const chunk = series.slice(i, i + size);
    const vals = chunk.map((d) => d.spend);
    const open = vals[0];
    const close = vals[vals.length - 1];
    const low = Math.min(...vals);
    const high = Math.max(...vals);
    out.push({
      label: chunk.length > 1 ? `${chunk[0].label} – ${chunk[chunk.length - 1].label}` : chunk[0].label,
      short: chunk[chunk.length - 1].label,
      open, close, high, low,
      total: vals.reduce((a, b) => a + b, 0),
      range: [low, high],
      up: close >= open,
    });
  }
  return out;
}

/** Adds day-over-day change and a 7-day moving average to a daily series. */
export function withChange(series) {
  return series.map((d, i) => {
    const prev = i ? series[i - 1].spend : d.spend;
    const win = series.slice(Math.max(0, i - 6), i + 1);
    return { ...d, prev, change: d.spend - prev, up: d.spend >= prev, ma7: win.reduce((s, x) => s + x.spend, 0) / win.length };
  });
}
