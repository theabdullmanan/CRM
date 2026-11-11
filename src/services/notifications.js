import { addDoc, collection, getDocs, query, serverTimestamp, where, writeBatch, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

/** Sends one in-app notification to each user id. */
export async function notifyUsers(userIds, { title, body = '', link = '', type = 'info' }) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  const batch = writeBatch(db);
  ids.forEach((userId) => {
    batch.set(doc(collection(db, 'notifications')), {
      userId, title, body, link, type, read: false, createdAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

/** Sends a notification to every active user holding one of the given roles. */
export async function notifyRoles(roles, payload, { exclude = [] } = {}) {
  const snap = await getDocs(query(collection(db, 'users'), where('role', 'in', roles)));
  const ids = snap.docs
    .filter((d) => d.data().active && !exclude.includes(d.id))
    .map((d) => d.id);
  await notifyUsers(ids, payload);
}

export async function logActivity(profile, action, details = {}) {
  if (!profile) return;
  try {
    await addDoc(collection(db, 'activity'), {
      userId: profile.id,
      userName: profile.name,
      action,
      details,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('activity log failed', e);
  }
}
