/**
 * Business-day windows for the Senders Leaderboard, always in America/Chicago (CST/CDT),
 * whatever the viewer's own timezone is.
 *
 *  - Mon–Fri: a business day starts at 8:00 AM Central
 *  - Saturday: starts at 9:00 AM Central
 *  - Sunday is not a business day: until Monday 8:00 AM everything belongs to Saturday
 *  - Before the day's start hour, time belongs to the previous business day
 *    (so Monday 7:59 AM is still Saturday, and the 1st before 8 AM is still last month)
 *
 * The same rules are used by n8n to pick the `leadDailyCounts/{businessDayKey}` document
 * (see docs/leaderboard-n8n.md). Keep both in step if the hours ever change.
 */
import { TZDate } from '@date-fns/tz';

export const BUSINESS_TZ = 'America/Chicago';

/** Start hour (Central) for a weekday 0 = Sunday … 6 = Saturday; null = not a business day. */
export const startHourFor = (dow) => (dow === 0 ? null : dow === 6 ? 9 : 8);

const pad = (n) => String(n).padStart(2, '0');

// Plain calendar dates as [year, monthIndex, day]. Shifting uses UTC so DST can't skew it.
const shift = ([y, m, d], days) => {
  const t = new Date(Date.UTC(y, m, d + days));
  return [t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()];
};
const dowOf = ([y, m, d]) => new Date(Date.UTC(y, m, d)).getUTCDay();
const keyOf = ([y, m, d]) => `${y}-${pad(m + 1)}-${pad(d)}`;
/** The real instant of a Central wall-clock time on that date (handles CST/CDT). */
const startOf = (date) => new Date(new TZDate(date[0], date[1], date[2], startHourFor(dowOf(date)), 0, 0, 0, BUSINESS_TZ).getTime());

/** Next business date after `date` (skips Sunday). */
const nextBusinessDate = (date) => {
  let n = shift(date, 1);
  while (startHourFor(dowOf(n)) === null) n = shift(n, 1);
  return n;
};

/** Calendar date of the business day that `at` belongs to. */
function businessDateOf(at) {
  const c = new TZDate(at.getTime(), BUSINESS_TZ);
  let date = [c.getFullYear(), c.getMonth(), c.getDate()];
  const minutes = c.getHours() * 60 + c.getMinutes();
  const h = startHourFor(dowOf(date));
  // Today counts only once its start hour has passed; otherwise walk back to the last business day.
  if (h === null || minutes < h * 60) {
    do date = shift(date, -1); while (startHourFor(dowOf(date)) === null);
  }
  return date;
}

/** Number of business days (Mon–Sat) from `from` to `to`, both included. */
function businessDaysBetween(from, to) {
  let n = 0;
  for (let d = from; keyOf(d) <= keyOf(to); d = shift(d, 1)) if (startHourFor(dowOf(d)) !== null) n += 1;
  return n;
}

/** businessDayKey ('YYYY-MM-DD', the date the business day started on) for any instant. */
export const businessDayKey = (at = new Date()) => keyOf(businessDateOf(at));

/**
 * All three leaderboard windows for `now`.
 * Each has { start (Date), startKey, days (business days started so far) };
 * `today` also has `end`, the moment the next business day starts (when the board resets).
 */
export function leaderboardWindows(now = new Date()) {
  const today = businessDateOf(now);
  const dow = dowOf(today);

  const monday = shift(today, -(dow - 1)); // today is Mon..Sat, so this is that week's Monday
  let first = [today[0], today[1], 1];
  while (startHourFor(dowOf(first)) === null) first = shift(first, 1);

  return {
    todayKey: keyOf(today),
    today: { start: startOf(today), end: startOf(nextBusinessDate(today)), startKey: keyOf(today), days: 1 },
    week: { start: startOf(monday), startKey: keyOf(monday), days: businessDaysBetween(monday, today) },
    month: { start: startOf(first), startKey: keyOf(first), days: businessDaysBetween(first, today) },
  };
}

/** Current time in Central as a readable clock, e.g. "2:07:31 PM". */
export const centralClock = (at = new Date(), opts = {}) =>
  at.toLocaleTimeString('en-US', { timeZone: BUSINESS_TZ, hour: 'numeric', minute: '2-digit', ...opts });

export const centralDate = (at = new Date()) =>
  at.toLocaleDateString('en-US', { timeZone: BUSINESS_TZ, weekday: 'long', month: 'long', day: 'numeric' });
