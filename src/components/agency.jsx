import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Copy, ExternalLink, Mail, Phone, RefreshCw, X } from 'lucide-react';
import { refreshAgency } from '../hooks/useAgency';
import { ago, bizOf, dayStr, sheetMeta, ZSTATE } from '../lib/agency';
import { cn } from '../lib/utils';

const num = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString());
import { Avatar, Badge, Button, ease, ProgressBar } from './ui';

export function SheetPill({ status }) {
  const m = sheetMeta(status);
  return <Badge color={m.color} dot>{m.label}</Badge>;
}

/** "Live · updated 12m ago" pill with a refresh button. */
export function LiveStatus({ agency }) {
  const [, tick] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 60_000); return () => clearInterval(t); }, []);
  const live = agency.status === 'ready';
  return (
    <div className="flex items-center gap-2">
      <span
        title={live ? 'Updates automatically when n8n saves new data' : agency.error || 'Connecting…'}
        className={cn('inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-[12px] font-medium',
          live ? 'border-up-100 bg-up-50 text-up-700' : 'border-slate-200 bg-white text-slate-500')}
      >
        <span className="relative flex h-2 w-2">
          {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-up opacity-50 [animation-duration:2s]" />}
          <span className={cn('relative inline-flex h-2 w-2 rounded-full', live ? 'bg-up' : 'bg-slate-300')} />
        </span>
        {live ? `Live · updated ${ago(agency.updatedAt)}` : agency.status === 'loading' ? 'Connecting…' : 'Offline'}
      </span>
      <Button
        variant="secondary" size="sm" icon={RefreshCw} loading={busy}
        onClick={async () => {
          setBusy(true);
          try { await refreshAgency(); toast.success('You have the latest data'); } catch (e) { toast.error(`Refresh failed: ${e.code || e.message}`); } finally { setBusy(false); }
        }}
      >
        Refresh
      </Button>
    </div>
  );
}

const zipTone = {
  n: 'bg-up-50 text-up-700 font-semibold',
  r: 'bg-sky-50 text-sky-700 font-semibold',
  e: 'bg-slate-100 text-slate-700',
  d: 'bg-down-50 text-down-600 line-through',
};

/** One zip code chip. `others` = other sub-accounts using the same zip (duplicate). */
export function ZipChip({ x, others = [], hit, onClick }) {
  const dup = x.s !== 'd' && others.length > 0;
  const tip = `${x.z} · ${ZSTATE[x.s]}\nAdded: ${dayStr(x.f)}\nLast used: ${dayStr(x.l)}${x.rm ? `\nRemoved: ${dayStr(x.rm)}` : ''}${x.s === 'r' ? `\nWas deleted, then added back${x.at ? ` on ${dayStr(x.at)}` : ''}` : ''}${dup ? `\nAlso used by: ${others.map((o) => o.name).join('; ')}` : ''}`;
  return (
    <button
      type="button"
      title={tip}
      onClick={onClick}
      className={cn(
        'relative inline-flex items-center gap-0.5 rounded border border-transparent px-1.5 py-0.5 font-mono text-[11.5px] tabular-nums transition-colors',
        zipTone[x.s], dup && 'border-dashed border-amber-500', hit && 'outline outline-2 outline-offset-1 outline-slate-900',
      )}
    >
      {x.z}{dup && <sup className="text-[8.5px] font-bold text-amber-600">{others.length + 1}</sup>}
    </button>
  );
}

export function ZipLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-slate-500">
      <ZipChip x={{ z: 'New', s: 'n' }} /><ZipChip x={{ z: 'Re-added', s: 'r' }} /><ZipChip x={{ z: 'Existing', s: 'e' }} /><ZipChip x={{ z: 'Deleted', s: 'd' }} />
      <span className="rounded border border-dashed border-amber-500 px-1.5 py-0.5 font-mono">Duplicate<sup className="text-amber-600">2</sup></span>
      <span>· Hover a zip for its dates</span>
    </div>
  );
}

export const othersFor = (owners, z, r, sameBiz = false) => (owners[z] || []).filter((o) => o !== r && (!sameBiz || bizOf(o) !== bizOf(r)));

function Copyable({ value }) {
  if (!value) return null;
  return (
    <button
      type="button"
      className="ml-1.5 inline-flex items-center text-slate-400 hover:text-slate-800"
      title="Copy"
      onClick={() => navigator.clipboard?.writeText(value).then(() => toast.success('Copied'), () => toast.error("Couldn't copy"))}
    >
      <Copy className="h-3 w-3" />
    </button>
  );
}

function Row({ k, children }) {
  return (
    <>
      <dt className="text-slate-500">{k}</dt>
      <dd className="min-w-0 break-words text-slate-800">{children}</dd>
    </>
  );
}

/** Right-hand drawer with everything about one GHL sub-account. */
export function SubAccountDrawer({ row: r, owners, onClose }) {
  useEffect(() => {
    if (!r) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [r, onClose]);

  return createPortal(
    <AnimatePresence>
      {r && (
        <div className="fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            className="absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col bg-white shadow-pop"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: 0.28, ease }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={r.name} />
                <div className="min-w-0">
                  <h2 className="truncate text-[15px] font-semibold text-slate-900">{r.name}</h2>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {r.isActive ? <Badge color="emerald" dot>Active</Badge> : <Badge color="red" dot>Inactive</Badge>}
                    <SheetPill status={r.sheetStatus} />
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-[18px] w-[18px]" /></button>
            </div>

            <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-5 text-[13px]">
              <div className="grid grid-cols-3 gap-2">
                {[['Contacts', r.totalContacts, 'text-slate-900'], ['Used', r.usedContacts, 'text-slate-900'], ['Left', r.leftContacts, 'text-up-700']].map(([l, v, c]) => (
                  <div key={l} className="rounded-lg border border-slate-200 p-3">
                    <p className="eyebrow">{l}</p>
                    <p className={cn('mt-1 font-mono text-lg font-semibold tabular-nums', c)}>{num(v)}</p>
                  </div>
                ))}
              </div>
              <ProgressBar value={100 - r.usedPct} className="mt-3" />
              <p className="mt-1.5 text-xs text-slate-500">{r.totalContacts ? `${r.usedPct.toFixed(1)}% used` : 'No contacts'}</p>

              <dl className="mt-5 grid grid-cols-[120px_1fr] gap-x-3 gap-y-2">
                <Row k="Location ID"><span className="font-mono text-xs">{r.locationId}</span><Copyable value={r.locationId} /></Row>
                <Row k="Address">{r.address || '—'} {r.placeholder && <Badge color="amber">placeholder</Badge>}</Row>
                <Row k="Business email">{r.email || '—'}<Copyable value={r.email} /></Row>
                <Row k="Last activity">{r.lastActivity ? `${new Date(r.lastActivity).toLocaleString()} (${ago(r.lastActivity)})` : 'No conversations'}</Row>
                <Row k="Errors">{r.error ? <span className="text-down-600">{r.error}</span> : 'None'}</Row>
              </dl>

              <h3 className="mt-6 text-[13px] font-semibold text-slate-900">Tracking sheet</h3>
              {r.inSheet || r.sheetStatus ? (
                <>
                  <dl className="mt-2 grid grid-cols-[120px_1fr] gap-x-3 gap-y-2">
                    <Row k="Type / industry">{[r.type, r.industryLabel].filter(Boolean).join(' · ') || '—'}</Row>
                    <Row k="CSM">{r.csm || '—'}</Row>
                    <Row k="Sender">{r.sender || '—'}</Row>
                    <Row k="Lead target">{r.leadsTarget || r.leadsWanted || '—'}</Row>
                    <Row k="Leads">{num(r.leadsYesterday)} yesterday · {num(r.leads7d)} in 7 days</Row>
                    <Row k="Appointments">{num(r.apptsToday)} today · {num(r.apptsYesterday)} yesterday</Row>
                    <Row k="Sends per day">{num(r.sendsPerDay)}</Row>
                    <Row k="Start / check">{r.startDate || '—'} · {r.checkDate || '—'}</Row>
                    <Row k="Time zone">{r.timeZone || '—'}{r.sheetState ? ` · ${r.sheetState}` : ''}</Row>
                    {r.costPerLead != null && <Row k="Cost per lead">${num(r.costPerLead)}</Row>}
                  </dl>
                  {r.notes && <p className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-slate-600">{r.notes}</p>}
                </>
              ) : <p className="mt-1 text-slate-500">This sub-account isn't in the tracking sheet.</p>}

              <h3 className="mt-6 flex items-center text-[13px] font-semibold text-slate-900">
                Zip codes ({r.zipCount} in use{r.deletedZips.length ? `, ${r.deletedZips.length} deleted` : ''})
                {r.zipCount > 0 && <Copyable value={r.zips.join(', ')} />}
              </h3>
              {r.newZips.length > 0 && <p className="mt-1 text-xs text-slate-500">{r.newZips.length} new zip{r.newZips.length > 1 ? 's' : ''}{r.newZipsSince ? ` added ${new Date(r.newZipsSince).toLocaleDateString()}` : ''}.</p>}
              {r.zipLog.length ? (
                <div className="mt-2 flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
                  {r.zipLog.map((x) => <ZipChip key={x.z + x.s} x={x} others={x.s !== 'd' ? othersFor(owners, x.z, r) : []} />)}
                </div>
              ) : <p className="mt-1 text-slate-500">No zip codes found for this account.</p>}

              <h3 className="mt-6 text-[13px] font-semibold text-slate-900">Users ({r.userCount})</h3>
              <div className="mt-2 space-y-2">
                {r.users.length ? r.users.map((u, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 px-3 py-2.5">
                    <p className="font-medium text-slate-900">{u.name || '—'}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-slate-500"><Mail className="h-3 w-3" />{u.email || '—'}<Copyable value={u.email} /></p>
                    <p className="flex items-center gap-1.5 text-slate-500"><Phone className="h-3 w-3" />{u.phone || '—'}<Copyable value={u.phone} /></p>
                  </div>
                )) : <p className="text-slate-500">No users on this sub-account.</p>}
              </div>
            </div>

            <div className="border-t border-slate-100 px-6 py-3">
              <a href={`https://app.gohighlevel.com/v2/location/${encodeURIComponent(r.locationId)}/dashboard`} target="_blank" rel="noreferrer">
                <Button icon={ExternalLink}>Open in GoHighLevel</Button>
              </a>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
