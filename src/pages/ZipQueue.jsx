import { useMemo, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { ClipboardCheck, Copy, Check, X, Send, Download, Layers } from 'lucide-react';
import { db } from '../lib/firebase';
import { previewDb } from '../lib/preview';
import { useAuth } from '../contexts/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import { ZIP_STATUS } from '../lib/constants';
import { cn, downloadCsv, fmtDate, friendlyError, groupBy } from '../lib/utils';
import { approveSubmissions, createDataRequest, rejectSubmission } from '../services/zipService';
import {
  Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, PageLoader, SearchInput, StatCard, StatusBadge, Textarea,
} from '../components/ui';

function GroupCard({ subs, profile }) {
  const first = subs[0];
  const [selected, setSelected] = useState(() => new Set(subs.map((s) => s.id)));
  const [busy, setBusy] = useState('');
  const [reject, setReject] = useState(null);
  const [reason, setReason] = useState('');
  const [requestOpen, setRequestOpen] = useState(false);
  const [reqNotes, setReqNotes] = useState('');
  const [reqDue, setReqDue] = useState('');

  const chosen = subs.filter((s) => selected.has(s.id));
  const toggle = (id) => setSelected((prev) => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const allOn = chosen.length === subs.length;

  const run = async (label, fn) => {
    setBusy(label);
    try { await fn(); } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(''); }
  };

  const copy = () => {
    navigator.clipboard.writeText(chosen.map((s) => s.zip).join('\n'));
    toast.success(`${chosen.length} zips copied`);
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <p className="font-semibold text-slate-900">{first.clientName} <span className="text-slate-400">›</span> {first.subAccountName}</p>
          <p className="text-xs text-slate-500">{subs.length} valid zip{subs.length > 1 ? 's' : ''} · cooldown checked · oldest {fmtDate(subs[subs.length - 1].createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={Copy} onClick={copy} disabled={!chosen.length}>Copy list</Button>
          <Button size="sm" variant="secondary" icon={Check} loading={busy === 'approve'} disabled={!chosen.some((s) => s.status === 'pending')}
            onClick={() => run('approve', async () => { await approveSubmissions(chosen.filter((s) => s.status === 'pending'), profile); toast.success('Approved'); })}>
            Approve
          </Button>
          <Button size="sm" icon={Send} disabled={!chosen.length} onClick={() => setRequestOpen(true)}>Request data from CJ</Button>
        </div>
      </div>
      <div className="px-5 py-4">
        <label className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500">
          <input type="checkbox" checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(subs.map((s) => s.id)))} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
          Select all ({chosen.length}/{subs.length})
        </label>
        <div className="flex flex-wrap gap-2">
          {subs.map((s) => (
            <div key={s.id} className={cn('group flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition', selected.has(s.id) ? 'border-brand-300 bg-brand-50/50' : 'border-slate-200 bg-white opacity-70')}>
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600" />
              <span className="font-mono font-semibold text-slate-900" title={`${s.submittedByName} · ${fmtDate(s.createdAt)}${s.note ? ` · ${s.note}` : ''}`}>{s.zip}</span>
              {s.status === 'approved' && <Check className="h-3.5 w-3.5 text-up-600" />}
              {s.overriddenBy && <Badge color="violet">override</Badge>}
              <button title="Reject" onClick={() => { setReject(s); setReason(''); }} className="rounded p-0.5 text-slate-300 hover:bg-down-50 hover:text-down-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        {subs.some((s) => s.note) && (
          <div className="mt-3 space-y-1">
            {[...new Set(subs.filter((s) => s.note).map((s) => `${s.submittedByName}: ${s.note}`))].map((n) => (
              <p key={n} className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">{n}</p>
            ))}
          </div>
        )}
      </div>

      <Modal open={Boolean(reject)} onClose={() => setReject(null)} title={`Reject zip ${reject?.zip}?`} subtitle="The cooldown is released and the CSM is notified." size="sm"
        footer={<><Button variant="secondary" onClick={() => setReject(null)}>Cancel</Button><Button variant="danger" loading={busy === 'reject'} onClick={() => run('reject', async () => { await rejectSubmission(reject, profile, reason); setReject(null); toast.success('Rejected'); })}>Reject</Button></>}>
        <Field label="Reason (shown to the CSM)"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Outside service area" /></Field>
      </Modal>

      <Modal open={requestOpen} onClose={() => setRequestOpen(false)} title="Request contact data from CJ"
        subtitle={`${chosen.length} zips for ${first.clientName} › ${first.subAccountName}. Everyone with the Data role is notified automatically.`}
        footer={<><Button variant="secondary" onClick={() => setRequestOpen(false)}>Cancel</Button><Button icon={Send} loading={busy === 'request'} onClick={() => run('request', async () => {
          await createDataRequest({ subs: chosen, profile, notes: reqNotes, dueDate: reqDue ? new Date(`${reqDue}T17:00:00`) : null });
          setRequestOpen(false);
          toast.success('Request sent to CJ');
        })}>Send request</Button></>}>
        <div className="space-y-4">
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg bg-slate-50 p-3">
            {chosen.map((s) => <span key={s.id} className="rounded bg-white px-2 py-0.5 font-mono text-xs ring-1 ring-slate-200">{s.zip}</span>)}
          </div>
          <Field label="Needed by (optional)"><Input type="date" value={reqDue} onChange={(e) => setReqDue(e.target.value)} /></Field>
          <Field label="Notes for CJ"><Textarea rows={3} value={reqNotes} onChange={(e) => setReqNotes(e.target.value)} /></Field>
        </div>
      </Modal>
    </Card>
  );
}

export default function ZipQueue() {
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const { data, loading } = useCollection(
    () => query(collection(db, 'zipSubmissions'), where('status', 'in', ['pending', 'approved'])),
    [],
    () => previewDb.zipSubmissions.filter((z) => ['pending', 'approved'].includes(z.status)),
  );

  const sorted = useMemo(() => [...data].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)), [data]);
  const filtered = sorted.filter((s) => {
    const q = search.toLowerCase();
    return !q || [s.zip, s.clientName, s.subAccountName].some((v) => v?.toLowerCase().includes(q));
  });
  const groups = Object.values(groupBy(filtered, (s) => s.subAccountId)).sort((a, b) => a[0].clientName.localeCompare(b[0].clientName));

  return (
    <>
      <PageHeader
        title="Ops review queue"
        subtitle="Clean, cooldown-checked zip codes grouped by client sub-account."
        actions={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Filter by zip or client…" />
            <Button variant="secondary" icon={Download} onClick={() => downloadCsv('clean-zip-list.csv', filtered.map((s) => ({
              zip: s.zip, client: s.clientName, subAccount: s.subAccountName, status: s.status, submittedBy: s.submittedByName, submitted: fmtDate(s.createdAt),
            })))}>Export clean list</Button>
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Awaiting review" value={data.filter((s) => s.status === 'pending').length} icon={ClipboardCheck} tone="amber" />
        <StatCard label="Approved, not yet sent to CJ" value={data.filter((s) => s.status === 'approved').length} icon={Check} tone="emerald" />
        <StatCard label="Sub-accounts in queue" value={groups.length} icon={Layers} tone="brand" />
      </div>
      {loading ? <PageLoader /> : groups.length === 0 ? (
        <Card><EmptyState icon={ClipboardCheck} title="Queue is clear" message="New CSM submissions that pass the cooldown check will appear here." /></Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => <GroupCard key={`${g[0].subAccountId}-${g.length}`} subs={g} profile={profile} />)}
        </div>
      )}
      <p className="mt-6 text-xs text-slate-400">A green tick next to a zip means it is already approved; zips without one are still <StatusBadge map={ZIP_STATUS} value="pending" />.</p>
    </>
  );
}
