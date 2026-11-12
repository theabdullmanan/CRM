import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword, EmailAuthProvider, getAuth, inMemoryPersistence, reauthenticateWithCredential,
  setPersistence, signOut, updatePassword, updateProfile,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { app, auth, db } from '../lib/firebase';
import { ROLES } from '../lib/constants';
import { logActivity, notifyUsers } from './notifications';

/**
 * Admin creates a login for a team member.
 *
 * Firebase signs you in as whoever you create, so the account is made on a short-lived
 * secondary Firebase app with in-memory sessions. The admin's own session is untouched,
 * and the admin then writes the new person's profile (role, department) to Firestore.
 */
export async function createUserAccount({ name, email, password, role, department, jobTitle, phone }, admin) {
  if (!app) throw new Error('Preview mode — connect Firebase to create accounts.');
  const secondary = initializeApp(app.options, `user-creator-${Date.now()}`);
  const tempAuth = getAuth(secondary);
  await setPersistence(tempAuth, inMemoryPersistence);
  try {
    const cred = await createUserWithEmailAndPassword(tempAuth, email.trim(), password);
    await updateProfile(cred.user, { displayName: name.trim() });
    try {
      await setDoc(doc(db, 'users', cred.user.uid), {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        active: true,
        department: department || '',
        jobTitle: jobTitle?.trim() || '',
        phone: phone?.trim() || '',
        mustChangePassword: true,
        createdBy: admin.id,
        createdByName: admin.name,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      // Don't leave a login without a profile behind.
      await cred.user.delete().catch(() => {});
      throw e;
    }
    await notifyUsers([cred.user.uid], {
      title: `Welcome to the CRM, ${name.trim().split(' ')[0]}`,
      body: `${admin.name} set you up as ${ROLES[role]?.label || role}. Please change your password from My account.`,
      link: '/account',
      type: 'info',
    }).catch(() => {});
    logActivity(admin, 'user.create', { name: name.trim(), role });
    return cred.user.uid;
  } finally {
    await signOut(tempAuth).catch(() => {});
    await deleteApp(secondary).catch(() => {});
  }
}

/** Signed-in user changes their own password (Firebase requires the current one first). */
export async function changeMyPassword(currentPassword, newPassword) {
  const u = auth?.currentUser;
  if (!u) throw new Error('Preview mode — connect Firebase to change passwords.');
  await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, currentPassword));
  await updatePassword(u, newPassword);
  await updateDoc(doc(db, 'users', u.uid), { mustChangePassword: false, passwordChangedAt: serverTimestamp() });
}

export async function updateMyProfile(uid, { name, phone }) {
  if (!db) throw new Error('Preview mode — connect Firebase to save changes.');
  await updateDoc(doc(db, 'users', uid), { name: name.trim(), phone: phone?.trim() || '' });
  if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: name.trim() }).catch(() => {});
}

/** Saves (or with null, removes) the signed-in user's profile photo, a small data URL. */
export async function updateMyPhoto(uid, photoURL) {
  if (!db) throw new Error('Preview mode — connect Firebase to save changes.');
  await updateDoc(doc(db, 'users', uid), { photoURL: photoURL || null });
}

/** Strong random password: letters, digits and a symbol, no look-alike characters. */
export function generatePassword(length = 12) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%&*?'];
  const all = sets.join('');
  const rnd = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const chars = sets.map((s) => s[rnd(s.length)]);
  while (chars.length < length) chars.push(all[rnd(all.length)]);
  for (let i = chars.length - 1; i > 0; i -= 1) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

/** 0–4 password strength score with a label. */
export function passwordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score += 1;
  return { score, label: ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][score] };
}
