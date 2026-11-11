import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUpDown, Building2, Contact, Download, Activity, BatteryLow, Megaphone, AlertTriangle, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useAgency } from '../hooks/useAgency';
import { ago, exportSubAccountsCsv, isLow, LOW_LEFT_PCT, pct, sheetMeta, shortNum } from '../lib/agency';
import { cn, num } from '../lib/utils';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, PageHeader, PageLoader, SearchInput, Select, StatCard, Table, Tabs, Td, Th } from '../components/ui';
import { LiveStatus, SheetPill, SubAccountDrawer } from '../components/agency';

const VIEWS = {
  all: { label: 'All', f: () => true },
  active: { label: 'Active', f: (r) => r.isActive },
  inactive: { label: 'Inactive', f: (r) => !r.isActive },
  low: { label: 'Running low', f: (r) => r.isActive && isLow(r) },
  full: { label: 'Fully used', f: (r) => r.totalContacts && r.usedPct >= 100 },
  nousers: { label: 'No users', f: (r) => !r.userCount },
  newZips: { label: 'New zips', f: (r) => r.newZips.length > 0 },
  noZips: { label: 'Active, no zips', f: (r) => r.isActive && !r.zipCount },
  errors: { label: 'Errors', f: (r) => Boolean(r.error) },
};

const COLS = [
  ['name', 'Sub-account'], ['sheetStatus', 'Sheet'], ['csm', 'Industry / CSM'], ['state', 'Location'],
  ['totalContacts', 'Contacts', true], ['usedContacts', 'Used', true], ['leftContacts', 'Left', true], ['usedPct', '% used'],
  ['leads7d', 'Leads 7d', true], ['zipCount', 'Zips', true], ['lastActivity', 'Last activity'],
];

const uniq = (rows, f) => [...new Set(rows.map(f).map((x) => String(x || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

function HBars({ items, active, onPick, color = 'bg-slate-800' }) {
  const mx = Math.max(1, ...items.map((x) => x[1]));
  if (!items.length) return <p className="px-5 py-8 text-center text-sm text-slate-400">No data in this view</p>;
  return (
    <div className="space-y-2 px-5 py-4">
      {items.map(([k, n]) => (
        <button key={k} onClick={() => onPick(k)} className="group grid w-full grid-cols-[110px_1fr_44px] items-center gap-3 text-left text-[12.5px]">
          <span className={cn('truncate', active === k ? 'font-semibold text-slate-900' : 'text-slate-600 group-hover:text-slate-900')}>{k}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <span className={cn('block h-full rounded-full transition-all duration-500', active === k ? 'bg-brand-600' : color)} style={{ width: `${(n / mx) * 100}%` }} />
          </span>
          <span className="text-right font-mono tabular-nums text-slate-500">{num(n)}</span>
        </button>
      ))}
    </div>
  );
}

export default function SubAccounts() {
  const agency = useAgency();
  const { rows, owners, summary } = agency;
  const [params, setParams] = useSearchParams();
  const view = VIEWS[params.get('view')] ? params.get('view') : 'all';
  const [q, setQ] = useState(params.get('q') || '');
  const [f, setF] = useState({ sheet: '', csm: '', sender: '', industry: '', state: '' });
  const [sort, setSort] = useState({ key: 'leftContacts', dir: -1 });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [openId, setOpenId] = useState(null);
  const [leadBy, setLeadBy] = useState('csm');

  const setFilter = (k, v) => { setF((s) => ({ ...s, [k]: s[k] === v ? '' : v })); setPage(1); };
  const setView = (v) => { setParams(v === 'all' ? {} : { view: v }); setPage(1); };

  const options = useMemo(() => ({
    sheet: uniq(rows, (r) => r.sheetStatus), csm: uniq(rows, (r) => r.csm), sender: uniq(rows, (r) => r.sender),
    industry: uniq(rows, (r) => r.industryLabel), state: uniq(rows, (r) => r.state),
  }), [rows]);

  const filtered = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (!VIEWS[view].f(r)) return false;
      if (words.length && !words.every((w) => r.search.includes(w))) return false;
      if (f.sheet === '__none' ? r.sheetStatus : f.sheet && r.sheetStatus !== f.sheet) return false;
      if (f.csm && (r.csm || '') !== f.csm) return false;
      if (f.sender && (r.sender || '').trim() !== f.sender) return false;
      if (f.industry && r.industryLabel !== f.industry) return false;
      if (f.state && r.state !== f.state) return false;
      return true;
    });
  }, [rows, view, q, f]);

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    return [...filtered].sort((a, b) => {
      let x = a[key]; let y = b[key];
      if (key === 'lastActivity') { x = x ? Date.parse(x) : 0; y = y ? Date.parse(y) : 0; }
      if (typeof x === 'string' || typeof y === 'string') return String(x || '').localeCompare(String(y || '')) * dir;
      return ((x ?? -1) - (y ?? -1)) * dir;
    });
  }, [filtered, sort]);

  if (agency.status === 'idle' || agency.status === 'loading') return <PageLoader />;
  if (agency.status !== 'ready') {
    return (
      <>
        <PageHeader title="Sub-accounts" subtitle="Live GoHighLevel data from n8n." />
        <Card><EmptyState icon={AlertTriangle} title="Live data isn't available" message={agency.error} /></Card>
      </>
    );
  }

  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const cur = Math.min(page, pages);
  const slice = sorted.slice((cur - 1) * size, cur * size);

  const tot = filtered.reduce((s, r) => s + (r.totalContacts || 0), 0);
  const act = filtered.filter((r) => r.isActive).length;
  const low = filtered.filter((r) => r.isActive && isLow(r)).length;
  const l7 = filtered.reduce((s, r) => s + (r.leads7d || 0), 0);
  const ly = filtered.reduce((s, r) => s + (r.leadsYesterday || 0), 0);

  const sheetCounts = Object.entries(filtered.reduce((m, r) => { const k = r.sheetStatus || '__none'; m[k] = (m[k] || 0) + 1; return m; }, {}))
    .sort((a, b) => b[1] - a[1]);
  const leadKey = leadBy === 'industry' ? 'industryLabel' : leadBy;
  const leads = Object.entries(filtered.reduce((m, r) => { const k = String(r[leadKey] || '').trim(); if (k) m[k] = (m[k] || 0) + (r.leads7d || 0); return m; }, {}))
    .sort((a, b) => b[1] - a[1]).slice(0, 8);
  const states = Object.entries(filtered.reduce((m, r) => { if (r.state) m[r.state] = (m[r.state] || 0) + 1; return m; }, {}))
    .sort((a, b) => b[1] - a[1]).slice(0, 8);
  const anyFilter = q || Object.values(f).some(Boolean);
  const openRow = rows.find((r) => r.locationId === openId);

  return (
    <>
      <PageHeader
        title="Sub-accounts"
        subtitle={`Live GoHighLevel data from n8n · ${num(rows.length)} sub-accounts${summary?.sheet ? ` · ${num(summary.sheet.matchedStatus)} matched to the tracking sheet` : ''}`}
        actions={<><LiveStatus agency={agency} /><Button variant="secondary" icon={Download} onClick={() => exportSubAccountsCsv(sorted)}>Export CSV</Button></>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Sub-accounts" value={num(filtered.length)} icon={Building2} tone="brand" sub={filtered.length !== rows.length ? `of ${num(rows.length)}` : 'in the agency'} />
        <StatCard label="Total contacts" value={shortNum(tot)} icon={Contact} tone="sky" sub={`avg ${shortNum(Math.round(tot / (filtered.length || 1)))} per account`} />
        <StatCard label="Active" value={num(act)} icon={Activity} tone="emerald" sub={`${pct(act, filtered.length).toFixed(0)}% · conversation in ${summary?.activeDays || 30}d`} onClick={() => setView('active')} />
        <StatCard label="Running low" value={num(low)} icon={BatteryLow} tone="red" sub={`Active, under ${LOW_LEFT_PCT}% left`} onClick={() => setView('low')} />
        <StatCard label="Leads · 7 days" value={num(l7)} icon={Megaphone} tone="violet" sub={`${num(ly)} yesterday`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Sheet status" subtitle="Click to filter" />
          <ul className="divide-y divide-slate-100">
            {sheetCounts.map(([k, n]) => {
              const m = sheetMeta(k === '__none' ? '' : k);
              return (
                <li key={k}>
                  <button onClick={() => setFilter('sheet', k)} className={cn('flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-slate-50', f.sheet === k && 'bg-slate-50')}>
                    <span className="h-2 w-2 rounded-full" style={{ background: m.pin }} />
                    <span className="flex-1 text-[13px] font-medium text-slate-800">{m.label}</span>
                    <span className="font-mono text-[12.5px] tabular-nums text-slate-500">{num(n)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Leads · last 7 days" actions={<Tabs size="sm" value={leadBy} onChange={setLeadBy} tabs={[{ value: 'csm', label: 'CSM' }, { value: 'sender', label: 'Sender' }, { value: 'industry', label: 'Industry' }]} />} />
          <HBars items={leads} active={f[leadBy]} onPick={(k) => setFilter(leadBy, k)} color="bg-up" />
        </Card>
        <Card>
          <CardHeader title="Top states" subtitle="Sub-accounts per state · click to filter" />
          <HBars items={states} active={f.state} onPick={(k) => setFilter('state', k)} />
        </Card>
      </div>

      <Card className="mt-6">
        <div className="space-y-3 border-b border-slate-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs size="sm" value={view} onChange={setView} tabs={Object.entries(VIEWS).map(([k, v]) => ({ value: k, label: v.label, count: rows.filter(v.f).length }))} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search accounts, users, CSM, notes, cities…" className="h-9 sm:w-80" />
            {[['sheet', 'Sheet: any'], ['csm', 'All CSMs'], ['sender', 'All senders'], ['industry', 'All industries'], ['state', 'All states']].map(([k, first]) => (
              <Select key={k} value={f[k]} onChange={(e) => { setF((s) => ({ ...s, [k]: e.target.value })); setPage(1); }} className="h-9 w-auto max-w-[180px] py-1">
                <option value="">{first}</option>
                {k === 'sheet' && <option value="__none">Not in sheet</option>}
                {options[k].map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            ))}
            {anyFilter && <Button variant="ghost" size="sm" icon={X} onClick={() => { setQ(''); setF({ sheet: '', csm: '', sender: '', industry: '', state: '' }); }}>Clear</Button>}
            <span className="ml-auto text-xs text-slate-500">Showing {num(sorted.length)} of {num(rows.length)}</span>
          </div>
        </div>

        {sorted.length === 0 ? <EmptyState title="No sub-accounts match these filters" /> : (
          <Table>
            <thead>
              <tr>
                {COLS.map(([k, l, isNum]) => (
                  <Th key={k} className={isNum ? 'text-right' : ''}>
                    <button className="inline-flex items-center gap-1 uppercase hover:text-slate-800" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : (['name', 'state', 'sheetStatus', 'csm'].includes(k) ? 1 : -1) }))}>
                      {l}<ArrowUpDown className={cn('h-3 w-3', sort.key === k ? 'text-slate-900' : 'opacity-40')} />
                    </button>
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {slice.map((r) => {
                const u = r.users[0];
                const lowRow = isLow(r);
                return (
                  <tr key={r.locationId} onClick={() => setOpenId(r.locationId)} className="cursor-pointer hover:bg-slate-50">
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={r.name} size="sm" />
                        <div className="min-w-0">
                          <p className="max-w-[260px] truncate font-medium text-slate-900" title={r.name}>{r.name}</p>
                          <p className="max-w-[260px] truncate text-xs text-slate-500">
                            {u ? `${u.name || u.email}${r.userCount > 1 ? ` · +${r.userCount - 1}` : ''}` : 'No users'}
                            {r.error && <span className="text-down-600"> · ⚠ {r.error}</span>}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td><SheetPill status={r.sheetStatus} /></Td>
                    <Td>
                      <p className="max-w-[160px] truncate">{r.industryLabel || '—'}</p>
                      <p className="max-w-[160px] truncate text-xs text-slate-500">{[r.csm && `CSM ${r.csm}`, r.sender && `Sender ${r.sender}`].filter(Boolean).join(' · ')}</p>
                    </Td>
                    <Td className="whitespace-nowrap">{r.city || r.state ? `${r.city}${r.city && r.state ? ', ' : ''}${r.state}` : <span className="text-slate-400">—</span>}{r.placeholder && <Badge color="amber" className="ml-1">address</Badge>}</Td>
                    <Td className="text-right font-mono text-[12.5px] tabular-nums">{r.totalContacts == null ? '—' : num(r.totalContacts)}</Td>
                    <Td className="text-right font-mono text-[12.5px] tabular-nums">{r.usedContacts == null ? '—' : num(r.usedContacts)}</Td>
                    <Td className={cn('text-right font-mono text-[12.5px] tabular-nums', lowRow && 'font-semibold text-down-600')}>{r.leftContacts == null ? '—' : num(r.leftContacts)}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                          <span className={cn('block h-full rounded-full', r.usedPct >= 100 ? 'bg-down' : r.usedPct >= 90 ? 'bg-amber-500' : 'bg-slate-700')} style={{ width: `${Math.min(100, r.usedPct)}%` }} />
                        </span>
                        <span className="font-mono text-xs tabular-nums text-slate-500">{r.totalContacts ? `${r.usedPct.toFixed(0)}%` : '—'}</span>
                      </div>
                    </Td>
                    <Td className="text-right font-mono text-[12.5px] tabular-nums">
                      {r.leads7d != null ? num(r.leads7d) : <span className="text-slate-400">—</span>}
                      {r.leadsYesterday != null && <p className="text-[11px] text-slate-400">{num(r.leadsYesterday)} yest.</p>}
                    </Td>
                    <Td className="text-right font-mono text-[12.5px] tabular-nums">
                      {r.zipCount ? num(r.zipCount) : <span className="text-slate-400">—</span>}
                      {r.newZips.length > 0 && <p className="text-[11px] font-semibold text-up-700">+{r.newZips.length} new</p>}
                      {r.deletedZips.length > 0 && <p className="text-[11px] text-down-600">{r.deletedZips.length} deleted</p>}
                    </Td>
                    <Td className="whitespace-nowrap">{ago(r.lastActivity)}<p className="text-[11px] text-slate-400">{r.lastActivity ? new Date(r.lastActivity).toLocaleDateString() : ''}</p></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            Rows per page
            <Select value={size} onChange={(e) => { setSize(+e.target.value); setPage(1); }} className="h-8 w-20 py-1 text-xs">
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono tabular-nums">Page {cur} of {pages}</span>
            <Button size="sm" variant="secondary" icon={ChevronLeft} disabled={cur <= 1} onClick={() => setPage(cur - 1)} aria-label="Previous page" />
            <Button size="sm" variant="secondary" icon={ChevronRight} disabled={cur >= pages} onClick={() => setPage(cur + 1)} aria-label="Next page" />
          </div>
        </div>
      </Card>

      <SubAccountDrawer row={openRow} owners={owners} onClose={() => setOpenId(null)} />
    </>
  );
}
