import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { logActivity } from './notifications';

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export async function saveClient(data, profile, id) {
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
    await updateDoc(doc(db, 'clients', id), payload);
    logActivity(profile, 'client.update', { name: payload.name });
    return id;
  }
  const ref = await addDoc(collection(db, 'clients'), { ...payload, createdAt: serverTimestamp(), createdBy: profile.id });
  logActivity(profile, 'client.create', { name: payload.name });
  return ref.id;
}

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
