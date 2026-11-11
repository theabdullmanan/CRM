import { Timestamp } from 'firebase/firestore';
import { format, formatDistanceToNowStrict, isValid } from 'date-fns';
import { isFirebaseConfigured } from './firebase';

export const cn = (...parts) => parts.filter(Boolean).join(' ');

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp || typeof value?.toDate === 'function') return value.toDate();
  if (typeof value === 'number' || typeof value === 'string') {
    const d = new Date(value);
    return isValid(d) ? d : null;
  }
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
}

export function fmtDate(value, pattern = 'MMM d, yyyy') {
  const d = toDate(value);
  return d ? format(d, pattern) : '—';
}

export function fmtDateTime(value) {
  return fmtDate(value, 'MMM d, yyyy · h:mm a');
}

export function fromNow(value) {
  const d = toDate(value);
  return d ? `${formatDistanceToNowStrict(d)} ${d > new Date() ? 'from now' : 'ago'}` : '—';
}

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export const money = (n, cents = false) => (cents ? usd2 : usd0).format(Number(n) || 0);
export const num = (n) => new Intl.NumberFormat('en-US').format(Number(n) || 0);

/** Normalise a US zip: keeps the 5-digit base, pads leading zeros lost by spreadsheets. */
export function normalizeZip(raw) {
  const s = String(raw ?? '').trim();
  const m = s.match(/^(\d{3,5})(?:-\d{4})?$/);
  if (!m) return null;
  return m[1].padStart(5, '0');
}

/** Splits free text (commas, spaces, new lines, tabs) into normalised, de-duplicated zips. */
export function parseZipList(text) {
  const tokens = String(text || '').split(/[\s,;]+/).filter(Boolean);
  const valid = [];
  const invalid = [];
  const seen = new Set();
  const duplicatesInInput = [];
  for (const t of tokens) {
    const z = normalizeZip(t);
    if (!z) invalid.push(t);
    else if (seen.has(z)) duplicatesInInput.push(z);
    else {
      seen.add(z);
      valid.push(z);
    }
  }
  return { valid, invalid, duplicatesInInput };
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';
}

export function downloadCsv(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function groupBy(list, keyFn) {
  return list.reduce((acc, item) => {
    const k = keyFn(item);
    (acc[k] ||= []).push(item);
    return acc;
  }, {});
}

export function friendlyError(err) {
  if (!isFirebaseConfigured) return 'Preview mode — connect Firebase to save changes.';
  const code = err?.code || '';
  const map = {
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/user-not-found': 'No account found for that email.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'permission-denied': 'You do not have permission to do that.',
    unavailable: 'Network unavailable — changes will sync when you are back online.',
  };
  return map[code] || err?.message || 'Something went wrong.';
}
