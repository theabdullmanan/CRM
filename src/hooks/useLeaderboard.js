import { useMemo } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toDate } from '../lib/utils';
import { LEADERBOARD_DEFAULTS, senderKeyOf } from '../lib/leaderboard';
import { useCollection } from './useFirestore';
import { useBusinessDayWindow } from './useBusinessDayWindow';
import { useAgency } from './useAgency';

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/**
 * Lead counts per sender from n8n's `dashboard/latest` (one row per client with its `sender`).
 * Prefers the GHL counts (ghlLeadsToday / ThisWeek / ThisMonth) and falls back to the status-sheet
 * counts (leadsPerDay = today, leads7d = last 7 days) while the GHL node isn't filling them.
 */
/** Leads for one client row in a range. `n` is null when n8n has no number for it; `fallback` = status-sheet value. */
export function clientLeads(r, range) {
  if (range === 'today') {
    const g = num(r.ghlLeadsToday);
    return g !== null ? { n: g, fallback: false } : { n: num(r.leadsPerDay), fallback: num(r.leadsPerDay) !== null };
  }
  if (range === 'week') {
    const g = num(r.ghlLeadsThisWeek);
    return g !== null ? { n: g, fallback: false } : { n: num(r.leads7d), fallback: num(r.leads7d) !== null };
  }
  return { n: num(r.ghlLeadsThisMonth), fallback: false };
}

function dashboardCounts(rows, range) {
  const agg = new Map();
  let fallback = false;
  let all = 0;
  let available = false; // true once any client has a real number for this range
  rows.forEach((r) => {
    const name = String(r.sender || '').trim();
    const c = clientLeads(r, range);
    const { n } = c;
    if (c.fallback) fallback = true;
    if (n !== null) available = true;
    all += n || 0;
    if (!name) return; // counted in the overall total, but no sender to credit
    const key = senderKeyOf(name);
    const a = agg.get(key) || { key, count: 0, last: null, name };
    a.count += n || 0;
    const last = toDate(r.lastLeadAt);
    if (last && (!a.last || last > a.last)) a.last = last;
    agg.set(key, a);
  });
  return { agg, fallback, all, available };
}

/** Every GHL name key that belongs to a sender: their matchName plus any linked aliases. */
export const senderKeys = (s) => [s.matchName || s.name, ...(s.aliases || [])].filter(Boolean).map(senderKeyOf);

/**
 * Live leaderboard for 'today' | 'week' | 'month'.
 * Reads per view: the per-business-day count docs in range (1 for Today, ≤ 6 for a week, ≤ 27 for
 * a month), the adjustments in range, the sender list and the settings doc. One listener each,
 * never one per sender, so it stays well inside the Spark plan's free reads.
 */
export function useLeaderboard(range = 'today') {
  const win = useBusinessDayWindow();
  const span = win[range] || win.today;
  const { startKey } = span;
  const { todayKey } = win;

  const days = useCollection(
    () => query(collection(db, 'leadDailyCounts'), where('day', '>=', startKey)),
    [startKey],
    () => [],
  );
  const adjustments = useCollection(
    () => query(collection(db, 'leadAdjustments'), where('day', '>=', startKey)),
    [startKey],
    () => [],
  );
  const senders = useCollection(() => collection(db, 'leaderboardSenders'), [], () => []);
  const settingsDocs = useCollection(() => collection(db, 'leaderboardSettings'), [], () => []);
  const agency = useAgency();

  const result = useMemo(() => {
    const settings = { ...LEADERBOARD_DEFAULTS, ...(settingsDocs.data.find((d) => d.id === 'config') || {}) };
    settings.defaultTarget = Number(settings.defaultTarget) || LEADERBOARD_DEFAULTS.defaultTarget;
    settings.idleMinutes = Number(settings.idleMinutes) || LEADERBOARD_DEFAULTS.idleMinutes;

    // Source 1: per-lead events written by n8n (leadDailyCounts). Used whenever any exist in range.
    // Source 2: lead counts per client in dashboard/latest, credited to that client's sender.
    const inRange = days.data.filter((d) => d.day >= startKey && d.day <= todayKey);
    const hasEvents = inRange.some((d) => Object.keys(d.counts || {}).length > 0);
    let agg = new Map();
    let source = 'events';
    let fallback = false;
    let allLeads = null;
    let available = hasEvents;
    if (!hasEvents && agency.rows?.length) {
      ({ agg, fallback, all: allLeads, available } = dashboardCounts(agency.rows, range));
      source = 'dashboard';
    }
    inRange.filter(() => source === 'events').forEach((d) => {
      Object.entries(d.counts || {}).forEach(([key, n]) => {
        const a = agg.get(key) || { key, count: 0, last: null, name: '' };
        a.count += Number(n) || 0;
        const last = toDate(d.last?.[key]);
        if (last && (!a.last || last > a.last)) a.last = last;
        a.name = d.names?.[key] || a.name;
        agg.set(key, a);
      });
    });

    const adjBySender = {};
    const adjList = adjustments.data
      .filter((a) => a.day >= startKey && a.day <= todayKey)
      .sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0));
    adjList.forEach((a) => { adjBySender[a.senderId] = (adjBySender[a.senderId] || 0) + (Number(a.delta) || 0); });

    const owner = new Map();
    senders.data.forEach((s) => senderKeys(s).forEach((k) => { if (!owner.has(k)) owner.set(k, s); }));

    const linked = senders.data
      .filter((s) => s.active !== false)
      .map((s) => {
        let sent = 0;
        let last = null;
        senderKeys(s).forEach((k) => {
          const a = agg.get(k);
          if (owner.get(k) !== s || !a) return;
          sent += a.count;
          if (a.last && (!last || a.last > last)) last = a.last;
        });
        const adjusted = adjBySender[s.id] || 0;
        const count = Math.max(0, sent + adjusted);
        const target = Number(s.target) || settings.defaultTarget;
        const goal = target * span.days;
        return { ...s, count, sent, adjusted, last, target, goal, pct: goal ? Math.round((count / goal) * 100) : 0, hit: goal > 0 && count >= goal };
      });

    const unmatched = [...agg.values()].filter((a) => !owner.has(a.key)).sort((a, b) => b.count - a.count);

    // Real GHL sender names nobody has linked in Settings yet are still shown on the board
    // (no photo/custom target), alongside the linked senders — never dropped just because
    // they haven't been set up, and never replacing a sender someone already linked.
    const unlinked = unmatched.length > 0;
    const unlinkedRows = unmatched.map((a) => {
      const target = settings.defaultTarget;
      const goal = target * span.days;
      const count = Math.max(0, a.count);
      return {
        id: a.key, name: a.name || a.key, userId: null, active: true, unlinked: true,
        count, sent: count, adjusted: 0, last: a.last, target, goal,
        pct: goal ? Math.round((count / goal) * 100) : 0, hit: goal > 0 && count >= goal,
      };
    });

    const rows = [...linked, ...unlinkedRows]
      // Most leads first. Same count: whoever reached it first (earlier last lead) ranks higher.
      .sort((a, b) => b.count - a.count
        || (a.last ? a.last.getTime() : Infinity) - (b.last ? b.last.getTime() : Infinity)
        || String(a.name || '').localeCompare(String(b.name || '')))
      .map((r, i) => ({ ...r, rank: i + 1 }));

    return {
      rows,
      unmatched,
      unlinked,
      source,
      fallback,
      dataUpdatedAt: source === 'dashboard' ? agency.updatedAt : null,
      settings,
      adjustments: adjList,
      senders: senders.data,
      total: rows.reduce((s, r) => s + r.count, 0),
      // Every lead in range: linked senders, unmatched names and clients with no sender, plus corrections.
      // null = n8n has no lead numbers for this range, so show "—" instead of a misleading total.
      available,
      overall: !available ? null : Math.max(0, (allLeads ?? [...agg.values()].reduce((s, a) => s + a.count, 0))
        + adjList.reduce((s, a) => s + (Number(a.delta) || 0), 0)),
    };
  }, [days.data, adjustments.data, senders.data, settingsDocs.data, agency.rows, agency.updatedAt, range, startKey, todayKey, span.days]);

  const agencyLoading = agency.status === 'idle' || agency.status === 'loading';
  return {
    ...result,
    win,
    span,
    loading: days.loading || senders.loading || (agencyLoading && !days.data.length),
    // leadDailyCounts may be missing or blocked; that's fine while the dashboard data loads.
    error: senders.error || settingsDocs.error || adjustments.error
      || (result.source === 'events' && days.error && agency.status === 'error' ? days.error : null),
  };
}
