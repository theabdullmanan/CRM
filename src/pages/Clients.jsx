import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Activity, Download, FileSpreadsheet, Mail, Phone, SlidersHorizontal, UserCheck, Users, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAgency } from '../hooks/useAgency';
import { useDocument } from '../hooks/useFirestore';
import { useActiveUsers } from '../hooks/useData';
import { cn, downloadCsv, friendlyError } from '../lib/utils';
import { ASSIGN_DOC, assignGhlUsers, ghlUserKey } from '../services/ghlAssignService';
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, PageLoader, SearchInput, Select, Table, Td, Th } from '../components/ui';
import { LiveStatus, SheetPill, SubAccountDrawer } from '../components/agency';
import { sheetMeta } from '../lib/agency';

const PAGE = 100;
const UNASSIGNED = '__none';
const uniq = (list) => [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b));
const stop = (e) => e.stopPropagation();

// Sheet status filter: the status column from the Google Sheet, per sub-account.
const NOT_IN_SHEET = '__none';
const sheetKey = (p) => (p.sub.sheetStatus || '').toLowerCase() || NOT_IN_SHEET;
const SHEET_ORDER = ['active', 'pending', 'paused', 'no contacts', NOT_IN_SHEET];
const DOT = { emerald: 'bg-emerald-500', red: 'bg-rose-500', amber: 'bg-amber-500', sky: 'bg-sky-500', slate: 'bg-slate-400' };
const sheetLabel = (key, raw) => (key === NOT_IN_SHEET ? sheetMeta('') : sheetMeta(raw || key));

/** Segmented sheet-status filter with a live count per status. */
function SheetTabs({ value, onChange, counts, total }) {
  const tabs = [['all', 'All users', null, total], ...counts.map(([key, raw, n]) => [key, sheetLabel(key, raw).label, sheetLabel(key, raw).color, n])];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tabs.map(([key, label, color, n]) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              'group inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-all duration-150',
              active
                ? 'border-brand-500/40 bg-brand-600 text-white shadow-[0_4px_14px_-6px_rgba(80,70,229,.7)]'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900',
            )}
          >
            {color && <span className={cn('h-2 w-2 rounded-full', active ? 'bg-[#ffffff]' : DOT[color] || DOT.slate)} />}
            {label}
            <span className={cn('rounded-full px-1.5 py-px font-mono text-[11px] tabular-nums', active ? 'bg-[#ffffff]/20 text-white' : 'bg-slate-100 text-slate-500 group-hover:text-slate-700')}>
              {n.toLocaleString()}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Compact select with a leading icon, used in the filter toolbar. */
function FilterSelect({ icon: Icon, value, onChange, children, title, active }) {
  return (
    <label className="relative" title={title}>
      <Icon className={cn('pointer-events-none absolute left-3 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2', active ? 'text-brand-600' : 'text-slate-400')} />
      <Select value={value} onChange={onChange}
        className={cn('h-9 w-auto max-w-[220px] pl-8 text-[13px] font-medium', active && 'border-brand-300 bg-brand-50/60 text-brand-800')}>
        {children}
      </Select>
    </label>
  );
}

/** <option>s for CSMs first, then managers. */
function ManagerOptions({ csms, managers }) {
  return (
    <>
      {csms.length > 0 && <optgroup label="CSMs">{csms.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</optgroup>}
      {managers.length > 0 && <optgroup label="Managers">{managers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</optgroup>}
    </>
  );
}

/**
 * Clients = the people on your GoHighLevel sub-accounts (live from n8n),
 * not clients typed in by hand. Admins assign each one to a CSM or manager.
 */
export default function Clients() {
  const { profile, isAdmin } = useAuth();
  const agency = useAgency();
  const { rows, owners } = agency;
  const { data: assignDoc } = useDocument('settings', ASSIGN_DOC);
  const assignments = assignDoc?.assignments || {};
  const { data: team } = useActiveUsers();
  const csms = useMemo(() => team.filter((u) => u.role === 'csm'), [team]);
  const managers = useMemo(() => team.filter((u) => u.role === 'manager'), [team]);
  const byId = useMemo(() => Object.fromEntries(team.map((u) => [u.id, u])), [team]);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sheet, setSheet] = useState('all');
  const [owner, setOwner] = useState(profile.role === 'csm' ? profile.id : '');
  const [ghlCsm, setGhlCsm] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [openKey, setOpenKey] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [bulkTo, setBulkTo] = useState('');
  const [busy, setBusy] = useState(false);

  // One entry per user per sub-account.
  const people = useMemo(() => rows.flatMap((r) => r.users.map((u, i) => ({
    ...u,
    key: ghlUserKey(r, u, i),
    sub: r,
    search: [u.name, u.email, u.phone, r.name, r.csm, r.city, r.state].join(' ').toLowerCase(),
  }))).sort((a, b) => (a.name || '').localeCompare(b.name || '')), [rows]);

  const ghlCsms = useMemo(() => uniq(rows.map((r) => r.csm)), [rows]);
  const assignedTo = (p) => assignments[p.key]?.csmId || '';

  const list = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return people.filter((p) => {
      if (sheet !== 'all' && sheetKey(p) !== sheet) return false;
      if (status === 'active' && !p.sub.isActive) return false;
      if (status === 'inactive' && p.sub.isActive) return false;
      if (ghlCsm && p.sub.csm !== ghlCsm) return false;
      const a = assignments[p.key]?.csmId || '';
      if (owner === UNASSIGNED ? a : owner && a !== owner) return false;
      const name = (assignments[p.key]?.csmName || '').toLowerCase();
      return words.every((w) => p.search.includes(w) || name.includes(w));
    });
  }, [people, search, sheet, status, ghlCsm, owner, assignments]);

  // Count of users per sheet status (known statuses first, then any others found in the sheet).
  const sheetCounts = useMemo(() => {
    const m = new Map();
    people.forEach((p) => {
      const k = sheetKey(p);
      const e = m.get(k) || [k, p.sub.sheetStatus, 0];
      e[2] += 1;
      m.set(k, e);
    });
    const rank = (k) => { const i = SHEET_ORDER.indexOf(k); return i < 0 ? SHEET_ORDER.length - 1 : i; };
    return [...m.values()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
  }, [people]);

  const assignedCount = people.filter((p) => assignments[p.key]).length;
  const current = people.find((p) => p.key === openKey);
  const visible = list.slice(0, shown);
  const allVisiblePicked = visible.length > 0 && visible.every((p) => picked.has(p.key));

  const togglePick = (key) => setPicked((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const toggleAll = () => setPicked((s) => {
    const n = new Set(s);
    visible.forEach((p) => (allVisiblePicked ? n.delete(p.key) : n.add(p.key)));
    return n;
  });

  const assign = async (targets, csmId) => {
    const csm = csmId === UNASSIGNED ? null : byId[csmId];
    if (csmId !== UNASSIGNED && !csm) return;
    setBusy(true);
    try {
      await assignGhlUsers(targets, csm, profile);
      toast.success(csm
        ? `${targets.length === 1 ? targets[0].name || 'User' : `${targets.length} users`} assigned to ${csm.name}`
        : `${targets.length === 1 ? 'User' : `${targets.length} users`} unassigned`);
      return true;
    } catch (e) { toast.error(friendlyError(e)); return false; } finally { setBusy(false); }
  };

  const assignPicked = async () => {
    const targets = people.filter((p) => picked.has(p.key));
    if (await assign(targets, bulkTo)) { setPicked(new Set()); setBulkTo(''); }
  };

  if (agency.status === 'idle' || agency.status === 'loading') return <PageLoader />;
  if (agency.status !== 'ready') {
    return (
      <>
        <PageHeader title="Clients" subtitle="Users of your GoHighLevel sub-accounts." actions={<LiveStatus agency={agency} />} />
        <Card><EmptyState icon={Users} title="GHL data isn't available" message={agency.error || 'Try Refresh in a moment.'} /></Card>
      </>
    );
  }

  const resetPage = () => setShown(PAGE);

  // Chips for every filter that's switched on: [label, clear()].
  const chips = [
    sheet !== 'all' && [`Sheet: ${sheetLabel(sheet, sheetCounts.find(([k]) => k === sheet)?.[1]).label}`, () => setSheet('all')],
    owner && [`Assigned: ${owner === UNASSIGNED ? 'Unassigned' : byId[owner]?.name || 'someone'}`, () => setOwner('')],
    status !== 'all' && [`GHL: ${status === 'active' ? 'Active' : 'Inactive'}`, () => setStatus('all')],
    ghlCsm && [`GHL CSM: ${ghlCsm}`, () => setGhlCsm('')],
    search.trim() && [`“${search.trim()}”`, () => setSearch('')],
  ].filter(Boolean);
  const clearAll = () => { setSheet('all'); setOwner(''); setStatus('all'); setGhlCsm(''); setSearch(''); resetPage(); };

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${people.length.toLocaleString()} users across ${rows.length.toLocaleString()} GoHighLevel sub-accounts · ${assignedCount.toLocaleString()} assigned`}
        actions={(
          <>
            <LiveStatus agency={agency} />
            <Button variant="secondary" icon={Download} onClick={() => downloadCsv('ghl-users.csv', list.map((p) => ({
              name: p.name || '', email: p.email || '', phone: p.phone || '',
              subAccount: p.sub.name, locationId: p.sub.locationId,
              assignedTo: assignments[p.key]?.csmName || '', ghlCsm: p.sub.csm || '',
              city: p.sub.city || '', state: p.sub.state || '', status: p.sub.isActive ? 'Active' : 'Inactive', sheetStatus: sheetMeta(p.sub.sheetStatus).label,
            })))}>Export</Button>
          </>
        )}
      />

      <Card className="overflow-hidden">
        {/* Sheet status */}
        <div className="border-b border-slate-100 px-4 pb-3.5 pt-4">
          <div className="mb-2.5 flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-brand-500" />
            <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-slate-500">Sheet status</p>
          </div>
          <SheetTabs value={sheet} onChange={(v) => { setSheet(v); resetPage(); }} counts={sheetCounts} total={people.length} />
        </div>

        {/* Search + filters */}
        <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 bg-slate-50/50 px-4 py-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); resetPage(); }} placeholder="Search name, email, phone, sub-account, CSM…" className="min-w-[240px] flex-1 sm:max-w-sm" />
          <span className="mx-1 hidden h-6 w-px bg-slate-200 lg:block" />
          <SlidersHorizontal className="hidden h-4 w-4 text-slate-400 lg:block" />
          <FilterSelect icon={UserCheck} value={owner} onChange={(e) => { setOwner(e.target.value); resetPage(); }} active={Boolean(owner)} title="Who the user is assigned to in the CRM">
            <option value="">Assigned to: anyone</option>
            <option value={UNASSIGNED}>Unassigned</option>
            <ManagerOptions csms={csms} managers={managers} />
          </FilterSelect>
          <FilterSelect icon={Activity} value={status} onChange={(e) => { setStatus(e.target.value); resetPage(); }} active={status !== 'all'} title="Sub-account status in GoHighLevel">
            <option value="all">GHL status: all</option>
            <option value="active">GHL: Active</option>
            <option value="inactive">GHL: Inactive</option>
          </FilterSelect>
          {ghlCsms.length > 0 && (
            <FilterSelect icon={Users} value={ghlCsm} onChange={(e) => { setGhlCsm(e.target.value); resetPage(); }} active={Boolean(ghlCsm)} title="CSM recorded in GoHighLevel">
              <option value="">GHL CSM: all</option>
              {ghlCsms.map((c) => <option key={c} value={c}>{c}</option>)}
            </FilterSelect>
          )}
          <p className="ml-auto whitespace-nowrap text-[12.5px] text-slate-500">
            Showing <b className="font-semibold text-slate-900 tabular-nums">{list.length.toLocaleString()}</b> of <span className="tabular-nums">{people.length.toLocaleString()}</span>
          </p>
        </div>

        {/* Active filter chips */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
            <span className="text-[12px] font-medium text-slate-500">Filtered by</span>
            {chips.map(([label, clear]) => (
              <span key={label} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-2.5 pr-1 text-[12px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-100">
                {label}
                <button type="button" onClick={() => { clear(); resetPage(); }} className="rounded-full p-0.5 text-brand-500 transition-colors hover:bg-brand-100 hover:text-brand-800" aria-label={`Remove ${label}`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button type="button" onClick={clearAll} className="ml-1 text-[12px] font-semibold text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline">
              Clear all
            </button>
          </div>
        )}

        {isAdmin && picked.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-[13px] font-medium text-slate-800">{picked.size} selected</p>
            <Select value={bulkTo} onChange={(e) => setBulkTo(e.target.value)} className="w-auto">
              <option value="">Assign to…</option>
              <ManagerOptions csms={csms} managers={managers} />
              <option value={UNASSIGNED}>Remove assignment</option>
            </Select>
            <Button size="sm" icon={UserCheck} loading={busy} disabled={!bulkTo} onClick={assignPicked}>Apply</Button>
            <Button size="sm" variant="ghost" icon={X} onClick={() => setPicked(new Set())}>Clear</Button>
          </div>
        )}

        {isAdmin && !csms.length && !managers.length && (
          <p className="border-b border-slate-100 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800">
            There are no active CSMs or managers yet. Add one from <b>Add user</b> to start assigning clients.
          </p>
        )}

        {list.length === 0 ? (
          <EmptyState icon={Users} title="No users found" message={people.length ? 'No users match these filters.' : 'Your GHL sub-accounts have no users yet.'} action={people.length && chips.length ? <Button variant="secondary" size="sm" icon={X} onClick={clearAll}>Clear filters</Button> : null} />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  {isAdmin && (
                    <Th className="w-10">
                      <input type="checkbox" checked={allVisiblePicked} onChange={toggleAll} aria-label="Select all shown"
                        className="h-4 w-4 cursor-pointer rounded border-slate-300 text-slate-900" />
                    </Th>
                  )}
                  <Th>User</Th><Th>Phone</Th><Th>Sub-account</Th><Th>Assigned CSM</Th><Th>Status</Th><Th>Sheet</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((p) => {
                  const a = assignments[p.key];
                  return (
                    <tr key={p.key} onClick={() => setOpenKey(p.key)}
                      className={cn('cursor-pointer hover:bg-slate-50', (openKey === p.key || picked.has(p.key)) && 'bg-slate-50')}>
                      {isAdmin && (
                        <Td onClick={stop}>
                          <input type="checkbox" checked={picked.has(p.key)} onChange={() => togglePick(p.key)} aria-label={`Select ${p.name || p.email}`}
                            className="h-4 w-4 cursor-pointer rounded border-slate-300 text-slate-900" />
                        </Td>
                      )}
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar name={p.name || p.email} size="sm" />
                          <div className="min-w-0">
                            <p className="max-w-[240px] truncate font-medium text-slate-900">{p.name || '—'}</p>
                            <p className="flex max-w-[240px] items-center gap-1 truncate text-xs text-slate-500"><Mail className="h-3 w-3 shrink-0" />{p.email || '—'}</p>
                          </div>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap text-slate-600">{p.phone ? <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{p.phone}</span> : '—'}</Td>
                      <Td>
                        <p className="max-w-[240px] truncate text-slate-800" title={p.sub.name}>{p.sub.name}</p>
                        <p className="text-xs text-slate-500">{[p.sub.city, p.sub.state].filter(Boolean).join(', ') || '—'}{p.sub.csm ? ` · GHL CSM ${p.sub.csm}` : ''}</p>
                      </Td>
                      <Td onClick={isAdmin ? stop : undefined}>
                        {isAdmin ? (
                          <Select value={assignedTo(p)} disabled={busy} onChange={(e) => assign([p], e.target.value || UNASSIGNED)}
                            className={cn('h-8 w-44 text-[12.5px]', !a && 'text-slate-400')}>
                            <option value="">Unassigned</option>
                            <ManagerOptions csms={csms} managers={managers} />
                            {a && !byId[a.csmId] && <option value={a.csmId}>{a.csmName} (inactive)</option>}
                          </Select>
                        ) : a ? (
                          <span className="flex items-center gap-2"><Avatar name={a.csmName} userId={a.csmId} size="sm" /><span className="text-slate-800">{a.csmName}</span></span>
                        ) : <span className="text-slate-400">Unassigned</span>}
                      </Td>
                      <Td>{p.sub.isActive ? <Badge color="emerald" dot>Active</Badge> : <Badge color="red" dot>Inactive</Badge>}</Td>
                      <Td><SheetPill status={p.sub.sheetStatus} /></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            {list.length > shown && (
              <div className="flex justify-center border-t border-slate-100 p-4">
                <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + PAGE)}>
                  Show more ({(list.length - shown).toLocaleString()} left)
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      <SubAccountDrawer row={current?.sub} owners={owners} onClose={() => setOpenKey(null)} />
    </>
  );
}
