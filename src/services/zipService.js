import {
  arrayUnion,
  collection,
  doc,
  increment,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable, deleteObject } from 'firebase/storage';
import Papa from 'papaparse';
import { addDays } from 'date-fns';
import { db, storage } from '../lib/firebase';
import { toDate } from '../lib/utils';
import { notifyRoles, notifyUsers, logActivity } from './notifications';

// ---------------------------------------------------------------------------
// Cooldown locks
// A lock doc exists per (scope, zip). While `expiresAt` is in the future the zip
// cannot be submitted again within that scope. Locks are claimed inside a
// transaction, so two CSMs submitting the same zip at the same moment cannot
// both succeed.
// ---------------------------------------------------------------------------
export function scopeKeyFor(scope, { clientId, subAccountId }) {
  if (scope === 'global') return 'global';
  if (scope === 'client') return `client-${clientId}`;
  return `sub-${subAccountId}`;
}

const lockRefFor = (scopeKey, zip) => doc(db, 'zipLocks', `${scopeKey}__${zip}`);

/**
 * Submits zips for a client sub-account.
 * Each zip is checked atomically against the cooldown; conflicts are stored as
 * `flagged` submissions so the CSM sees exactly why and when it becomes eligible.
 */
export async function submitZips({ zips, client, subAccount, profile, settings, note = '' }) {
  const cooldownDays = Number(settings.cooldownDays) || 42;
  const scope = settings.cooldownScope || 'subAccount';
  const scopeKey = scopeKeyFor(scope, { clientId: client.id, subAccountId: subAccount.id });

  const results = await Promise.all(
    zips.map(async (zip) => {
      const lockRef = lockRefFor(scopeKey, zip);
      const subRef = doc(collection(db, 'zipSubmissions'));
      const now = new Date();
      const base = {
        zip,
        clientId: client.id,
        clientName: client.name,
        subAccountId: subAccount.id,
        subAccountName: subAccount.name,
        submittedBy: profile.id,
        submittedByName: profile.name,
        note,
        scope,
        scopeKey,
        createdAt: serverTimestamp(),
      };

      try {
        return await runTransaction(db, async (tx) => {
          const lock = await tx.get(lockRef);
          const l = lock.exists() ? lock.data() : null;
          if (l && toDate(l.expiresAt) > now) {
            tx.set(subRef, {
              ...base,
              status: 'flagged',
              conflict: {
                submissionId: l.submissionId || '',
                clientName: l.clientName || '',
                subAccountName: l.subAccountName || '',
                submittedByName: l.submittedByName || '',
                lockedAt: l.lockedAt || null,
                eligibleAt: l.expiresAt,
              },
            });
            return { zip, status: 'flagged', eligibleAt: toDate(l.expiresAt), conflict: l };
          }
          const expiresAt = Timestamp.fromDate(addDays(now, cooldownDays));
          tx.set(lockRef, {
            zip, scope, scopeKey,
            submissionId: subRef.id,
            clientId: client.id, clientName: client.name,
            subAccountId: subAccount.id, subAccountName: subAccount.name,
            submittedByName: profile.name,
            lockedAt: Timestamp.fromDate(now),
            expiresAt,
          });
          tx.set(subRef, { ...base, status: 'pending', eligibleAgainAt: expiresAt });
          return { zip, status: 'pending' };
        });
      } catch (error) {
        return { zip, status: 'error', error };
      }
    }),
  );

  const accepted = results.filter((r) => r.status === 'pending');
  const flagged = results.filter((r) => r.status === 'flagged');

  if (accepted.length) {
    await notifyRoles(['ops'], {
      title: `${accepted.length} new zip code${accepted.length > 1 ? 's' : ''} to review`,
      body: `${client.name} › ${subAccount.name} — submitted by ${profile.name}`,
      link: '/zip-queue',
      type: 'zip',
    }, { exclude: [profile.id] }).catch(() => {});
  }
  if (flagged.length) {
    await notifyUsers([profile.id], {
      title: `${flagged.length} zip code${flagged.length > 1 ? 's' : ''} flagged (cooldown)`,
      body: `${flagged.map((f) => f.zip).join(', ')} for ${subAccount.name}`,
      link: '/zip-codes?tab=flagged',
      type: 'warning',
    }).catch(() => {});
  }
  logActivity(profile, 'zip.submit', {
    client: client.name, subAccount: subAccount.name, accepted: accepted.length, flagged: flagged.length,
  });
  return results;
}

export async function approveSubmissions(subs, profile) {
  const batch = writeBatch(db);
  subs.forEach((s) =>
    batch.update(doc(db, 'zipSubmissions', s.id), {
      status: 'approved', reviewedBy: profile.id, reviewedByName: profile.name, reviewedAt: serverTimestamp(),
    }),
  );
  await batch.commit();
  logActivity(profile, 'zip.approve', { count: subs.length });
}

export async function rejectSubmission(sub, profile, reason = '') {
  await runTransaction(db, async (tx) => {
    const lockRef = lockRefFor(sub.scopeKey, sub.zip);
    const lock = await tx.get(lockRef);
    // Release the cooldown, but only if this submission owns it.
    if (lock.exists() && lock.data().submissionId === sub.id) tx.delete(lockRef);
    tx.update(doc(db, 'zipSubmissions', sub.id), {
      status: 'rejected', rejectReason: reason, reviewedBy: profile.id, reviewedByName: profile.name, reviewedAt: serverTimestamp(),
    });
  });
  await notifyUsers([sub.submittedBy], {
    title: `Zip ${sub.zip} rejected`,
    body: `${sub.subAccountName}${reason ? ` — ${reason}` : ''}`,
    link: '/zip-codes',
    type: 'warning',
  });
  logActivity(profile, 'zip.reject', { zip: sub.zip, reason });
}

/** Leadership can push a flagged zip through. It takes over the cooldown lock. */
export async function overrideFlag(sub, profile, settings) {
  const cooldownDays = Number(settings.cooldownDays) || 42;
  const now = new Date();
  const expiresAt = Timestamp.fromDate(addDays(now, cooldownDays));
  await runTransaction(db, async (tx) => {
    tx.set(lockRefFor(sub.scopeKey, sub.zip), {
      zip: sub.zip, scope: sub.scope, scopeKey: sub.scopeKey, submissionId: sub.id,
      clientId: sub.clientId, clientName: sub.clientName,
      subAccountId: sub.subAccountId, subAccountName: sub.subAccountName,
      submittedByName: sub.submittedByName, lockedAt: Timestamp.fromDate(now), expiresAt,
    });
    tx.update(doc(db, 'zipSubmissions', sub.id), {
      status: 'pending', eligibleAgainAt: expiresAt, overriddenBy: profile.name, overriddenAt: serverTimestamp(),
    });
  });
  await notifyUsers([sub.submittedBy], {
    title: `Zip ${sub.zip} approved by override`,
    body: `${profile.name} overrode the cooldown for ${sub.subAccountName}`,
    link: '/zip-codes',
  });
  logActivity(profile, 'zip.override', { zip: sub.zip, subAccount: sub.subAccountName });
}

export async function dismissFlag(sub) {
  await updateDoc(doc(db, 'zipSubmissions', sub.id), { status: 'dismissed', dismissedAt: serverTimestamp() });
}

// ---------------------------------------------------------------------------
// CJ data requests
// ---------------------------------------------------------------------------
export async function createDataRequest({ subs, profile, notes = '', dueDate = null }) {
  const first = subs[0];
  const reqRef = doc(collection(db, 'dataRequests'));
  const batch = writeBatch(db);
  batch.set(reqRef, {
    clientId: first.clientId,
    clientName: first.clientName,
    subAccountId: first.subAccountId,
    subAccountName: first.subAccountName,
    zips: subs.map((s) => s.zip).sort(),
    submissionIds: subs.map((s) => s.id),
    submitterIds: [...new Set(subs.map((s) => s.submittedBy))],
    status: 'open',
    notes,
    dueDate: dueDate ? Timestamp.fromDate(dueDate) : null,
    requestedBy: profile.id,
    requestedByName: profile.name,
    files: [],
    createdAt: serverTimestamp(),
  });
  subs.forEach((s) =>
    batch.update(doc(db, 'zipSubmissions', s.id), {
      status: 'requested',
      dataRequestId: reqRef.id,
      reviewedBy: s.reviewedBy || profile.id,
      reviewedByName: s.reviewedByName || profile.name,
      reviewedAt: s.reviewedAt || serverTimestamp(),
    }),
  );
  await batch.commit();
  await notifyRoles(['data'], {
    title: `New data request: ${subs.length} zip${subs.length > 1 ? 's' : ''}`,
    body: `${first.clientName} › ${first.subAccountName}. Please upload the contact sheet.`,
    link: '/data-requests',
    type: 'data',
  });
  logActivity(profile, 'data.request', { subAccount: first.subAccountName, zips: subs.length });
  return reqRef.id;
}

async function countCsvRows(file) {
  if (!/\.csv$/i.test(file.name)) return null;
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (r) => resolve(r.data.length),
      error: () => resolve(null),
    });
  });
}

export function uploadContactSheet(request, file, profile, onProgress) {
  const path = `contactSheets/${request.id}/${Date.now()}_${file.name.replace(/[^\w.\-]+/g, '_')}`;
  const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type || 'application/octet-stream' });
  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (s) => onProgress?.(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
      reject,
      async () => {
        try {
          const [url, rows] = await Promise.all([getDownloadURL(task.snapshot.ref), countCsvRows(file)]);
          const entry = {
            name: file.name, path, url, size: file.size, rows,
            uploadedBy: profile.id, uploadedByName: profile.name, uploadedAt: Timestamp.now(),
          };
          await updateDoc(doc(db, 'dataRequests', request.id), { files: arrayUnion(entry) });
          resolve(entry);
        } catch (e) {
          reject(e);
        }
      },
    );
  });
}

export async function removeContactSheet(request, file) {
  await deleteObject(ref(storage, file.path)).catch(() => {});
  await updateDoc(doc(db, 'dataRequests', request.id), {
    files: (request.files || []).filter((f) => f.path !== file.path),
  });
}

/** Marks a request delivered: zips become `fulfilled` on the client sub-account. */
export async function completeDataRequest(request, profile) {
  const batch = writeBatch(db);
  const totalRows = (request.files || []).reduce((s, f) => s + (f.rows || 0), 0);
  batch.update(doc(db, 'dataRequests', request.id), {
    status: 'fulfilled', fulfilledAt: serverTimestamp(), fulfilledBy: profile.id, fulfilledByName: profile.name,
  });
  (request.submissionIds || []).forEach((id) =>
    batch.update(doc(db, 'zipSubmissions', id), { status: 'fulfilled', deliveredAt: serverTimestamp() }),
  );
  batch.update(doc(db, 'subAccounts', request.subAccountId), {
    lastDeliveryAt: serverTimestamp(),
    deliveredZipCount: increment(request.zips?.length || 0),
    deliveredContacts: increment(totalRows),
  });
  await batch.commit();
  await notifyUsers([request.requestedBy, ...(request.submitterIds || [])], {
    title: `Contact sheets ready — ${request.subAccountName}`,
    body: `${request.zips?.length || 0} zips delivered by ${profile.name}${totalRows ? ` (${totalRows.toLocaleString()} contacts)` : ''}`,
    link: `/clients/${request.clientId}`,
    type: 'success',
  });
  logActivity(profile, 'data.fulfilled', { subAccount: request.subAccountName, zips: request.zips?.length });
}

export async function cancelDataRequest(request, profile) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'dataRequests', request.id), { status: 'cancelled', cancelledBy: profile.name, cancelledAt: serverTimestamp() });
  (request.submissionIds || []).forEach((id) =>
    batch.update(doc(db, 'zipSubmissions', id), { status: 'approved', dataRequestId: null }),
  );
  await batch.commit();
}
