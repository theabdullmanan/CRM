/**
 * Plain midnight-to-midnight America/Chicago (CST/CDT) day boundary, for the CSM Leaderboard's
 * daily reset. Deliberately separate from businessDay.js's 8am/9am "business day" window used by
 * the Senders Leaderboard — different feature, different boundary. Don't merge them; n8n also
 * depends on businessDay.js's exact hours (see its own doc comment), which must stay untouched.
 */
import { TZDate } from '@date-fns/tz';
import { BUSINESS_TZ } from './businessDay';

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** 'YYYY-MM-DD' for the Central calendar day containing `at`. */
export function centralDayKey(at = new Date()) {
  const c = new TZDate(at.getTime(), BUSINESS_TZ);
  return keyOf(c.getFullYear(), c.getMonth(), c.getDate());
}

/**
 * Today's Central midnight-to-midnight window: `{ key, start, end }`. `end` is the exact instant
 * of the next reset. Built from wall-clock year/month/day via TZDate, so it's correct across the
 * CST/CDT transition (never off by an hour on the two days a year that matters).
 */
export function centralMidnightWindow(now = new Date()) {
  const c = new TZDate(now.getTime(), BUSINESS_TZ);
  const y = c.getFullYear();
  const m = c.getMonth();
  const d = c.getDate();
  const start = new Date(new TZDate(y, m, d, 0, 0, 0, 0, BUSINESS_TZ).getTime());
  const end = new Date(new TZDate(y, m, d + 1, 0, 0, 0, 0, BUSINESS_TZ).getTime());
  return { key: keyOf(y, m, d), start, end };
}
