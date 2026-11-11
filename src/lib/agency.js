/**
 * Live agency data (GoHighLevel sub-accounts), ported from the original Agency Stats dashboard.
 *
 * Source of truth: n8n's "Build Summary" output, saved to Firestore at `dashboard/latest`
 * as `{ payload: "<json string>", updatedAt, totalSubAccounts, errors }`. The CRM only reads it.
 */

export const AGENCY_COLLECTION = 'dashboard';
export const AGENCY_DOC = 'latest';
export const LOW_LEFT_PCT = 10; // "Running low" = less than this % of contacts left

export const pct = (a, b) => (b ? (a / b) * 100 : 0);
export const isLow = (r) => Boolean(r.totalContacts) && pct(r.leftContacts || 0, r.totalContacts) < LOW_LEFT_PCT;

export const shortNum = (n) => {
  if (n == null) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k`;
  return String(n);
};

export function ago(iso) {
  if (!iso) return 'never';
  const d = (Date.now() - new Date(iso).getTime()) / 864e5;
  if (d < 1 / 24) return 'just now';
  if (d < 1) return `${Math.round(d * 24)}h ago`;
  if (d < 60) return `${Math.round(d)}d ago`;
  return `${Math.round(d / 30)} mo ago`;
}

export function parseState(addr) {
  const p = String(addr || '').split(',').map((s) => s.trim()).filter(Boolean);
  const zi = p.findIndex((x) => /^\d{5}(-\d{4})?$/.test(x));
  if (zi > 0 && /^[A-Z]{2}$/.test(p[zi - 1])) return p[zi - 1];
  return p.slice(0, -1).reverse().find((x) => /^[A-Z]{2}$/.test(x)) || '';
}
export function parseCity(addr) {
  const p = String(addr || '').split(',').map((s) => s.trim());
  const i = p.indexOf(parseState(addr));
  return i > 0 ? p[i - 1] : '';
}

/** Zip states written by n8n: n = new, r = re-added, e = existing, d = deleted. */
export const ZSTATE = { n: 'New', r: 'Re-added', e: 'Existing', d: 'Deleted' };
export const dayStr = (d) => (d ? new Date(d * 864e5).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

// zipLog entries: "zip|firstAddedDay|lastUsedDay|state|changedDay|removedDay" (days since epoch)
function zipInfo(r) {
  let log = Array.isArray(r.zipLog)
    ? r.zipLog.map((e) => {
      const [z, f, l, s, at, rm] = String(e).split('|');
      return { z, f: +f || null, l: +l || null, s: s || 'e', at: at ? +at : null, rm: rm ? +rm : null };
    })
    : [];
  if (!log.length && Array.isArray(r.zips)) {
    const nz = new Set(r.newZips || []);
    log = r.zips.map((z) => ({ z, f: null, l: null, s: nz.has(z) ? 'n' : 'e', at: null, rm: null }));
  }
  const order = { n: 0, r: 1, e: 2, d: 3 };
  log.sort((a, b) => order[a.s] - order[b.s] || a.z.localeCompare(b.z));
  const zips = log.filter((x) => x.s !== 'd').map((x) => x.z);
  return {
    zipLog: log,
    zips,
    zipCount: zips.length,
    newZips: log.filter((x) => x.s === 'n' || x.s === 'r').map((x) => x.z),
    deletedZips: log.filter((x) => x.s === 'd').map((x) => x.z),
  };
}

/** Accepts every shape Build Summary has been saved in and returns { summary, rows }. */
export function normalise(raw) {
  let d = raw;
  if (Array.isArray(d) && d[0] && (d[0].subAccounts || d[0].json?.subAccounts)) d = d[0].json || d[0];
  else if (Array.isArray(d)) d = { subAccounts: d.map((x) => x.json || x) };
  if (d && d.json && d.json.subAccounts) d = d.json;
  if (!d || !Array.isArray(d.subAccounts)) throw new Error("This doesn't look like the Build Summary output (no subAccounts list).");

  const rows = d.subAccounts.map((r) => {
    const total = r.totalContacts ?? null;
    const used = r.usedContacts ?? null;
    const left = r.leftContacts ?? (total != null && used != null ? total - used : null);
    const users = Array.isArray(r.users) ? r.users : [];
    return {
      ...r,
      users,
      totalContacts: total,
      usedContacts: used,
      leftContacts: left,
      usedPct: total ? pct(used || 0, total) : 0,
      state: parseState(r.address),
      city: parseCity(r.address),
      placeholder: /\b123 Main St\b/i.test(r.address || ''),
      openAcct: /\b(open account|recycled)\b/i.test(r.name || ''),
      userCount: users.length,
      ...zipInfo(r),
      hasGeo: typeof r.lat === 'number' && typeof r.lng === 'number',
      sheetStatus: (r.sheetStatus || '').trim(),
      industryLabel: r.industry || r.formIndustry || '',
      search: [r.name, r.locationId, r.email, r.address, r.sheetStatus, r.industry, r.csm, r.sender, r.type, r.notes, r.owner,
        ...users.flatMap((u) => [u.name, u.email, u.phone])].join(' ').toLowerCase(),
    };
  });
  return { summary: d, rows };
}

/** zip -> sub-accounts currently using it (deleted zips excluded). */
export function buildOwners(rows) {
  const owners = {};
  rows.forEach((r) => r.zipLog.forEach((x) => { if (x.s !== 'd') (owners[x.z] ||= []).push(r); }));
  return owners;
}

/** Business part of "CSM - Business name", used to ignore duplicates inside one business. */
export const bizOf = (r) => String(r.name || '').replace(/^.*?\s[-–]\s*/, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const SHEET_STATUS = {
  active: { label: 'Active', color: 'emerald', pin: '#089981' },
  paused: { label: 'Paused', color: 'red', pin: '#f23645' },
  'no contacts': { label: 'No contacts', color: 'amber', pin: '#f59e0b' },
  pending: { label: 'Pending', color: 'sky', pin: '#0ea5e9' },
};
export const sheetMeta = (s) => {
  const v = String(s || '').toLowerCase();
  if (!v) return { label: 'Not in sheet', color: 'slate', pin: '#6366f1' };
  return SHEET_STATUS[v] || { label: s, color: 'slate', pin: '#71717a' };
};

export function exportSubAccountsCsv(list) {
  const head = ['Sub-account', 'Location ID', 'Sheet status', 'Industry', 'CSM', 'Sender', 'Lead target', 'Leads yesterday', 'Leads 7 days', 'Zip codes', 'New zip codes', 'Deleted zip codes',
    'Status', 'Address', 'City', 'State', 'Business email', 'Total contacts', 'Used', 'Left', '% used', 'Last activity', 'User names', 'User emails', 'User phones', 'Error'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = list.map((r) => [r.name, r.locationId, r.sheetStatus, r.industryLabel, r.csm || '', r.sender || '', r.leadsTarget || r.leadsWanted || '', r.leadsYesterday ?? '', r.leads7d ?? '',
    r.zips.join(' '), r.newZips.join(' '), r.deletedZips.join(' '), r.isActive ? 'Active' : 'Inactive', r.address, r.city, r.state, r.email, r.totalContacts, r.usedContacts, r.leftContacts,
    r.totalContacts ? r.usedPct.toFixed(1) : '', r.lastActivity || '', r.users.map((u) => u.name).join('; '), r.users.map((u) => u.email).join('; '), r.users.map((u) => u.phone).join('; '), r.error].map(q).join(','));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([`﻿${[head.map(q).join(','), ...lines].join('\n')}`], { type: 'text/csv' }));
  a.download = `sub-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
