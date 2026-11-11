// Preview mode: when no Firebase config is present, the whole UI runs on this
// in-memory sample data so the screens can be reviewed. Nothing is saved.
import { Timestamp } from 'firebase/firestore';
import { addDays, subDays, subHours, subMinutes } from 'date-fns';
import { isFirebaseConfigured } from './firebase';
import { dayKey } from './spend';

export const isPreview = !isFirebaseConfigured;

const ts = (d) => Timestamp.fromDate(d);
const now = new Date();
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rint = (a, b) => Math.round(a + rnd() * (b - a));

export const PREVIEW_UID = 'u-admin';

const users = [
  ['u-admin', 'Muhammad Khan', 'admin', 'Management'],
  ['u-sergio', 'Sergio Alvarez', 'manager', 'Management'],
  ['u-csm1', 'Emily Carter', 'csm', 'Customer Success'],
  ['u-csm2', 'Jordan Blake', 'csm', 'Customer Success'],
  ['u-ops', 'Nina Patel', 'ops', 'Operations'],
  ['u-cj', 'CJ Thompson', 'data', 'Data'],
  ['u-fin', 'Rachel Kim', 'finance', 'Finance'],
  ['u-dev1', 'Ali Raza', 'backend_developer', 'Engineering'],
  ['u-dev2', 'Bilal Ahmed', 'backend_developer', 'Engineering'],
].map(([id, name, role, department]) => ({
  id, name, role, department, active: true, email: `${name.split(' ')[0].toLowerCase()}@company.com`, createdAt: ts(subDays(now, 60)),
}));
users.push({ id: 'u-new', name: 'Alex Morgan', email: 'alex@company.com', role: 'pending', active: false, department: '', createdAt: ts(subHours(now, 3)) });

const departments = ['Management', 'Customer Success', 'Operations', 'Data', 'Finance', 'Sales', 'Engineering'].map((name, i) => ({ id: `d${i}`, name }));

const CLIENTS = [
  ['Summit Roofing Co.', 'Dana Price', 350, 'active', ['Denver Metro', 'Boulder'], 'u-csm1'],
  ['BrightPath Solar', 'Marcus Lee', 400, 'active', ['Phoenix East', 'Phoenix West', 'Tucson'], 'u-csm1'],
  ['Evergreen HVAC', 'Priya Shah', 180, 'active', ['Portland'], 'u-csm2'],
  ['Coastal Pest Control', 'Tom Reyes', 95, 'active', ['San Diego North', 'San Diego South'], 'u-csm2'],
  ['Lakeside Windows', 'Jen Walsh', 65, 'active', ['Chicago'], 'u-csm1'],
  ['Prime Plumbing Pros', 'Omar Haddad', 220, 'active', ['Dallas', 'Fort Worth'], 'u-csm2'],
  ['NorthStar Insulation', 'Kelly Grant', 140, 'paused', ['Minneapolis'], 'u-csm1'],
  ['Golden Gate Gutters', 'Ava Chen', 120, 'onboarding', ['SF Bay'], 'u-csm2'],
];
const userName = (id) => users.find((u) => u.id === id)?.name;

const clients = [];
const subAccounts = [];
const payments = [];
CLIENTS.forEach(([name, contactName, dailyRate, status, subs, csmId], ci) => {
  const id = `c${ci}`;
  const started = rint(60, 170);
  clients.push({
    id, name, contactName, email: `${contactName.split(' ')[0].toLowerCase()}@example.com`, phone: '(555) 010-' + (1200 + ci),
    status, dailyRate, csmId, csmName: userName(csmId), setupFeePaid: status !== 'onboarding', notes: '', createdAt: ts(subDays(now, started)),
  });
  subs.forEach((s, si) => subAccounts.push({
    id: `${id}-s${si}`, clientId: id, clientName: name, name: s, accountRef: `SA-${1000 + ci * 10 + si}`, market: s, status: 'active',
    deliveredZipCount: rint(4, 30), deliveredContacts: rint(800, 9000), lastDeliveryAt: ts(subDays(now, rint(2, 20))),
  }));
  const start = subDays(now, started);
  payments.push({ id: `p-setup-${id}`, clientId: id, clientName: name, amount: 300, type: 'setup_fee', note: 'Initial setup fee', date: ts(start), day: dayKey(start), createdByName: 'Rachel Kim' });
  if (status === 'onboarding') return;
  // Budgets drift like a real account: momentum plus a gentle pull back to the client's usual rate.
  let rate = dailyRate * (0.75 + rnd() * 0.3);
  let trend = 0;
  for (let i = Math.min(started, 180); i >= (status === 'paused' ? 20 : 0); i -= 1) {
    trend = trend * 0.85 + (rnd() - 0.5) * 7;
    rate = Math.max(65, Math.min(400, rate + trend + (dailyRate - rate) * 0.03));
    const d = subDays(now, i); d.setHours(12, 0, 0, 0);
    payments.push({ id: `p-${id}-${i}`, clientId: id, clientName: name, amount: Math.round(rate + rint(-3, 3)), type: 'daily', note: 'Daily charge', date: ts(d), day: dayKey(d), createdByName: 'Rachel Kim' });
  }
});

// Zip submissions in every state of the workflow
const zipSubmissions = [];
let zn = 0;
const addZip = (subIdx, zip, status, by, extra = {}) => {
  const s = subAccounts[subIdx];
  const created = subHours(now, rint(1, 200));
  zipSubmissions.push({
    id: `z${zn++}`, zip, clientId: s.clientId, clientName: s.clientName, subAccountId: s.id, subAccountName: s.name,
    submittedBy: by, submittedByName: userName(by), status, scope: 'subAccount', scopeKey: `sub-${s.id}`, note: '',
    createdAt: ts(created), eligibleAgainAt: ts(addDays(created, 42)), ...extra,
  });
};
['85001', '85003', '85004', '85006', '85007'].forEach((z) => addZip(2, z, 'pending', 'u-csm1'));
['85201', '85203'].forEach((z) => addZip(3, z, 'approved', 'u-csm1'));
['80202', '80203', '80204'].forEach((z) => addZip(0, z, 'pending', 'u-csm1', { note: 'Client wants downtown first' }));
['92101', '92102', '92103', '92104'].forEach((z) => addZip(5, z, 'requested', 'u-csm2', { dataRequestId: 'r1' }));
['75201', '75202', '75204'].forEach((z) => addZip(8, z, 'fulfilled', 'u-csm2', { dataRequestId: 'r2' }));
['97201', '97205'].forEach((z) => addZip(4, z, 'fulfilled', 'u-csm2'));
addZip(2, '85008', 'flagged', 'u-csm1', { conflict: { clientName: 'BrightPath Solar', subAccountName: 'Phoenix East', submittedByName: 'Emily Carter', lockedAt: ts(subDays(now, 12)), eligibleAt: ts(addDays(now, 30)) } });
addZip(0, '80205', 'flagged', 'u-csm1', { conflict: { clientName: 'Summit Roofing Co.', subAccountName: 'Denver Metro', submittedByName: 'Emily Carter', lockedAt: ts(subDays(now, 25)), eligibleAt: ts(addDays(now, 17)) } });
addZip(1, '80301', 'rejected', 'u-csm1', { rejectReason: 'Outside service area' });

const dataRequests = [
  {
    id: 'r1', clientId: 'c3', clientName: 'Coastal Pest Control', subAccountId: 'c3-s0', subAccountName: 'San Diego North',
    zips: ['92101', '92102', '92103', '92104'], submissionIds: [], status: 'open', notes: 'Homeowners only, please.',
    dueDate: ts(addDays(now, 1)), requestedBy: 'u-ops', requestedByName: 'Nina Patel', createdAt: ts(subHours(now, 5)),
    files: [{ name: 'san-diego-north-batch1.csv', path: 'x/1', url: '#', size: 284000, rows: 2140, uploadedByName: 'CJ Thompson', uploadedAt: ts(subHours(now, 1)) }],
  },
  {
    id: 'r2', clientId: 'c5', clientName: 'Prime Plumbing Pros', subAccountId: 'c5-s0', subAccountName: 'Dallas',
    zips: ['75201', '75202', '75204'], submissionIds: [], status: 'fulfilled', notes: '', dueDate: null,
    requestedBy: 'u-ops', requestedByName: 'Nina Patel', createdAt: ts(subDays(now, 3)), fulfilledAt: ts(subDays(now, 2)), fulfilledByName: 'CJ Thompson',
    files: [{ name: 'dallas-contacts.csv', path: 'x/2', url: '#', size: 512000, rows: 3875, uploadedByName: 'CJ Thompson', uploadedAt: ts(subDays(now, 2)) }],
  },
];

const task = (id, title, assigneeId, dueOffsetH, priority, status, createdBy = 'u-sergio', extra = {}) => ({
  id, title, description: '', assigneeId, assigneeName: userName(assigneeId), priority, status,
  dueDate: ts(addDays(now, dueOffsetH / 24)), createdBy, createdByName: userName(createdBy), createdAt: ts(subDays(now, 3)),
  overdueNotified: true, completedAt: status === 'done' ? ts(subHours(now, 6)) : null, ...extra,
});
const wf = (id, jobId, step, extra) => ({
  id, jobId, step, kind: 'zip_workflow', pool: true, priority: 'high', overdueNotified: true, description: '',
  dueDate: ts(addDays(now, 1)), createdAt: ts(subHours(now, 5)), requestedBy: 'u-dev1', requestedByName: 'Ali Raza', ...extra,
});
const DEVS = ['u-dev1', 'u-dev2'];
const workflowTasks = [
  // Run 1: just submitted, waiting for the admin's CSV
  wf('w1', 'w1', 'admin_upload', { title: 'Upload contact sheet · BrightPath Solar › Tucson', assigneeRole: 'admin', assigneeIds: ['u-admin'], assigneeName: 'Admins',
    clientName: 'BrightPath Solar', subAccountName: 'Tucson', zips: ['85701', '85705', '85710', '85711', '85719', '85745'], zipCount: 6, status: 'todo',
    createdBy: 'u-dev1', createdByName: 'Ali Raza', createdAt: ts(subMinutes(now, 25)) }),
  // Run 2: CSV uploaded, available to every Backend Developer
  wf('w2a', 'w2', 'admin_upload', { title: 'Upload contact sheet · Prime Plumbing Pros › Fort Worth', assigneeRole: 'admin', assigneeIds: ['u-admin'], assigneeName: 'Admins',
    clientName: 'Prime Plumbing Pros', subAccountName: 'Fort Worth', zips: ['76102', '76104', '76107', '76109'], zipCount: 4, status: 'done',
    requestedBy: 'u-dev2', requestedByName: 'Bilal Ahmed', createdBy: 'u-dev2', createdByName: 'Bilal Ahmed', completedBy: 'u-admin', completedByName: 'Muhammad Khan', completedAt: ts(subHours(now, 2)) }),
  wf('w2b', 'w2', 'dev_process', { title: 'Process contact sheet · Prime Plumbing Pros › Fort Worth', assigneeRole: 'backend_developer', assigneeIds: DEVS, assigneeName: 'Backend Developers',
    clientName: 'Prime Plumbing Pros', subAccountName: 'Fort Worth', zips: ['76102', '76104', '76107', '76109'], zipCount: 4, status: 'todo',
    requestedBy: 'u-dev2', requestedByName: 'Bilal Ahmed', requestedAt: ts(subHours(now, 5)), sheetId: 's2', sheetName: 'fort-worth-contacts.csv', sheetRows: 2860, sheetSize: 412000,
    createdBy: 'u-admin', createdByName: 'Muhammad Khan', createdAt: ts(subHours(now, 2)) }),
  // Run 3: completed by Bilal (Ali sees the ribbon)
  wf('w3a', 'w3', 'admin_upload', { title: 'Upload contact sheet · Summit Roofing Co. › Boulder', assigneeRole: 'admin', assigneeIds: ['u-admin'], assigneeName: 'Admins',
    clientName: 'Summit Roofing Co.', subAccountName: 'Boulder', zips: ['80301', '80302', '80303'], zipCount: 3, status: 'done',
    createdBy: 'u-dev1', createdByName: 'Ali Raza', createdAt: ts(subDays(now, 1)), completedBy: 'u-admin', completedByName: 'Muhammad Khan', completedAt: ts(subHours(now, 20)) }),
  wf('w3b', 'w3', 'dev_process', { title: 'Process contact sheet · Summit Roofing Co. › Boulder', assigneeRole: 'backend_developer', assigneeIds: DEVS, assigneeName: 'Backend Developers',
    clientName: 'Summit Roofing Co.', subAccountName: 'Boulder', zips: ['80301', '80302', '80303'], zipCount: 3, status: 'done',
    requestedAt: ts(subDays(now, 1)), sheetId: 's3', sheetName: 'boulder-batch.csv', sheetRows: 1475, sheetSize: 198000, createdBy: 'u-admin', createdByName: 'Muhammad Khan', createdAt: ts(subHours(now, 20)),
    completedBy: 'u-dev2', completedByName: 'Bilal Ahmed', completedAt: ts(subHours(now, 3)) }),
];

const tasks = [
  task('t1', 'Onboard Golden Gate Gutters', 'u-admin', 30, 'high', 'in_progress', 'u-sergio', { clientId: 'c7', clientName: 'Golden Gate Gutters', description: 'Kick-off call, collect sub-account details and first zip list.' }),
  task('t2', 'Monthly spend review with Sergio', 'u-admin', 96, 'medium', 'todo'),
  task('t3', 'Clean up old Google Sheet data', 'u-admin', -20, 'low', 'todo'),
  task('t4', 'Review flagged zips for BrightPath', 'u-csm1', -5, 'high', 'todo'),
  task('t5', 'Send Phoenix zips to CJ', 'u-ops', 6, 'medium', 'in_progress'),
  task('t6', 'Upload San Diego contact sheets', 'u-cj', 20, 'high', 'todo'),
  task('t7', 'Reconcile November payments', 'u-fin', -48, 'medium', 'done'),
  task('t8', 'Call Evergreen HVAC about renewal', 'u-csm2', 48, 'medium', 'todo'),
  task('t9', 'Approve Denver zips', 'u-ops', -30, 'medium', 'done'),
  task('t10', 'Fix webhook retry for n8n sync', 'u-dev1', 30, 'medium', 'todo', 'u-admin'),
  ...workflowTasks,
];

const notifications = [
  ['Overdue: Clean up old Google Sheet data', 'Muhammad Khan · was due yesterday', 'overdue', 30, false, '/tasks'],
  ['5 new zip codes to review', 'BrightPath Solar › Phoenix East — submitted by Emily Carter', 'zip', 50, false, '/zip-queue'],
  ['Rachel Kim completed a task', 'Reconcile November payments', 'success', 180, false, '/tasks?view=team'],
  ['Contact sheets ready — Dallas', '3 zips delivered by CJ Thompson (3,875 contacts)', 'success', 2900, true, '/clients/c5'],
  ['New task: Onboard Golden Gate Gutters', 'Assigned by Sergio Alvarez', 'task', 4300, true, '/tasks'],
].map(([title, body, type, minsAgo, read, link], i) => ({ id: `n${i}`, userId: PREVIEW_UID, title, body, type, read, link, createdAt: ts(subMinutes(now, minsAgo)) }));

const activity = [
  ['Emily Carter', 'zip.submit', { subAccount: 'Phoenix East', accepted: 5, flagged: 1 }, 50],
  ['Nina Patel', 'data.request', { subAccount: 'San Diego North', zips: 4 }, 300],
  ['CJ Thompson', 'data.fulfilled', { subAccount: 'Dallas' }, 2900],
  ['Rachel Kim', 'payment.daily', { clients: 6 }, 600],
  ['Sergio Alvarez', 'task.create', { title: 'Onboard Golden Gate Gutters', assignee: 'Muhammad Khan' }, 4300],
].map(([userName_, action, details, minsAgo], i) => ({ id: `a${i}`, userName: userName_, action, details, createdAt: ts(subMinutes(now, minsAgo)) }));

export const previewDb = {
  users, departments, clients, subAccounts, payments, zipSubmissions, dataRequests, tasks, notifications, activity,
};
