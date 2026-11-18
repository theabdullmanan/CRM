import {
  collection, doc, getDoc, serverTimestamp, Timestamp, writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { countsAsSpend, dayKey } from '../lib/spend';
import { toDate } from '../lib/utils';
import { logActivity } from './notifications';
import { queuePaymentAggregateDelta, recalculateCsmDailyTotal } from './csmDailyTotals';

const atNoon = (d) => {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return x;
};

export async function addPayment({ client, subAccount, amount, date, type, note }, profile) {
  const d = atNoon(date);
  const day = dayKey(d);
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'payments')), {
    clientId: client.id,
    clientName: client.name,
    subAccountId: subAccount?.id || null,
    subAccountName: subAccount?.name || null,
    amount: Number(amount),
    type,
    note: note || '',
    date: Timestamp.fromDate(d),
    day,
    createdBy: profile.id,
    createdByName: profile.name,
    createdAt: serverTimestamp(),
  });
  queuePaymentAggregateDelta(batch, { day, type, amount: Number(amount), csmId: client.csmId, csmName: client.csmName }, 1);
  await batch.commit();
  logActivity(profile, 'payment.add', { client: client.name, amount: Number(amount), type });
}

/**
 * Deletes one payment and, if it counted toward a CSM's daily total, reverses that contribution
 * on the day the payment itself belongs to (`p.day`) — not today, since a payment can be deleted
 * long after the day it was recorded for.
 */
export async function deletePayment(p) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'payments', p.id));
  if (countsAsSpend(p) && p.clientId) {
    const clientSnap = await getDoc(doc(db, 'clients', p.clientId));
    const client = clientSnap.exists() ? clientSnap.data() : null;
    const day = p.day || dayKey(toDate(p.date) || new Date());
    queuePaymentAggregateDelta(batch, { day, type: p.type, amount: Number(p.amount) || 0, csmId: client?.csmId, csmName: client?.csmName }, -1);
  }
  await batch.commit();
}

/**
 * Logs one day's charge for every active client that has a daily rate.
 * Uses a deterministic doc id so running it twice for the same day never double-counts the
 * payment itself — but re-running WOULD double-count the aggregate's running total, since it's
 * an increment, not a replace. The recalculate pass right after every run is what guarantees
 * `csmDailyTotals/{key}` is exactly right regardless of how many times this gets re-run.
 */
export async function logDailyCharges(clients, date, profile) {
  const d = atNoon(date);
  const key = dayKey(d);
  const eligible = clients.filter((c) => c.status === 'active' && Number(c.dailyRate) > 0);
  for (let i = 0; i < eligible.length; i += 400) {
    const batch = writeBatch(db);
    eligible.slice(i, i + 400).forEach((c) => {
      batch.set(doc(db, 'payments', `auto_${c.id}_${key}`), {
        clientId: c.id,
        clientName: c.name,
        subAccountId: null,
        amount: Number(c.dailyRate),
        type: 'daily',
        note: 'Daily charge (auto)',
        date: Timestamp.fromDate(d),
        day: key,
        createdBy: profile.id,
        createdByName: profile.name,
        createdAt: serverTimestamp(),
      });
      queuePaymentAggregateDelta(batch, { day: key, type: 'daily', amount: Number(c.dailyRate), csmId: c.csmId, csmName: c.csmName }, 1);
    });
    await batch.commit();
  }
  await recalculateCsmDailyTotal(key, clients);
  logActivity(profile, 'payment.daily', { day: key, clients: eligible.length });
  return eligible.length;
}

/**
 * CSV import. Expected columns (case-insensitive): date, client, amount, type (optional), note (optional).
 * `client` may be the client name or id.
 */
export async function importPayments(rows, clients, profile) {
  const byKey = new Map();
  clients.forEach((c) => {
    byKey.set(c.id, c);
    byKey.set(c.name.trim().toLowerCase(), c);
  });
  const ok = [];
  const errors = [];
  rows.forEach((raw, i) => {
    const r = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.trim().toLowerCase(), String(v ?? '').trim()]));
    const client = byKey.get(r.client) || byKey.get((r.client || '').toLowerCase()) || byKey.get((r['client name'] || '').toLowerCase());
    const amount = Number(String(r.amount || '').replace(/[$,]/g, ''));
    const date = new Date(r.date);
    let type = (r.type || 'daily').toLowerCase().replace(/[\s-]+/g, '_');
    if (type.includes('setup') || type.includes('initial')) type = 'setup_fee';
    if (!['daily', 'setup_fee', 'adjustment'].includes(type)) type = 'daily';
    if (!client) errors.push(`Row ${i + 2}: unknown client "${r.client || ''}"`);
    else if (!Number.isFinite(amount)) errors.push(`Row ${i + 2}: invalid amount`);
    else if (Number.isNaN(date.getTime())) errors.push(`Row ${i + 2}: invalid date`);
    else ok.push({ client, amount, date: atNoon(date), type, note: r.note || 'Imported' });
  });

  const touchedDays = new Set();
  for (let i = 0; i < ok.length; i += 400) {
    const batch = writeBatch(db);
    ok.slice(i, i + 400).forEach((p) => {
      const day = dayKey(p.date);
      batch.set(doc(collection(db, 'payments')), {
        clientId: p.client.id,
        clientName: p.client.name,
        subAccountId: null,
        amount: p.amount,
        type: p.type,
        note: p.note,
        date: Timestamp.fromDate(p.date),
        day,
        createdBy: profile.id,
        createdByName: profile.name,
        createdAt: serverTimestamp(),
      });
      queuePaymentAggregateDelta(batch, { day, type: p.type, amount: p.amount, csmId: p.client.csmId, csmName: p.client.csmName }, 1);
      touchedDays.add(day);
    });
    await batch.commit();
  }
  // Same reasoning as logDailyCharges: recalculate every day this import touched, so a re-run
  // (or any mid-batch failure) can never leave csmDailyTotals out of sync with real payments.
  await Promise.all([...touchedDays].map((day) => recalculateCsmDailyTotal(day, clients)));
  if (ok.length) logActivity(profile, 'payment.import', { rows: ok.length });
  return { imported: ok.length, errors };
}
