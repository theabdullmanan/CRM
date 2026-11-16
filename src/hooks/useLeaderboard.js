import { useMemo } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toDate } from '../lib/utils';
import { LEADERBOARD_DEFAULTS, senderKeyOf } from '../lib/leaderboard';
import { useCollection } from './useFirestore';
import { useBusinessDayWindow } from './useBusinessDayWindow';

// Preview mode (no Firebase): a small sample board so the screens can be reviewed.
const PREVIEW_SENDERS = ['Maria Lopez', 'Daniel Brooks', 'Aisha Khan', 'Tyler Reed', 'Sofia Nguyen', 'Marcus Hill', 'Priya Das']
  .map((name, i) => ({ id: `ps${i}`, userId: `ps${i}`, name, matchName: name, active: true, target: i === 2 ? 45 : null }));
function previewDays(startKey, todayKey) {
  const now = Date.now();
  const counts = [33, 27, 27, 19, 12, 4, 0];
  const mins = [3, 9, 41, 75, 140, 220, 0];
  return [{
    id: todayKey, day: todayKey >= startKey ? todayKey : startKey,
    counts: Object.fromEntries(PREVIEW_SENDERS.map((s, i) => [senderKeyOf(s.matchName), counts[i]]).filter(([, n]) => n)),
    last: Object.fromEntries(PREVIEW_SENDERS.map((s, i) => [senderKeyOf(s.matchName), new Date(now - mins[i] * 60000)]).filter((_, i) => counts[i])),
    names: { s_jamie_ortiz: 'Jamie Ortiz' },
  }, { id: 'unmatched', day: todayKey, counts: { s_jamie_ortiz: 6 }, last: { s_jamie_ortiz: new Date(now - 20 * 60000) }, names: { s_jamie_ortiz: 'Jamie Ortiz' } }];
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
    () => previewDays(startKey, todayKey),
  );
  const adjustments = useCollection(
    () => query(collection(db, 'leadAdjustments'), where('day', '>=', startKey)),
    [startKey],
    () => [],
  );
  const senders = useCollection(() => collection(db, 'leaderboardSenders'), [], () => PREVIEW_SENDERS);
  const settingsDocs = useCollection(() => collection(db, 'leaderboardSettings'), [], () => []);

  const result = useMemo(() => {
    const settings = { ...LEADERBOARD_DEFAULTS, ...(settingsDocs.data.find((d) => d.id === 'config') || {}) };
    settings.defaultTarget = Number(settings.defaultTarget) || LEADERBOARD_DEFAULTS.defaultTarget;
    settings.idleMinutes = Number(settings.idleMinutes) || LEADERBOARD_DEFAULTS.idleMinutes;

    // Totals per GHL sender key across the range (future days can't exist, but are ignored anyway).
    const agg = new Map();
    days.data.filter((d) => d.day >= startKey && d.day <= todayKey).forEach((d) => {
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

    const rows = senders.data
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
      })
      // Most leads first. Same count: whoever reached it first (earlier last lead) ranks higher.
      .sort((a, b) => b.count - a.count
        || (a.last ? a.last.getTime() : Infinity) - (b.last ? b.last.getTime() : Infinity)
        || a.name.localeCompare(b.name))
      .map((r, i) => ({ ...r, rank: i + 1 }));

    const unmatched = [...agg.values()].filter((a) => !owner.has(a.key)).sort((a, b) => b.count - a.count);

    return {
      rows,
      unmatched,
      settings,
      adjustments: adjList,
      senders: senders.data,
      total: rows.reduce((s, r) => s + r.count, 0),
    };
  }, [days.data, adjustments.data, senders.data, settingsDocs.data, startKey, todayKey, span.days]);

  return {
    ...result,
    win,
    span,
    loading: days.loading || senders.loading,
    error: days.error || senders.error || settingsDocs.error || adjustments.error,
  };
}
