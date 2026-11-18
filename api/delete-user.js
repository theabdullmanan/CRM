import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Keep in sync with ADMIN_ROLES in src/lib/constants.js.
const ADMIN_ROLES = ['superadmin', 'admin'];

function adminApp() {
  if (getApps().length) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

/**
 * Deletes a team member's Firebase Authentication sign-in (email + password).
 *
 * The client removes the Firestore `users` doc on its own (firestore.rules already allows it),
 * which is what instantly cuts off access — but it can never delete someone ELSE's auth
 * account, only its own. Without this, a deleted person's email stays registered in Firebase
 * Auth forever, so re-adding them (or anyone else) with that same email fails with
 * "email-already-in-use". This runs as a Vercel serverless function rather than a Firebase
 * Cloud Function so it works on Firebase's free Spark plan — Cloud Functions require Blaze.
 *
 * Mirrors the `allow delete` rule on `users/{uid}` in firestore.rules: a Super Admin can delete
 * anyone, an Admin can delete anyone except another Admin or Super Admin.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return res.status(401).json({ error: 'Sign in required.' });

  const targetUid = req.body?.uid;
  if (!targetUid || typeof targetUid !== 'string') return res.status(400).json({ error: 'A target uid is required.' });

  let auth;
  let db;
  try {
    adminApp();
    auth = getAuth();
    db = getFirestore();
  } catch (e) {
    console.error('[delete-user] admin init failed — check FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY env vars', e);
    return res.status(500).json({ error: 'Server is not configured to delete logins yet.' });
  }

  let callerUid;
  try {
    callerUid = (await auth.verifyIdToken(idToken)).uid;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }

  if (targetUid === callerUid) return res.status(400).json({ error: "You can't delete your own account this way." });

  const callerSnap = await db.doc(`users/${callerUid}`).get();
  const caller = callerSnap.data();
  if (!callerSnap.exists || !caller.active || !ADMIN_ROLES.includes(caller.role)) {
    return res.status(403).json({ error: 'Only active admins can delete team members.' });
  }

  // Read the target's role BEFORE the client deletes their Firestore doc — the client calls
  // this endpoint first, for exactly this reason.
  const targetSnap = await db.doc(`users/${targetUid}`).get();
  const targetRole = targetSnap.exists ? targetSnap.data().role : null;
  if (caller.role !== 'superadmin' && targetRole && ADMIN_ROLES.includes(targetRole)) {
    return res.status(403).json({ error: 'Only a Super Admin can delete an Admin or Super Admin account.' });
  }

  try {
    await auth.deleteUser(targetUid);
  } catch (err) {
    // Already gone (e.g. this was retried after a partial earlier failure) — fine, not an error.
    if (err.code !== 'auth/user-not-found') {
      console.error('[delete-user]', err);
      return res.status(500).json({ error: 'Could not delete the login.' });
    }
  }

  return res.status(200).json({ ok: true });
}
