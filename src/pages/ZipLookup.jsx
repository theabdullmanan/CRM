import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, History, Search, XCircle } from 'lucide-react';
import { useAgency } from '../hooks/useAgency';
import { dayStr, sheetMeta, ZSTATE } from '../lib/agency';
import { cn, num } from '../lib/utils';
import { Button, Card, EmptyState, PageHeader, PageLoader, StatCard, Table, Td, Th } from '../components/ui';
import { LiveStatus, othersFor, SheetPill, SubAccountDrawer, ZipChip, ZipLegend } from '../components/agency';

const TOGGLES = [
  ['dup', 'Duplicates only'],
  ['new', 'New / re-added only'],
  ['del', 'Deleted only'],
  ['showDel', 'Show deleted zips'],
  ['sameBiz', 'Ignore duplicates within the same business'],
];

export default function ZipLookup() {
  const agency = useAgency();
  const { rows, owners } = agency;
  const [input, setInput] = useState('');
  const [zf, setZf] = useState({ dup: false, new: false, del: false, showDel: true, sameBiz: false });
  const [sheetSet, setSheetSet] = useState([]);
  const [limit, setLimit] = useState(40);
  const [openId, setOpenId] = useState(null);

  const raw = input.trim();
  const zipQ = /^\d+$/.test(raw) ? raw.slice(0, 5) : '';
  const text = zipQ ? '' : raw.toLowerCase();

  const stats = useMemo(() => {
    const all = rows.filter((r) => r.zipLog.length);
    const zips = Object.keys(owners);
    return {
      unique: zips.length,
      accounts: all.filter((r) => r.zipCount).length,
      dups: zips.filter((z) => owners[z].some((r) => othersFor(owners, z, r, zf.sameBiz).length)).length,
      nNew: all.reduce((s, r) => s + r.newZips.length, 0),
      nDel: all.reduce((s, r) => s + r.deletedZips.length, 0),
    };
  }, [rows, owners, zf.sameBiz]);

  const hits = useMemo(() => {
    if (!zipQ) return [];
    const out = [];
    rows.forEach((r) => r.zipLog.forEach((x) => { if (x.z.startsWith(zipQ)) out.push({ r, x }); }));
    return out.sort((a, b) => a.x.z.localeCompare(b.x.z) || (a.x.s === 'd') - (b.x.s === 'd'));
  }, [rows, zipQ]);

  const sheetCounts = useMemo(() => {
    const c = {};
    rows.forEach((r) => { const k = r.sheetStatus || '__none'; c[k] = (c[k] || 0) + 1; });
    return Object.entries(c).sort((a, b) => (a[0] === '__none') - (b[0] === '__none') || b[1] - a[1]);
  }, [rows]);

  const list = useMemo(() => {
    const pick = (r, x) => {
      if (x.s === 'd' && !zf.showDel && !zf.del) return false;
      if (zf.del && x.s !== 'd') return false;
      if (zf.new && !(x.s === 'n' || x.s === 'r')) return false;
      if (zf.dup && !(x.s !== 'd' && othersFor(owners, x.z, r, zf.sameBiz).length)) return false;
      return true;
    };
    let out = rows
      .filter((r) => r.zipLog.length && (!sheetSet.length || sheetSet.includes(r.sheetStatus || '__none')))
      .map((r) => ({ r, xs: r.zipLog.filter((x) => pick(r, x)) }))
      .filter((o) => o.xs.length);
    if (zipQ) out = out.filter((o) => o.xs.some((x) => x.z.startsWith(zipQ)));
    if (text) { const words = text.split(/\s+/).filter(Boolean); out = out.filter((o) => words.every((w) => o.r.search.includes(w))); }
    return out.sort((a, b) => a.r.name.localeCompare(b.r.name));
  }, [rows, owners, zf, sheetSet, zipQ, text]);

  if (agency.status === 'idle' || agency.status === 'loading') return <PageLoader />;
  if (agency.status !== 'ready') {
    return <><PageHeader title="Zip code lookup" /><Card><EmptyState icon={AlertTriangle} title="Live data isn't available" message={agency.error} /></Card></>;
  }

  const exact = zipQ.length === 5;
  const live = hits.filter((h) => h.x.s !== 'd');
  const shown = list.slice(0, limit);
  const openRow = rows.find((r) => r.locationId === openId);

  const exportCsv = () => {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Sub-account', 'Location ID', 'Sheet status', 'Zip', 'Zip status', 'Duplicate', 'Also used by', 'Added', 'Last used', 'Removed'].map(q).join(',')];
    list.forEach(({ r }) => r.zipLog.forEach((x) => {
      const o = x.s !== 'd' ? othersFor(owners, x.z, r, zf.sameBiz) : [];
      lines.push([r.name, r.locationId, r.sheetStatus, x.z, ZSTATE[x.s], o.length ? 'Yes' : '', o.map((a) => a.name).join('; '), dayStr(x.f), x.s === 'd' ? dayStr(x.l) : 'In use', x.rm ? dayStr(x.rm) : ''].map(q).join(','));
    }));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv' }));
    a.download = `zip-codes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHeader
        title="Zip code lookup"
        subtitle="Every zip code in use across GoHighLevel sub-accounts. Check a zip before assigning it."
        actions={<><LiveStatus agency={agency} /><Button variant="secondary" icon={Download} onClick={exportCsv}>Export CSV</Button></>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Zip codes in use" value={num(stats.unique)} tone="brand" sub={`across ${num(stats.accounts)} sub-accounts`} />
        <StatCard label="Duplicates" value={num(stats.dups)} tone="amber" sub="Used by 2+ sub-accounts" onClick={() => setZf((s) => ({ ...s, dup: !s.dup }))} />
        <StatCard label="New / re-added" value={num(stats.nNew)} tone="emerald" sub="Latest batches" onClick={() => setZf((s) => ({ ...s, new: !s.new }))} />
        <StatCard label="Deleted" value={num(stats.nDel)} tone="red" sub="Removed from forms" onClick={() => setZf((s) => ({ ...s, del: !s.del }))} />
      </div>

      <Card className="mt-6">
        <div className="space-y-3 border-b border-slate-100 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={input}
              onChange={(e) => { setInput(e.target.value); setLimit(40); }}
              placeholder="Type a zip code (is it already used?) or a sub-account / user name…"
              className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 font-mono text-[15px] text-slate-900 placeholder:font-sans placeholder:text-[14px] placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-[3px] focus:ring-brand-500/15"
              type="search"
              autoComplete="off"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="eyebrow mr-1">Sheet status</span>
            {sheetCounts.map(([k, n]) => {
              const m = sheetMeta(k === '__none' ? '' : k);
              const on = sheetSet.includes(k);
              return (
                <button key={k} onClick={() => setSheetSet((s) => (on ? s.filter((x) => x !== k) : [...s, k]))}
                  className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] transition-colors', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300')}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.pin }} />{m.label}<span className={cn('font-mono', on ? 'text-white/70' : 'text-slate-400')}>{num(n)}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {TOGGLES.map(([k, l]) => (
              <button key={k} onClick={() => setZf((s) => ({ ...s, [k]: !s[k] }))}
                className={cn('rounded-md border px-2 py-1 text-[12px] transition-colors', zf[k] ? 'border-brand-500 bg-brand-50 font-medium text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')}>
                {l}
              </button>
            ))}
          </div>
          <ZipLegend />
        </div>

        {zipQ && (
          <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
            <div className="flex items-start gap-3">
              {exact && (live.length ? <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-down" /> : hits.length ? <History className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-up" />)}
              <p className="text-[14px] text-slate-700">
                {exact ? (live.length
                  ? <><b className="font-mono text-slate-900">{zipQ}</b> is <b className="text-down-600">already used</b> by {live.length} sub-account{live.length > 1 ? 's' : ''}{hits.length > live.length ? ` (and was used before by ${hits.length - live.length} more)` : ''}.</>
                  : hits.length
                    ? <><b className="font-mono text-slate-900">{zipQ}</b> isn't used right now, but it <b>was used before</b>.</>
                    : <><b className="font-mono text-slate-900">{zipQ}</b> <b className="text-up-700">isn't used</b> by any sub-account. It's free to use.</>)
                  : <>{num(hits.length)} zip assignment{hits.length === 1 ? '' : 's'} start with <b className="font-mono">{zipQ}</b>. Type all 5 digits to check one zip.</>}
              </p>
            </div>
            {hits.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                <Table>
                  <thead><tr><Th>Zip</Th><Th>Sub-account</Th><Th>Sheet</Th><Th>Zip status</Th><Th>Added</Th><Th>Last used</Th><Th>Removed</Th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {hits.slice(0, 60).map(({ r, x }) => (
                      <tr key={r.locationId + x.z + x.s} onClick={() => setOpenId(r.locationId)} className="cursor-pointer hover:bg-slate-50">
                        <Td><ZipChip x={x} others={x.s !== 'd' ? othersFor(owners, x.z, r, zf.sameBiz) : []} /></Td>
                        <Td className="font-medium text-slate-900">{r.name}</Td>
                        <Td><SheetPill status={r.sheetStatus} /></Td>
                        <Td>{ZSTATE[x.s]}</Td>
                        <Td className="whitespace-nowrap">{dayStr(x.f)}</Td>
                        <Td className="whitespace-nowrap">{x.s === 'd' ? dayStr(x.l) : 'In use now'}</Td>
                        <Td className="whitespace-nowrap">{x.rm ? dayStr(x.rm) : '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                {hits.length > 60 && <p className="px-4 py-2 text-xs text-slate-500">Showing the first 60. Type more digits to narrow it down.</p>}
              </div>
            )}
          </div>
        )}

        {shown.length === 0 ? <EmptyState title="No zip codes match" /> : (
          <div className="divide-y divide-slate-100">
            {shown.map(({ r, xs }) => {
              const dups = r.zipLog.filter((x) => x.s !== 'd' && othersFor(owners, x.z, r, zf.sameBiz).length).length;
              return (
                <div key={r.locationId} className="grid gap-4 px-5 py-4 md:grid-cols-[280px_1fr]">
                  <div>
                    <button onClick={() => setOpenId(r.locationId)} className="text-left text-[13px] font-semibold text-slate-900 hover:text-brand-700">{r.name}</button>
                    <div className="my-1.5"><SheetPill status={r.sheetStatus} /></div>
                    <p className="text-xs text-slate-500">
                      {num(r.zipCount)} in use
                      {r.newZips.length > 0 && <span className="text-up-700"> · {r.newZips.length} new</span>}
                      {r.deletedZips.length > 0 && <span className="text-down-600"> · {r.deletedZips.length} deleted</span>}
                      {dups > 0 && <span className="text-amber-600"> · {dups} duplicate</span>}
                    </p>
                    {r.newZipsSince && <p className="text-xs text-slate-400">Latest batch {new Date(r.newZipsSince).toLocaleDateString()}</p>}
                  </div>
                  <div className="flex flex-wrap content-start gap-1.5">
                    {xs.map((x) => (
                      <ZipChip key={x.z + x.s} x={x} hit={zipQ && x.z.startsWith(zipQ)} others={x.s !== 'd' ? othersFor(owners, x.z, r, zf.sameBiz) : []}
                        onClick={() => { setInput(x.z); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <span>Showing {num(shown.length)} of {num(list.length)} sub-accounts · click a zip to see every sub-account using it</span>
          {shown.length < list.length && <Button size="sm" variant="secondary" onClick={() => setLimit((l) => l + 40)}>Show more</Button>}
        </div>
      </Card>

      <SubAccountDrawer row={openRow} owners={owners} onClose={() => setOpenId(null)} />
    </>
  );
}
