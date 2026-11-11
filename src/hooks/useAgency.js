import { useEffect, useSyncExternalStore } from 'react';
import { doc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AGENCY_COLLECTION, AGENCY_DOC, buildOwners, normalise } from '../lib/agency';

/*
 * One shared, real-time subscription to `dashboard/latest` (written by n8n every hour).
 * The first component that needs it starts the listener; every page then reads the
 * same parsed data, so the ~0.5 MB payload is parsed once per update, not per page.
 */
let state = { status: 'idle', rows: [], summary: null, owners: {}, updatedAt: null, error: null };
let lastRaw = null;
let started = false;
const listeners = new Set();

const emit = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

function handle(snap) {
  if (!snap.exists()) {
    emit({ status: 'empty', error: "n8n hasn't saved any data yet. Run the n8n workflow once." });
    return;
  }
  const d = snap.data();
  const raw = typeof d.payload === 'string' ? d.payload : JSON.stringify(d.payload || d);
  if (raw === lastRaw) return;
  try {
    const { summary, rows } = normalise(JSON.parse(raw));
    lastRaw = raw;
    const updatedAt = summary.updatedAt || d.updatedAt?.toDate?.()?.toISOString() || null;
    emit({ status: 'ready', rows, summary, owners: buildOwners(rows), updatedAt, error: null });
  } catch (e) {
    emit({ status: 'error', error: `Saved data couldn't be read: ${e.message}` });
  }
}

function start() {
  if (started) return;
  started = true;
  if (!db) {
    // Preview mode: dashboard/latest is publicly readable, so fetch it once over REST.
    const pid = import.meta.env.VITE_FIREBASE_PROJECT_ID;
    if (!pid) { emit({ status: 'unavailable', error: 'Connect Firebase to load live agency data.' }); return; }
    emit({ status: 'loading' });
    fetch(`https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/${AGENCY_COLLECTION}/${AGENCY_DOC}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => handle({ exists: () => true, data: () => ({ payload: d.fields?.payload?.stringValue, updatedAt: null }) }))
      .catch((e) => emit({ status: 'error', error: `Couldn't read live data (${e.message}).` }));
    return;
  }
  emit({ status: 'loading' });
  onSnapshot(
    doc(db, AGENCY_COLLECTION, AGENCY_DOC),
    handle,
    (err) => emit({ status: 'error', error: `Couldn't read live data (${err.code}). Check the Firestore rules allow reading dashboard/latest.` }),
  );
}

/** Force a fresh read from the server (the "Refresh" button). */
export async function refreshAgency() {
  if (!db) return;
  handle(await getDocFromServer(doc(db, AGENCY_COLLECTION, AGENCY_DOC)));
}

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const getSnapshot = () => state;

export function useAgency() {
  useEffect(start, []);
  return useSyncExternalStore(subscribe, getSnapshot);
}
