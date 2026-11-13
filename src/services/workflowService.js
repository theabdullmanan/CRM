/**
 * Zip-code → contact-sheet workflow (shared "pool" tasks).
 *
 *  1. A Backend Developer submits zip codes   → task for every admin  (step "admin_upload")
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
  collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc, Timestamp, where, writeBatch,
} from 'firebase/firestore';
import Papa from 'papaparse';
import { db } from '../lib/firebase';
import { ADMIN_ROLES } from '../lib/constants';
import { logActivity, notifyUsers } from './notifications';

export const WORKFLOW_KIND = 'zip_workflow';
/** Roles whose zip submissions start the workflow. */
export const WORKFLOW_SUBMITTERS = ['admin', 'manager', 'csm', 'backend_developer'];
export const DEV_ROLE = 'backend_developer';

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

/** Step 1 — called after a Backend Developer's zip submission. Returns the new task id (or null). */
export async function startZipWorkflow({ results, client, subAccount, profile }) {
  preview();
  if (!WORKFLOW_SUBMITTERS.includes(profile.role)) return null;
  const zips = results.filter((r) => r.status === 'pending').map((r) => r.zip);
  if (!zips.length) return null;

  const adminIds = await activeIds(ADMIN_ROLES);
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
    description: `${profile.name} submitted ${zips.length} zip code${zips.length > 1 ? 's' : ''}. Upload the CSV to send it to the Backend Developers.`,
    zips,
    zipCount: zips.length,
    clientId: client.id,
    clientName: client.name,
    subAccountId: subAccount.id,
    subAccountName: subAccount.name,
    requestedBy: profile.id,
    requestedByName: profile.name,
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
    body: `${profile.name} · ${zips.length} zips for ${place(task)}`,
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
  const batch = writeBatch(db);
  batch.update(doc(db, 'tasks', task.id), {
    ...sheet,
    status: 'done',
    completedAt: serverTimestamp(),
    completedBy: profile.id,
    completedByName: profile.name,
    nextTaskId: devRef.id,
    updatedAt: serverTimestamp(),
  });
  batch.set(devRef, {
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
  await batch.commit();

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
  const adminIds = await activeIds(ADMIN_ROLES).catch(() => []);
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
