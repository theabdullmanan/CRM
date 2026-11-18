import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { logActivity } from './notifications';

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/**
 * `previousStatus` (the client's status before this save, if editing) is only used to decide
 * whether to write a `statusHistory` record — it's never written to the client doc itself.
 * Saving behavior is otherwise identical to before this was added.
 */
export async function saveClient(data, profile, id, previousStatus) {
  const payload = clean({
    name: data.name?.trim(),
    contactName: data.contactName?.trim() || '',
    email: data.email?.trim() || '',
    phone: data.phone?.trim() || '',
    status: data.status || 'active',
    dailyRate: Number(data.dailyRate) || 0,
    csmId: data.csmId || '',
    csmName: data.csmName || '',
    setupFeePaid: Boolean(data.setupFeePaid),
    notes: data.notes || '',
    updatedAt: serverTimestamp(),
  });
  if (id) {
    if (previousStatus && previousStatus !== payload.status) {
      const batch = writeBatch(db);
      batch.update(doc(db, 'clients', id), { ...payload, statusChangedAt: serverTimestamp() });
      batch.set(doc(collection(db, 'statusHistory')), {
        clientId: id,
        csmId: payload.csmId || '',
        fromStatus: previousStatus,
        toStatus: payload.status,
        changedAt: serverTimestamp(),
        changedBy: profile.id,
      });
      await batch.commit();
    } else {
      await updateDoc(doc(db, 'clients', id), payload);
    }
    logActivity(profile, 'client.update', { name: payload.name });
    return id;
  }
  const ref = await addDoc(collection(db, 'clients'), { ...payload, ghlLocationIds: [], createdAt: serverTimestamp(), createdBy: profile.id });
  logActivity(profile, 'client.create', { name: payload.name });
  return ref.id;
}

/** Admin-only linking of GHL sub-accounts (System B) to this CRM client, for the My Clients leads column. */
export const linkGhlLocations = (clientId, ghlLocationIds) =>
  updateDoc(doc(db, 'clients', clientId), { ghlLocationIds, updatedAt: serverTimestamp() });

export async function deleteClient(client) {
  const subs = await getDocs(query(collection(db, 'subAccounts'), where('clientId', '==', client.id)));
  const batch = writeBatch(db);
  subs.forEach((s) => batch.delete(s.ref));
  batch.delete(doc(db, 'clients', client.id));
  await batch.commit();
}

export async function saveSubAccount(data, client, id) {
  const payload = clean({
    clientId: client.id,
    clientName: client.name,
    name: data.name?.trim(),
    accountRef: data.accountRef?.trim() || '',
    market: data.market?.trim() || '',
    status: data.status || 'active',
    notes: data.notes || '',
    updatedAt: serverTimestamp(),
  });
  if (id) return updateDoc(doc(db, 'subAccounts', id), payload);
  return addDoc(collection(db, 'subAccounts'), { ...payload, createdAt: serverTimestamp(), deliveredZipCount: 0, deliveredContacts: 0 });
}

export const deleteSubAccount = (id) => deleteDoc(doc(db, 'subAccounts', id));
