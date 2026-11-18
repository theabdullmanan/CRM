import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword, EmailAuthProvider, getAuth, inMemoryPersistence, reauthenticateWithCredential,
  setPersistence, signOut, updatePassword, updateProfile,
} from 'firebase/auth';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { app, auth, db } from '../lib/firebase';
import { ROLES } from '../lib/constants';
import { logActivity, notifyUsers } from './notifications';

const WELCOME_WEBHOOK = 'https://server.whitestonemedia.cloud/webhook/Crm-Welcome';
const LEADERBOARD_LINK = 'https://crm-eight-plum-85.vercel.app/leaderboard';

/**
 * Tells n8n a new login was created, so it can send its own welcome message.
 * Sends the new person's name, email, their starting password and the Leaderboard link —
 * nothing else. The password is the one just set for their account (never the admin's own).
 * Never blocks or fails account creation: a webhook hiccup is logged, not thrown.
 */
async function notifyWelcomeWebhook({ name, email, password }) {
  try {
    await fetch(WELCOME_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, link: LEADERBOARD_LINK }),
    });
  } catch (e) {
    console.error('[welcome webhook]', e);
  }
}

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
    await notifyWelcomeWebhook({ name: name.trim(), email: email.trim().toLowerCase(), password });
    logActivity(admin, 'user.create', { name: name.trim(), role });
    return cred.user.uid;
  } finally {
    await signOut(tempAuth).catch(() => {});
    await deleteApp(secondary).catch(() => {});
  }
}

/** Super admin creates another super admin login (email + starting password). */
/** Super admin creates an Admin or another Super Admin (only Super Admins may do this). */
export function createLeaderAccount({ name, email, password, role = 'admin' }, superAdmin) {
  if (!['admin', 'superadmin'].includes(role)) throw new Error('Choose Admin or Super Admin.');
  const displayName = name?.trim() || email.trim().split('@')[0];
  return createUserAccount(
    { name: displayName, email, password, role, department: 'Management', jobTitle: role === 'superadmin' ? 'Super Admin' : 'Admin' },
    superAdmin,
  );
}

/** Super admin changes an Admin's or Super Admin's role, or enables/disables them. */
export async function updateSuperAdmin(target, patch, superAdmin) {
  if (!db) throw new Error('Preview mode — connect Firebase to save changes.');
  await updateDoc(doc(db, 'users', target.id), patch);
  logActivity(superAdmin, 'superadmin.update', { name: target.name, ...patch });
}

/**
 * Calls the `/api/delete-user` Vercel function, which deletes the target's Firebase
 * Authentication sign-in using the Admin SDK — the one thing the client can never do for
 * someone else's account (it can only ever delete its OWN). Throws only on an explicit
 * permission denial from the backend (the admin genuinely isn't allowed to delete this person);
 * any other failure (route not deployed yet, offline, server misconfigured) is logged and
 * swallowed so it never blocks the Firestore profile deletion that actually revokes access —
 * the target's email just won't be free to reuse again until this call succeeds.
 */
async function deleteUserAuth(targetUid) {
  let res;
  try {
    const idToken = await auth.currentUser.getIdToken();
    res = await fetch('/api/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ uid: targetUid }),
    });
  } catch (e) {
    console.error('[delete-user]', e);
    return;
  }
  if (res.ok) return;
  const body = await res.json().catch(() => ({}));
  if (res.status === 403) throw new Error(body.error || "You don't have permission to delete this account.");
  console.error('[delete-user]', res.status, body.error);
}

/**
 * Admin / super admin deletes a user: removes their profile (so they lose all access at once)
 * and their Firebase Authentication sign-in, so the same email can be used to add someone back
 * in later. The auth deletion is called first, while the Firestore doc still exists — the
 * backend reads the target's role from it to enforce the same admin/super-admin rule as
 * firestore.rules.
 */
export async function deleteUserAccount(target, actor) {
  if (!db) throw new Error('Preview mode — connect Firebase to delete accounts.');
  await deleteUserAuth(target.id);
  await deleteDoc(doc(db, 'users', target.id));
  logActivity(actor, 'user.delete', { name: target.name, email: target.email, role: target.role });
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

/** Saves the signed-in user's accent colour (null = the default General theme). */
export async function updateMyAppearance(uid, { accentColor }) {
  if (!db) throw new Error('Preview mode — connect Firebase to save changes.');
  await updateDoc(doc(db, 'users', uid), { accentColor: accentColor || null });
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
