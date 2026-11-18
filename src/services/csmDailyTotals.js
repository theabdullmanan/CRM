import {
  collection, doc, getDocs, increment, query, serverTimestamp, setDoc, where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { countsAsSpend } from '../lib/spend';

const COLLECTION = 'csmDailyTotals';

/**
 * Queues one payment's contribution to `csmDailyTotals/{day}` inside `batch`, alongside the
 * payment write itself so both commit atomically. `sign` is +1 for a new payment, -1 to reverse
 * a deleted one. No-op (never throws) for non-spend types (setup_fee) or a client with no CSM —
 * those payments simply don't move the leaderboard.
 */
export function queuePaymentAggregateDelta(batch, { day, type, amount, csmId, csmName }, sign = 1) {
  if (!day || !csmId || !countsAsSpend({ type })) return;
  const delta = sign * (Number(amount) || 0);
  if (!delta) return;
  const ref = doc(db, COLLECTION, day);
  batch.set(ref, { [csmId]: { name: csmName || '', total: increment(delta) }, updatedAt: serverTimestamp() }, { merge: true });
}

/**
 * Authoritative rebuild of `csmDailyTotals/{day}` from the `payments` collection itself, using
 * the same `countsAsSpend` rule as the Revenue page and the `client.csmId` join. Replaces the
 * whole document (not merge) so a CSM who no longer has any qualifying payment that day is
 * correctly dropped, not left stale. Safe to run any time — this is what both the automatic
 * post-bulk-write correction and the admin "Recalculate" button call.
 */
export async function recalculateCsmDailyTotal(day, clients) {
  const clientsById = Object.fromEntries(clients.map((c) => [c.id, c]));
  const snap = await getDocs(query(collection(db, 'payments'), where('day', '==', day)));

  const totals = {};
  snap.forEach((d) => {
    const p = d.data();
    if (!countsAsSpend(p)) return;
    const client = clientsById[p.clientId];
    if (!client?.csmId) return;
    const entry = (totals[client.csmId] ||= { name: client.csmName || '', total: 0 });
    entry.total += Number(p.amount) || 0;
  });

  await setDoc(doc(db, COLLECTION, day), { ...totals, updatedAt: serverTimestamp() });
}
