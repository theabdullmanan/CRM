import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Database, Copy, UploadCloud, FileSpreadsheet, Trash2, CheckCircle2, Download, CalendarClock, Ban } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useDataRequests } from '../hooks/useData';
import { DATA_REQUEST_STATUS } from '../lib/constants';
import { cn, fmtDate, fmtDateTime, friendlyError, fromNow, num, toDate } from '../lib/utils';
import { cancelDataRequest, completeDataRequest, removeContactSheet, uploadContactSheet } from '../services/zipService';
import { Badge, Button, Card, EmptyState, PageHeader, PageLoader, SearchInput, StatusBadge, Tabs, useConfirm } from '../components/ui';

function RequestCard({ r }) {
  const { profile, role, can } = useAuth();
  const confirm = useConfirm();
  const fileInput = useRef(null);
  const [uploads, setUploads] = useState({});
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const isOpen = r.status === 'open';
  const canUpload = ['admin', 'manager', 'ops', 'data'].includes(role) && isOpen;
  const overdue = isOpen && r.dueDate && toDate(r.dueDate) < new Date();

  const handleFiles = async (files) => {
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) { toast.error(`${file.name} is larger than 25 MB`); continue; }
      setUploads((u) => ({ ...u, [file.name]: 0 }));
      try {
        await uploadContactSheet(r, file, profile, (p) => setUploads((u) => ({ ...u, [file.name]: p })));
        toast.success(`${file.name} uploaded`);
      } catch (e) {
        toast.error(friendlyError(e));
      } finally {
        setUploads((u) => { const n = { ...u }; delete n[file.name]; return n; });
      }
    }
  };

  const complete = async () => {
    if (!(r.files || []).length) return toast.error('Upload at least one contact sheet first');
    setBusy(true);
    try {
      await completeDataRequest(r, profile);
      toast.success('Delivered — CSM and Ops have been notified');
    } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(false); }
  };

  return (
    <Card className={cn(overdue && 'border-down-100')}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-900">{r.clientName} <span className="text-slate-400">›</span> {r.subAccountName}</p>
            <StatusBadge map={DATA_REQUEST_STATUS} value={r.status} />
            {overdue && <Badge color="red">Overdue</Badge>}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Requested by {r.requestedByName} · {fromNow(r.createdAt)}
            {r.dueDate && <> · <CalendarClock className="inline h-3 w-3" /> needed by {fmtDate(r.dueDate)}</>}
            {r.fulfilledAt && <> · delivered {fmtDateTime(r.fulfilledAt)} by {r.fulfilledByName}</>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" icon={Copy} onClick={() => { navigator.clipboard.writeText(r.zips.join('\n')); toast.success('Zips copied'); }}>Copy zips</Button>
          {isOpen && can('zipQueue') && (
            <Button size="sm" variant="ghost" icon={Ban} onClick={async () => {
              if (await confirm({ title: 'Cancel this request?', message: 'Zips go back to the Ops queue as approved.', danger: true, confirmLabel: 'Cancel request' })) cancelDataRequest(r, profile);
            }}>Cancel</Button>
          )}
          {isOpen && canUpload && <Button size="sm" variant="success" icon={CheckCircle2} loading={busy} onClick={complete}>Mark delivered</Button>}
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{r.zips.length} zip codes</p>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {r.zips.map((z) => <span key={z} className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">{z}</span>)}
          </div>
          {r.notes && <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900">{r.notes}</p>}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Contact sheets</p>
          <div className="space-y-2">
            {(r.files || []).map((f) => (
              <div key={f.path} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-up-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{f.name}</p>
                  <p className="text-xs text-slate-500">{(f.size / 1024).toFixed(0)} KB{f.rows != null ? ` · ${num(f.rows)} rows` : ''} · {f.uploadedByName}</p>
                </div>
                <a href={f.url} target="_blank" rel="noreferrer" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"><Download className="h-4 w-4" /></a>
                {canUpload && (
                  <button className="rounded p-1.5 text-slate-400 hover:bg-down-50 hover:text-down-600" onClick={() => removeContactSheet(r, f)}><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
            ))}
            {Object.entries(uploads).map(([name, p]) => (
              <div key={name} className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="truncate text-sm text-slate-700">{name}</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand-500 transition-all" style={{ width: `${p}%` }} /></div>
              </div>
            ))}
            {canUpload && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles([...e.dataTransfer.files]); }}
                onClick={() => fileInput.current?.click()}
                className={cn('flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition', drag ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50')}
              >
                <UploadCloud className="h-6 w-6 text-slate-400" />
                <p className="mt-1 text-sm font-medium text-slate-700">Drop contact sheets or click to upload</p>
                <p className="text-xs text-slate-500">CSV, XLSX · up to 25 MB · CSV rows are counted automatically</p>
                <input ref={fileInput} type="file" multiple accept=".csv,.xlsx,.xls,.txt" className="hidden" onChange={(e) => { handleFiles([...e.target.files]); e.target.value = ''; }} />
              </div>
            )}
            {!canUpload && !(r.files || []).length && <p className="text-sm text-slate-400">No files yet.</p>}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function DataRequests() {
  const { data, loading } = useDataRequests();
  const [tab, setTab] = useState('open');
  const [search, setSearch] = useState('');
  const list = data.filter((r) => {
    if (tab !== 'all' && r.status !== tab) return false;
    const q = search.toLowerCase();
    return !q || [r.clientName, r.subAccountName, ...(r.zips || [])].some((v) => v?.toLowerCase().includes(q));
  });
  const count = (s) => data.filter((r) => r.status === s).length;

  return (
    <>
      <PageHeader title="CJ data requests" subtitle="Ops requests contact data for approved zips; CJ uploads sheets here and they land on the client sub-account." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'open', label: 'Open', count: count('open') },
          { value: 'fulfilled', label: 'Delivered', count: count('fulfilled') },
          { value: 'cancelled', label: 'Cancelled', count: count('cancelled') },
          { value: 'all', label: 'All', count: data.length },
        ]} />
        <SearchInput value={search} onChange={setSearch} placeholder="Search client or zip…" />
      </div>
      {loading ? <PageLoader /> : list.length === 0 ? (
        <Card><EmptyState icon={Database} title={tab === 'open' ? 'No open requests' : 'Nothing here'} message="When Ops sends approved zips, the request appears here and CJ gets notified." /></Card>
      ) : (
        <div className="space-y-4">{list.map((r) => <RequestCard key={r.id} r={r} />)}</div>
      )}
    </>
  );
}
