import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { isPreview } from '../lib/preview';
import { useCentralMidnightReset } from './useCentralMidnightReset';

/**
 * Real-time CSM leaderboard: subscribes to today's `csmDailyTotals/{dayKey}` doc (Central time;
 * the subscription itself rolls over automatically at midnight via useCentralMidnightReset) and
 * merges it with every given CSM so $0 CSMs still show up, ranked at the bottom. Ranked highest
 * to lowest, ties broken alphabetically by name.
 */
export function useCsmLeaderboard(csmUsers) {
  const { key: dayKey } = useCentralMidnightReset();
  const [totals, setTotals] = useState({});
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (isPreview) {
      setTotals({});
      setStatus('ready');
      return undefined;
    }
    setStatus((s) => (s === 'ready' || s === 'refreshing' ? 'refreshing' : 'loading'));
    return onSnapshot(
      doc(db, 'csmDailyTotals', dayKey),
      (snap) => {
        const { updatedAt, ...t } = snap.data() || {};
        setTotals(t);
        setStatus('ready');
      },
      () => setStatus('error'),
    );
  }, [dayKey]);

  const rows = csmUsers
    .map((u) => ({ id: u.id, name: u.name, total: totals[u.id]?.total || 0 }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return { status, dayKey, rows };
}
