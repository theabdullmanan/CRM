/**
 * Which CSM / manager looks after which GoHighLevel user.
 *
 * The GHL data is rewritten by n8n every hour, so assignments live separately in
 * one Firestore document: settings/ghlAssignments → { assignments: { [userKey]: {...} } }.
 * (Uses the existing /settings rules: every active user can read, admins can write.)
 */
import { deleteField, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { logActivity, notifyUsers } from './notifications';

export const ASSIGN_DOC = 'ghlAssignments';

/** Stable key for one GHL user inside one sub-account. */
export const ghlUserKey = (sub, u, i) => `${sub.locationId}:${u.id || u.email || u.phone || i}`;

/**
 * Assigns `people` (from the Clients page) to `csm` (a user profile), or unassigns them when csm is null.
 */
export async function assignGhlUsers(people, csm, profile) {
  if (!db) throw new Error('Preview mode — connect Firebase to save changes.');
  if (!people.length) return;
  const assignments = Object.fromEntries(people.map((p) => [p.key, csm ? {
    csmId: csm.id,
    csmName: csm.name,
    userName: p.name || p.email || '',
    email: p.email || '',
    locationId: p.sub.locationId,
    subAccountName: p.sub.name,
    assignedBy: profile.id,
    assignedByName: profile.name,
    assignedAt: serverTimestamp(),
  } : deleteField()]));
  await setDoc(doc(db, 'settings', ASSIGN_DOC), { assignments, updatedAt: serverTimestamp() }, { merge: true });

  if (csm && csm.id !== profile.id) {
    const n = people.length;
    await notifyUsers([csm.id], {
      title: n === 1 ? `${profile.name} assigned you a client` : `${profile.name} assigned you ${n} clients`,
      body: n === 1 ? `${people[0].name || people[0].email} · ${people[0].sub.name}` : people.slice(0, 3).map((p) => p.name || p.email).join(', ') + (n > 3 ? ` and ${n - 3} more` : ''),
      link: '/clients',
      type: 'info',
    }).catch(() => {});
  }
  logActivity(profile, csm ? 'client.assign' : 'client.unassign', { count: people.length, csm: csm?.name || '' });
}
