/**
 * Zip-code → contact-sheet workflow (shared "pool" tasks).
 *
 *  1. A Manager, CSM, admin or Backend Developer submits zip codes → task for every admin (step "admin_upload")
 *  2. An admin uploads the CSV on that task    → task for every Backend Developer (step "dev_process")
 *  3. The first developer to complete it wins  → it disappears for the rest, who see who completed it
 *
 * Every task in one run shares a `jobId`, so the whole sequence can be shown as a timeline.
 * CSV files are stored in Firestore (chunked), so no Firebase Storage / paid plan is needed.
 */
import {
  addDays,
} from 'date-fns';
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc, Timestamp, where,
} from 'firebase/firestore';
import Papa from 'papaparse';
import { db } from '../lib/firebase';
import { logActivity, notifyUsers } from './notifications';

export const WORKFLOW_KIND = 'zip_workflow';
/** Roles whose zip submissions start the workflow. */
export const WORKFLOW_SUBMITTERS = ['superadmin', 'admin', 'manager', 'csm', 'backend_developer'];
export const DEV_ROLE = 'backend_developer';
/** Upload tasks go to Admins only. Super Admins oversee the queue but don't receive the work. */
export const UPLOAD_ROLE = 'admin';

const CHUNK = 700_000; // characters per Firestore chunk (doc limit is 1 MiB)

function preview() {
  if (!db) throw new Error('Preview mode — connect Firebase to run the workflow.');
}

async function activeIds(roles) {
  const list = Array.isArray(roles) ? roles : [roles];
  const snap = await getDocs(query(collection(db, 'users'), where('role', 'in', list)));
  return snap.docs.filter((d) => d.data().active).map((d) => d.id);
}

const place = (t) => `${t.clientName} › ${t.subAccountName}`;

/**
 * Step 1 — called after a zip submission. Returns the new task id (or null).
 * `requester` is who the zips are for (defaults to the signed-in user). It differs when a
 * manager overrides someone else's flagged zip: the run is still credited to the submitter.
 */
export async function startZipWorkflow({ results, client, subAccount, profile, requester = profile }) {
  preview();
  if (!WORKFLOW_SUBMITTERS.includes(profile.role)) return null;
  const zips = results.filter((r) => r.status === 'pending').map((r) => r.zip);
  if (!zips.length) return null;

  const adminIds = await activeIds(UPLOAD_ROLE);
  const ref = doc(collection(db, 'tasks'));
  const task = {
    kind: WORKFLOW_KIND,
    step: 'admin_upload',
    jobId: ref.id,
    pool: true,
    assigneeRole: 'admin',
    assigneeIds: adminIds,
    assigneeName: 'Admins',
    title: `Upload contact sheet · ${client.name} › ${subAccount.name}`,
    description: `${requester.name} submitted ${zips.length} zip code${zips.length > 1 ? 's' : ''}${requester.id !== profile.id ? ` (cooldown overridden by ${profile.name})` : ''}. Upload the CSV to send it to the Backend Developers.`,
    zips,
    zipCount: zips.length,
    clientId: client.id,
    clientName: client.name,
    subAccountId: subAccount.id,
    subAccountName: subAccount.name,
    requestedBy: requester.id,
    requestedByName: requester.name,
    requestedAt: serverTimestamp(),
    priority: 'high',
    status: 'todo',
    dueDate: Timestamp.fromDate(addDays(new Date(), 1)),
    createdBy: profile.id,
    createdByName: profile.name,
    createdAt: serverTimestamp(),
    overdueNotified: false,
  };
  await setDoc(ref, task);
  await notifyUsers(adminIds, {
    title: `New zip codes need a contact sheet`,
    body: `${requester.name} · ${zips.length} zips for ${place(task)}`,
    link: '/tasks?view=workflow',
    type: 'zip',
  }).catch(() => {});
  logActivity(profile, 'workflow.submit', { subAccount: subAccount.name, zips: zips.length });
  return ref.id;
}

/** Step 2 — admin uploads the CSV; their task completes and a shared task goes to every Backend Developer. */
export async function uploadSheetAndDispatch(task, file, profile) {
  preview();
  if (task.status === 'done') throw new Error('This step is already complete.');
  const devIds = await activeIds(DEV_ROLE);
  if (!devIds.length) throw new Error('There are no active Backend Developers to send this to. Add one from Add user first.');

  const text = await file.text();
  const rows = Papa.parse(text, { header: true, skipEmptyLines: true }).data.length;

  // Store the file: meta doc + ordered text chunks.
  const sheetRef = doc(collection(db, 'sheets'));
  const parts = Math.max(1, Math.ceil(text.length / CHUNK));
  for (let i = 0; i < parts; i += 1) {
    await setDoc(doc(db, 'sheets', sheetRef.id, 'chunks', String(i).padStart(4, '0')), { i, text: text.slice(i * CHUNK, (i + 1) * CHUNK) });
  }
  await setDoc(sheetRef, {
    name: file.name, size: file.size, rows, parts, jobId: task.jobId,
    uploadedBy: profile.id, uploadedByName: profile.name, createdAt: serverTimestamp(),
  });

  const sheet = { sheetId: sheetRef.id, sheetName: file.name, sheetRows: rows, sheetSize: file.size };
  const devRef = doc(collection(db, 'tasks'));
  const taskRef = doc(db, 'tasks', task.id);
  // A transaction re-reads the task, so two admins uploading at once can't both dispatch it.
  try {
    await runTransaction(db, async (tx) => {
      const fresh = (await tx.get(taskRef)).data();
      if (!fresh) throw new Error('This task no longer exists.');
      if (fresh.status === 'done') {
        const err = new Error(`${fresh.completedByName || 'Another admin'} already uploaded the CSV for this one.`);
        err.code = 'already-done';
        throw err;
      }
      tx.update(taskRef, {
        ...sheet,
        status: 'done',
        completedAt: serverTimestamp(),
        completedBy: profile.id,
        completedByName: profile.name,
        nextTaskId: devRef.id,
        updatedAt: serverTimestamp(),
      });
      tx.set(devRef, {
        kind: WORKFLOW_KIND,
        step: 'dev_process',
        jobId: task.jobId,
        pool: true,
        assigneeRole: DEV_ROLE,
        assigneeIds: devIds,
        assigneeName: 'Backend Developers',
        title: `Process contact sheet · ${place(task)}`,
        description: `${profile.name} uploaded ${file.name} (${rows.toLocaleString()} rows) for ${task.zipCount} zip codes. The first developer to complete it takes it.`,
        zips: task.zips,
        zipCount: task.zipCount,
        clientId: task.clientId,
        clientName: task.clientName,
        subAccountId: task.subAccountId,
        subAccountName: task.subAccountName,
        requestedBy: task.requestedBy,
        requestedByName: task.requestedByName,
        requestedAt: task.requestedAt || task.createdAt || null,
        ...sheet,
        priority: 'high',
        status: 'todo',
        dueDate: Timestamp.fromDate(addDays(new Date(), 1)),
        createdBy: profile.id,
        createdByName: profile.name,
        createdAt: serverTimestamp(),
        overdueNotified: false,
      });
    });
  } catch (e) {
    removeSheet(sheetRef.id).catch(() => {}); // don't leave an unused file behind
    throw e;
  }

  // Let whoever submitted the zips know their contact sheet is on its way.
  if (task.requestedBy && task.requestedBy !== profile.id) {
    notifyUsers([task.requestedBy], {
      title: 'Contact sheet uploaded for your zips',
      body: `${profile.name} uploaded ${file.name} for ${place(task)} · now with the Backend Developers`,
      link: '/tasks?view=workflow',
      type: 'info',
    }).catch(() => {});
  }

  await notifyUsers(devIds, {
    title: 'New task available: process a contact sheet',
    body: `${place(task)} · ${rows.toLocaleString()} rows · first to complete takes it`,
    link: '/tasks?view=workflow',
    type: 'task',
  }).catch(() => {});
  logActivity(profile, 'workflow.upload', { subAccount: task.subAccountName, rows });
  return devRef.id;
}

/**
 * Step 3 — a developer completes the shared task. Runs in a transaction, so if two developers
 * click at the same moment only the first succeeds; the other gets "already completed by …".
 */
export async function completePoolTask(task, profile) {
  preview();
  const ref = doc(db, 'tasks', task.id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const t = snap.data();
    if (!t) throw new Error('This task no longer exists.');
    if (t.status === 'done') {
      const err = new Error(`${t.completedByName || 'Someone'} already completed this task.`);
      err.code = 'already-done';
      throw err;
    }
    if (!(t.assigneeIds || []).includes(profile.id)) throw new Error('This task is not assigned to you.');
    tx.update(ref, {
      status: 'done',
      completedAt: serverTimestamp(),
      completedBy: profile.id,
      completedByName: profile.name,
      updatedAt: serverTimestamp(),
    });
  });

  const others = (task.assigneeIds || []).filter((id) => id !== profile.id);
  const adminIds = await activeIds(UPLOAD_ROLE).catch(() => []);
  await Promise.all([
    notifyUsers(others, {
      title: `${profile.name} completed a shared task`,
      body: `${task.title} · no action needed`,
      link: '/tasks?view=workflow',
      type: 'success',
    }),
    notifyUsers([...adminIds, task.requestedBy].filter((id) => id !== profile.id), {
      title: `Contact sheet processed by ${profile.name}`,
      body: `${place(task)} · ${task.zipCount} zips`,
      link: '/tasks?view=workflow',
      type: 'success',
    }),
  ]).catch(() => {});
  logActivity(profile, 'workflow.done', { subAccount: task.subAccountName, title: task.title });
}

/** Deletes an uploaded CSV (meta doc + chunks). */
async function removeSheet(sheetId) {
  const chunks = await getDocs(collection(db, 'sheets', sheetId, 'chunks'));
  await Promise.all(chunks.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, 'sheets', sheetId));
}

/** Rebuilds an uploaded CSV from its chunks and downloads it. */
export async function downloadSheet(sheetId) {
  preview();
  const meta = await getDoc(doc(db, 'sheets', sheetId));
  if (!meta.exists()) throw new Error('File not found.');
  const chunks = await getDocs(collection(db, 'sheets', sheetId, 'chunks'));
  const text = chunks.docs.sort((a, b) => a.id.localeCompare(b.id)).map((d) => d.data().text).join('');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = meta.data().name || 'contact-sheet.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
