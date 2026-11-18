// Shared rule for which CRM clients count toward a CSM's active total, and how a client is
// attributed to a CSM. Used by the CSM leaderboard and the "My Clients" dashboard so every
// screen agrees on the same numbers — see the CRITICAL RULE in the feature spec: one reusable
// function, not one copy per screen.
//
// A client's own `status` field is authoritative; sub-account status is never consulted here.
// Clients already live as one Firestore doc per client regardless of how many sub-accounts they
// have, so filtering `clients` by `csmId` already gives "one client = one count" for free.
import { isAdminRole } from './constants';
import { toDate } from './utils';

/** The exact department name that counts as "CSM" for the new leaderboard/My Clients features
 * — confirmed from DEFAULT_DEPARTMENTS, per the user's explicit decision to filter on
 * department, not role (the two can disagree today; see constants.js for the built-in list). */
export const CSM_DEPARTMENT = 'Client Success Department';

export const isCsmDepartment = (profile) => profile?.department === CSM_DEPARTMENT;

/** Who can open the CSM Leaderboard / My Clients pages: admins, managers, or anyone in the CSM
 * department — mirrors canViewLeaderboard's admin/manager/own-department pattern in lib/leaderboard.js. */
export const canViewCsmFeatures = (profile) => isAdminRole(profile?.role) || profile?.role === 'manager' || isCsmDepartment(profile);

/** Only these statuses count as "active" for a CSM's client total. */
export const ACTIVE_CSM_STATUSES = ['active', 'no_contacts'];

export const isActiveForCsm = (client) => ACTIVE_CSM_STATUSES.includes(client.status);

/** Every CRM client currently assigned to one CSM. */
export const clientsForCsm = (clients, csmId) => clients.filter((c) => c.csmId === csmId);

/**
 * "Off" definition for the My Clients dashboard — still being confirmed with the client (per
 * the standing decision: treat `churned` as Off for now). One place to change both the status
 * list and the lookback window without touching any counting logic.
 */
export const OFF_STATUSES = ['churned'];
export const OFF_WINDOW_DAYS = 30;

/** The date `clients.statusChangedAt` started being written — set to the day the Step 1 rules
 * were deployed. Shown on My Clients as "tracking since <date>" so an Off count of 0 can never
 * be mistaken for "nothing has gone Off," for clients whose last status change predates this.
 * Anchored at noon (no trailing "Z"), same reasoning as paymentService.js's atNoon — a bare
 * date-only string parses as UTC midnight and can display as the wrong day off by one in
 * timezones behind UTC; a local date-time string doesn't have that problem. */
export const STATUS_TRACKING_SINCE = '2026-11-19T12:00:00';

/**
 * True if `client` currently counts as "Off" for the My Clients dashboard: its status is in
 * OFF_STATUSES AND it changed to that status within the last OFF_WINDOW_DAYS. Reads
 * `statusChangedAt` directly off the client doc (not the statusHistory log), so this still works
 * correctly even after a client is reassigned to a different CSM. A client with no
 * `statusChangedAt` yet (its status has never changed since tracking started) is "unknown," not
 * counted — never silently treated as 0 days ago.
 */
export function isOffRecently(client, now = new Date()) {
  if (!OFF_STATUSES.includes(client.status)) return false;
  const changedAt = toDate(client.statusChangedAt);
  if (!changedAt) return false;
  const days = (now.getTime() - changedAt.getTime()) / 86400000;
  return days >= 0 && days <= OFF_WINDOW_DAYS;
}

/** `{ total, active, paused, off }` for one CSM's book, using the shared rules above. */
export function csmClientCounts(clients, csmId, now = new Date()) {
  const mine = clientsForCsm(clients, csmId);
  return {
    total: mine.length,
    active: mine.filter(isActiveForCsm).length,
    paused: mine.filter((c) => c.status === 'paused').length,
    off: mine.filter((c) => isOffRecently(c, now)).length,
  };
}
