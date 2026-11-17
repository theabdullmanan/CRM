/**
 * Senders Leaderboard: shared constants and access checks.
 *
 * Data (all new collections, nothing existing is touched):
 *  - leadSendEvents/{ghlLeadId}       one per lead sent with the LEAD_TAG tag, written by n8n (audit trail + de-duplication, incl. tags)
 *  - leadDailyCounts/{businessDayKey} { day, counts.{senderKey}, last.{senderKey}, names.{senderKey} }, written by n8n
 *  - leadAdjustments/{id}             admin corrections (+/-) with a reason; never edited or deleted
 *  - leaderboardSenders/{userId}      who is on the board, their GHL name (matchName) and target override
 *  - leaderboardSettings/config       { defaultTarget, idleMinutes }
 */
import { isAdminRole } from './constants';

export const SENDING_DEPARTMENT = 'Sending Department';
/** Only GHL contacts with this tag are counted. n8n filters on it before writing (docs/leaderboard-n8n.md). */
export const LEAD_TAG = 'lead';
export const LEADERBOARD_DEFAULTS = { defaultTarget: 40, idleMinutes: 60 };
export const DISPLAY_ROLE = 'display';

/**
 * Stable key for a GHL sender name: case-insensitive and trimmed, safe as a Firestore field name.
 * "  John  Smith " → "s_john_smith". n8n uses exactly the same function.
 */
export function senderKeyOf(name) {
  const slug = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `s_${slug || 'unknown'}`;
}

/** Admins, managers (and super admins) manage the leaderboard. */
export const canManageLeaderboard = (role) => isAdminRole(role) || role === 'manager';

/** Who can open the leaderboard: leadership, plus active users in the Sending Department. */
export function canViewLeaderboard(profile) {
  if (!profile?.active) return false;
  if (canManageLeaderboard(profile.role)) return true;
  return String(profile.department || '').trim().toLowerCase() === SENDING_DEPARTMENT.toLowerCase();
}

/** The TV account: role "display" and kept disabled, so no existing rule lets it read anything else. */
export const isDisplayAccount = (profile) => profile?.role === DISPLAY_ROLE && profile?.active === false;

/** Range options for the toggle. */
export const RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
];

/** "just now", "12 min ago", "3 h ago", "2 d ago". */
export function shortAgo(at, now = Date.now()) {
  if (!at) return '';
  const min = Math.floor((now - at.getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}
