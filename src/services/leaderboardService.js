/**
 * Senders Leaderboard writes (admins and managers only; enforced again by Firestore rules).
 * Lead counts themselves are written only by n8n with a service account. The app never
 * writes leadSendEvents or leadDailyCounts, so senders can't change their own numbers.
 */
import { addDoc, arrayUnion, collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { logActivity } from './notifications';

function live() {
  if (!db) throw new Error('Preview mode — connect Firebase to save changes.');
}

export async function saveLeaderboardSettings({ defaultTarget, idleMinutes }, profile) {
  live();
  await setDoc(doc(db, 'leaderboardSettings', 'config'), {
    defaultTarget: Number(defaultTarget),
    idleMinutes: Number(idleMinutes),
    updatedBy: profile.id,
    updatedByName: profile.name,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  logActivity(profile, 'leaderboard.settings', { defaultTarget, idleMinutes });
}

/** Puts a CRM user on the board. `matchName` is their name exactly as it appears in GHL. */
export async function addSender(user, matchName, profile) {
  live();
  await setDoc(doc(db, 'leaderboardSenders', user.id), {
    userId: user.id,
    name: user.name,
    matchName: (matchName || user.name).trim(),
    active: true,
    addedBy: profile.id,
    addedByName: profile.name,
    addedAt: serverTimestamp(),
  }, { merge: true });
  logActivity(profile, 'leaderboard.addSender', { sender: user.name });
}

/** Target override (null = use the default), GHL name, etc. */
export async function updateSender(sender, patch, profile) {
  live();
  await updateDoc(doc(db, 'leaderboardSenders', sender.id), { ...patch, updatedBy: profile.id, updatedAt: serverTimestamp() });
}

/** Hides a sender from the board, or brings them back. Their lead history and account stay as they are. */
export async function setSenderActive(sender, active, profile) {
  await updateSender(sender, { active }, profile);
  logActivity(profile, active ? 'leaderboard.restoreSender' : 'leaderboard.removeSender', { sender: sender.name });
}

/**
 * Links a GHL sender name that matched nobody to a CRM user.
 * An existing sender keeps their main GHL name and gets this one as an extra alias.
 */
export async function linkUnmatchedName(ghlName, user, existingSender, profile) {
  live();
  if (existingSender) {
    await updateDoc(doc(db, 'leaderboardSenders', existingSender.id), {
      aliases: arrayUnion(ghlName.trim()), active: true, updatedBy: profile.id, updatedAt: serverTimestamp(),
    });
  } else {
    await addSender(user, ghlName, profile);
  }
  logActivity(profile, 'leaderboard.linkSender', { ghlName, sender: user.name });
}

/** Admin correction of a sender's count for one business day. Logged permanently; never edited. */
export async function addAdjustment({ sender, delta, reason, day }, profile) {
  live();
  await addDoc(collection(db, 'leadAdjustments'), {
    senderId: sender.id,
    senderName: sender.name,
    delta: Number(delta),
    reason: reason.trim(),
    day,
    createdBy: profile.id,
    createdByName: profile.name,
    createdAt: serverTimestamp(),
  });
  logActivity(profile, 'leaderboard.adjust', { sender: sender.name, delta: Number(delta), day, reason: reason.trim() });
}
