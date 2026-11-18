import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { AGENCY_COLLECTION, AGENCY_DOC, normalise } from '../src/lib/agency.js';

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

const ELEVATED_ROLES = ['admin', 'superadmin', 'manager'];

/**
 * Returns `{ leadsYesterday, leads7d }` per client, for one CSM's own clients only — read from
 * System B (`dashboard/latest`, the ~0.5MB n8n-fed agency doc) with the Admin SDK, server-side,
 * so the CSM's own browser never sees the raw shared document or any other CSM's rows. Reuses
 * `normalise()` from src/lib/agency.js (the exact same parser the rest of the app uses) instead
 * of re-implementing it, so this can't silently drift from how the Clients/Dashboard pages read
 * the same data.
 *
 * This does NOT change who can read `dashboard/latest` directly — that rule, and the existing
 * Clients tab's broad access to it, are untouched (separately flagged as a follow-up).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return res.status(401).json({ error: 'Sign in required.' });

  let auth;
  let db;
  try {
    adminApp();
    auth = getAuth();
    db = getFirestore();
  } catch (e) {
    console.error('[csm-leads] admin init failed — check FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY env vars', e);
    return res.status(500).json({ error: 'Server is not configured yet.' });
  }

  let callerUid;
  try {
    callerUid = (await auth.verifyIdToken(idToken)).uid;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }

  const callerSnap = await db.doc(`users/${callerUid}`).get();
  const caller = callerSnap.data();
  if (!callerSnap.exists || !caller.active) return res.status(403).json({ error: 'Not allowed.' });

  const requestedCsmId = req.body?.csmId;
  const elevated = ELEVATED_ROLES.includes(caller.role);
  if (requestedCsmId && !elevated && requestedCsmId !== callerUid) {
    return res.status(403).json({ error: "You can only view your own clients' leads." });
  }
  const targetCsmId = elevated && requestedCsmId ? requestedCsmId : callerUid;

  const clientsSnap = await db.collection('clients').where('csmId', '==', targetCsmId).get();
  const clients = clientsSnap.docs.map((d) => ({ id: d.id, ghlLocationIds: d.data().ghlLocationIds || [] }));
  const neededIds = new Set(clients.flatMap((c) => c.ghlLocationIds));
  if (!neededIds.size) return res.status(200).json({ leads: {} });

  const agencySnap = await db.doc(`${AGENCY_COLLECTION}/${AGENCY_DOC}`).get();
  if (!agencySnap.exists) return res.status(200).json({ leads: {} });

  let rows;
  try {
    const d = agencySnap.data();
    const raw = typeof d.payload === 'string' ? d.payload : JSON.stringify(d.payload || d);
    rows = normalise(JSON.parse(raw)).rows;
  } catch (e) {
    console.error('[csm-leads] could not parse agency data', e);
    return res.status(502).json({ error: "Couldn't read live lead data." });
  }

  const byLocation = Object.fromEntries(rows.filter((r) => neededIds.has(r.locationId)).map((r) => [r.locationId, r]));
  const leads = {};
  clients.forEach((c) => {
    if (!c.ghlLocationIds.length) return; // "Not linked" — the caller distinguishes by absence, not a 0
    let leadsYesterday = 0;
    let leads7d = 0;
    let matched = 0;
    c.ghlLocationIds.forEach((locId) => {
      const r = byLocation[locId];
      if (r) { leadsYesterday += r.leadsYesterday || 0; leads7d += r.leads7d || 0; matched += 1; }
    });
    // Linked, but every linked sub-account has since disappeared from System B (deleted/renamed
    // locationId etc.) — distinct from "linked and genuinely has 0 leads" so the UI can show
    // "No data" instead of a misleading 0.
    leads[c.id] = matched > 0 ? { leadsYesterday, leads7d, matched: true } : { matched: false };
  });

  return res.status(200).json({ leads });
}
