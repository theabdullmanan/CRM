// Roles control what a user can see and do. Departments (from Sergio's list) are
// managed separately in Settings and are attached to users for grouping/reporting.
export const ROLES = {
  superadmin: { label: 'Super Admin', color: 'violet', description: 'Everything an admin can do, plus the Super Admin dashboard and managing other super admins' },
  admin: { label: 'Admin', color: 'violet', description: 'Full access, including revenue & spend, users and settings' },
  manager: { label: 'Manager', color: 'indigo', description: 'All departments and team progress' },
  csm: { label: 'CSM', color: 'sky', description: 'Clients, sub-accounts, zip code submissions' },
  ops: { label: 'Operations', color: 'emerald', description: 'Zip review queue, data requests to CJ' },
  data: { label: 'Data (CJ)', color: 'amber', description: 'Receives data requests, uploads contact sheets' },
  finance: { label: 'Finance', color: 'rose', description: 'Clients, tasks and the users map' },
  // Tech & staff roles: see the dashboard, their tasks and notifications.
  developer: { label: 'Developer', color: 'indigo', group: 'Tech team', description: 'Tasks, deadlines and team notifications' },
  backend_developer: { label: 'Backend Developer', color: 'indigo', group: 'Tech team', description: 'Submits zip codes and processes the contact sheets admins upload' },
  frontend_developer: { label: 'Frontend Developer', color: 'indigo', group: 'Tech team', description: 'Tasks, deadlines and team notifications' },
  designer: { label: 'Designer', color: 'violet', group: 'Tech team', description: 'Tasks, deadlines and team notifications' },
  qa: { label: 'QA / Tester', color: 'sky', group: 'Tech team', description: 'Tasks, deadlines and team notifications' },
  sales: { label: 'Sales', color: 'emerald', group: 'Staff', description: 'Tasks plus the live sub-account list and users map' },
  support: { label: 'Customer Support', color: 'amber', group: 'Staff', description: 'Tasks plus the live sub-account list and users map' },
  marketing: { label: 'Marketing', color: 'rose', group: 'Staff', description: 'Tasks and the users map' },
  hr: { label: 'HR', color: 'slate', group: 'Staff', description: 'Tasks and team notifications' },
  pending: { label: 'Pending', color: 'slate', description: 'Awaiting admin approval' },
};

const TECH = ['developer', 'backend_developer', 'frontend_developer', 'designer', 'qa'];
const STAFF = ['sales', 'support', 'marketing', 'hr'];

export const ASSIGNABLE_ROLES = ['admin', 'manager', 'csm', 'ops', 'data', 'finance', ...TECH, ...STAFF];

/** Role groups for pickers. */
export const ROLE_GROUPS = [
  ['Leadership', ['admin', 'manager']],
  ['Operations', ['csm', 'ops', 'data', 'finance']],
  ['Tech team', TECH],
  ['Staff', STAFF],
];

/** Role picker groups. Only super admins may hand out the Super Admin role. */
// Only Super Admins create or promote Admins (and other Super Admins).
// Admins can give every other role, but not Admin.
export const roleGroupsFor = (isSuperAdmin) => (isSuperAdmin
  ? ROLE_GROUPS.map(([g, roles]) => (g === 'Leadership' ? [g, ['superadmin', ...roles]] : [g, roles]))
  : ROLE_GROUPS.map(([g, roles]) => [g, roles.filter((r) => r !== 'admin')]));

/** Flat list of roles the signed-in user may hand out. */
export const assignableFor = (isSuperAdmin) => (isSuperAdmin
  ? ['superadmin', ...ASSIGNABLE_ROLES]
  : ASSIGNABLE_ROLES.filter((r) => r !== 'admin'));

/** Roles only a Super Admin may create, edit or remove. */
export const PROTECTED_ROLES = ['superadmin', 'admin'];

// Built-in departments: always offered in department pickers, each run by a manager.
// More can be added in Settings.
export const DEFAULT_DEPARTMENTS = ['Sending Department', 'Operations Department', 'Client Success Department'];

// Which roles can open which section of the app.
// Super admins get every area an admin has (added below), plus `superAdmin`.
const BASE_ACCESS = {
  dashboard: ['admin', 'manager', 'csm', 'ops', 'data', 'finance', ...TECH, ...STAFF],
  clients: ['admin', 'manager', 'csm', 'ops', 'finance'],
  clientsEdit: ['admin', 'manager', 'csm'],
  zipSubmit: ['admin', 'manager', 'csm', 'backend_developer'],
  // Zip → contact-sheet workflow (shared tasks)
  workflow: ['admin', 'manager', 'csm', 'backend_developer'],
  zipQueue: ['admin', 'manager', 'ops'],
  zipOverride: ['admin', 'manager'],
  revenue: ['admin'], // Revenue & client spend is admin-only
  map: ['admin', 'manager', 'csm', 'ops', 'data', 'finance', 'sales', 'support', 'marketing'],
  agency: ['admin', 'manager', 'csm', 'ops', 'data', 'sales', 'support'],
  tasks: ['admin', 'manager', 'csm', 'ops', 'data', 'finance', ...TECH, ...STAFF],
  teamProgress: ['admin', 'manager'],
  team: ['admin'],
  settings: ['admin'],
};

export const ACCESS = {
  ...Object.fromEntries(Object.entries(BASE_ACCESS).map(([area, roles]) => [area, roles.includes('admin') ? ['superadmin', ...roles] : roles])),
  superAdmin: ['superadmin'],
};

/** Roles with admin powers. Super admins can do everything an admin can. */
export const ADMIN_ROLES = ['superadmin', 'admin'];
export const isAdminRole = (role) => ADMIN_ROLES.includes(role);

export const can = (role, area) => Boolean(role && ACCESS[area]?.includes(role));

export const ZIP_STATUS = {
  flagged: { label: 'Flagged – cooldown', color: 'red' },
  pending: { label: 'Pending review', color: 'amber' },
  approved: { label: 'Approved', color: 'emerald' },
  requested: { label: 'Data requested', color: 'sky' },
  fulfilled: { label: 'Delivered', color: 'violet' },
  rejected: { label: 'Rejected', color: 'slate' },
  dismissed: { label: 'Dismissed', color: 'slate' },
};

export const DATA_REQUEST_STATUS = {
  open: { label: 'Waiting on CJ', color: 'amber' },
  fulfilled: { label: 'Uploaded', color: 'emerald' },
  cancelled: { label: 'Cancelled', color: 'slate' },
};

export const TASK_STATUS = {
  todo: { label: 'To do', color: 'slate' },
  in_progress: { label: 'In progress', color: 'sky' },
  done: { label: 'Done', color: 'emerald' },
};

export const TASK_PRIORITY = {
  low: { label: 'Low', color: 'slate' },
  medium: { label: 'Medium', color: 'amber' },
  high: { label: 'High', color: 'red' },
};

export const CLIENT_STATUS = {
  active: { label: 'Active', color: 'emerald' },
  onboarding: { label: 'Onboarding', color: 'sky' },
  paused: { label: 'Paused', color: 'amber' },
  churned: { label: 'Churned', color: 'slate' },
};

// Payment types. Only `daily` (and negative `adjustment`) count toward spend.
// The one-time $300 setup fee is recorded for completeness but excluded from all spend figures.
export const PAYMENT_TYPES = {
  daily: { label: 'Daily spend', color: 'emerald', countsAsSpend: true },
  adjustment: { label: 'Adjustment / refund', color: 'amber', countsAsSpend: true },
  setup_fee: { label: 'Setup fee (excluded)', color: 'slate', countsAsSpend: false },
};

export const DEFAULT_SETTINGS = {
  companyName: 'Ops CRM',
  cooldownDays: 42, // 6 weeks
  cooldownScope: 'subAccount', // 'subAccount' | 'client' | 'global'
  setupFee: 300,
  dailyMin: 65,
  dailyMax: 400,
  highValueMonthly: 6000, // 30-day spend at/above this = high-value client
  mapEmbedUrl: '',
};

export const COOLDOWN_SCOPES = {
  subAccount: 'Per sub-account – the same sub-account cannot reuse a zip within the cooldown',
  client: 'Per client – no sub-account of the same client can reuse a zip within the cooldown',
  global: 'Global – a zip cannot be used by any client within the cooldown',
};
