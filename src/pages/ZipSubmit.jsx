import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { MapPin, Send, AlertTriangle, CheckCircle2, ShieldAlert, XCircle, Info, Download } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useClients, useSubAccounts, useZipSubmissions } from '../hooks/useData';
import { ZIP_STATUS, COOLDOWN_SCOPES } from '../lib/constants';
import { cn, downloadCsv, fmtDate, friendlyError, parseZipList, toDate } from '../lib/utils';
import { scopeKeyFor, submitZips, dismissFlag, overrideFlag } from '../services/zipService';
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Modal, PageHeader, SearchInput, Select, StatusBadge, Table, Tabs, Td, Textarea, Th, useConfirm,
} from '../components/ui';
import { useAgency } from '../hooks/useAgency';
import { startZipWorkflow } from '../services/workflowService';
import { GhlPicker } from '../components/GhlPicker';

function useCooldownPrecheck(zips, scopeKey) {
  const [locks, setLocks] = useState({});
  const [checking, setChecking] = useState(false);
  const key = `${scopeKey}|${zips.join(',')}`;
  useEffect(() => {
    if (!db || !scopeKey || !zips.length) { setLocks({}); return undefined; }
    let cancelled = false;
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const snaps = await Promise.all(zips.slice(0, 300).map((z) => getDoc(doc(db, 'zipLocks', `${scopeKey}__${z}`))));
        if (cancelled) return;
        const now = new Date();
        const found = {};
        snaps.forEach((s) => {
          if (s.exists() && toDate(s.data().expiresAt) > now) found[s.data().zip] = s.data();
        });
        setLocks(found);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { locks, checking };
}

export default function ZipSubmit() {
  const { profile, settings, can } = useAuth();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const { data: clients } = useClients();
  const [clientId, setClientId] = useState(params.get('client') || '');
  const [subId, setSubId] = useState('');
  // Where the sub-account comes from: live GoHighLevel data (n8n) or CRM clients.
  const [source, setSource] = useState(params.get('client') ? 'crm' : 'ghl');
  const [ghlId, setGhlId] = useState('');
  const { data: subs } = useSubAccounts(clientId || null);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const tab = params.get('tab') || 'all';

  const leadership = can('zipOverride');
  const { data: submissions } = useZipSubmissions(leadership && showAll ? undefined : { field: 'submittedBy', op: '==', value: profile.id });

  useEffect(() => { if (subs.length === 1) setSubId(subs[0].id); }, [subs]);

  // Second check: zips already live in a GoHighLevel sub-account (from n8n's live data).
  const agency = useAgency();
  const ghlRow = source === 'ghl' ? agency.rows.find((r) => r.locationId === ghlId) : null;
  const client = source === 'ghl'
    ? (ghlRow ? { id: `ghl_${ghlRow.locationId}`, name: ghlRow.name } : null)
    : clients.find((c) => c.id === clientId);
  const subAccount = source === 'ghl'
    ? (ghlRow ? { id: ghlRow.locationId, name: [ghlRow.city, ghlRow.state].filter(Boolean).join(', ') || 'GoHighLevel' } : null)
    : subs.find((s) => s.id === subId);
  const parsed = useMemo(() => parseZipList(text), [text]);
  const scopeKey = client && subAccount ? scopeKeyFor(settings.cooldownScope, { clientId: client.id, subAccountId: subAccount.id }) : null;
  const { locks, checking } = useCooldownPrecheck(parsed.valid, scopeKey);
  const blocked = parsed.valid.filter((z) => locks[z]);
  const inGhl = parsed.valid.filter((z) => !locks[z] && agency.owners?.[z]?.length);

  const submit = async () => {
    if (!client || !subAccount) return toast.error(source === 'ghl' ? 'Choose a sub-account first' : 'Choose a client and sub-account first');
    if (!parsed.valid.length) return toast.error('Enter at least one valid zip code');
    setBusy(true);
    try {
      const res = await submitZips({ zips: parsed.valid, client, subAccount, profile, settings, note });
      setResults(res);
      // Accepted zips go to the admins as a task to upload the contact sheet.
      try {
        if (await startZipWorkflow({ results: res, client, subAccount, profile })) toast.success('Sent to the admins: they will upload the contact sheet.');
      } catch (err) { toast.error(`Zips saved, but the admin task couldn't be created: ${friendlyError(err)}`); }
      setText('');
      setNote('');
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => {
    const c = { all: submissions.length };
    submissions.forEach((s) => {
      const k = ['approved', 'requested'].includes(s.status) ? 'progress' : s.status;
      c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [submissions]);

  const filtered = submissions.filter((s) => {
    if (tab === 'flagged' && s.status !== 'flagged') return false;
    if (tab === 'pending' && s.status !== 'pending') return false;
    if (tab === 'progress' && !['approved', 'requested'].includes(s.status)) return false;
    if (tab === 'fulfilled' && s.status !== 'fulfilled') return false;
    const q = search.toLowerCase();
    return !q || [s.zip, s.clientName, s.subAccountName, s.submittedByName].some((v) => v?.toLowerCase().includes(q));
  });

  return (
    <>
      <PageHeader
        title="Submit zip codes"
        subtitle={`Every zip is checked against the ${settings.cooldownDays}-day cooldown, then goes to the admins to upload the contact sheet.`}
      />

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader title="New submission" subtitle="Paste zips separated by commas, spaces or new lines." />
          <div className="space-y-4 p-5">
            <Tabs size="sm" value={source} onChange={(v) => { setSource(v); setGhlId(''); setClientId(''); setSubId(''); }} tabs={[
              { value: 'ghl', label: `GoHighLevel${agency.rows.length ? ` · ${agency.rows.length}` : ''}` },
              { value: 'crm', label: `CRM clients${clients.length ? ` · ${clients.length}` : ''}` },
            ]} />
            {source === 'ghl' ? (
              <Field label="Sub-account" hint={agency.status === 'ready' ? 'Live from n8n. Type to search.' : agency.status === 'loading' || agency.status === 'idle' ? 'Loading live sub-accounts…' : agency.error}>
                <GhlPicker rows={agency.rows} value={ghlId} onChange={setGhlId} disabled={agency.status !== 'ready'} />
              </Field>
            ) : (<>
            {!clients.length && <p className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500">No CRM clients yet. Use the GoHighLevel tab, or add clients on the Clients page.</p>}
            <Field label="Client">
              <Select value={clientId} onChange={(e) => { setClientId(e.target.value); setSubId(''); }}>
                <option value="">Select client…</option>
                {clients.filter((c) => c.status !== 'churned').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Sub-account" hint={clientId && !subs.length ? 'This client has no sub-accounts yet — add one on the client page.' : undefined}>
              <Select value={subId} onChange={(e) => setSubId(e.target.value)} disabled={!subs.length}>
                <option value="">Select sub-account…</option>
                {subs.map((s) => <option key={s.id} value={s.id}>{s.name}{s.accountRef ? ` (${s.accountRef})` : ''}</option>)}
              </Select>
            </Field>
            </>)}
            <Field label="Zip codes">
              <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'85001, 85003\n85004 85006'} className="font-mono" />
            </Field>

            {(parsed.valid.length > 0 || parsed.invalid.length > 0) && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <Badge color="emerald">{parsed.valid.length - blocked.length - inGhl.length} ready</Badge>
                  {blocked.length > 0 && <Badge color="red">{blocked.length} in cooldown</Badge>}
                  {inGhl.length > 0 && <Badge color="amber">{inGhl.length} already in GHL</Badge>}
                  {parsed.invalid.length > 0 && <Badge color="slate">{parsed.invalid.length} invalid</Badge>}
                  {parsed.duplicatesInInput.length > 0 && <Badge color="amber">{parsed.duplicatesInInput.length} repeated (merged)</Badge>}
                  {checking && <span className="text-slate-400">checking cooldown…</span>}
                </div>
                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                  {parsed.valid.map((z) => (
                    <span
                      key={z}
                      title={locks[z] ? `Used by ${locks[z].clientName} › ${locks[z].subAccountName} — eligible ${fmtDate(locks[z].expiresAt)}` : agency.owners?.[z]?.length ? `Already in GoHighLevel: ${agency.owners[z].map((o) => o.name).join('; ')}` : 'Available'}
                      className={cn('rounded-md px-2 py-0.5 font-mono text-xs ring-1 ring-inset', locks[z] ? 'bg-down-50 text-down-700 ring-down-100' : agency.owners?.[z]?.length ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-white text-slate-700 ring-slate-200')}
                    >
                      {z}
                    </span>
                  ))}
                  {parsed.invalid.map((z, i) => (
                    <span key={`${z}-${i}`} className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-400 line-through">{z}</span>
                  ))}
                </div>
                {inGhl.length > 0 && <p className="mt-2 text-xs text-amber-700">Amber zips are already used by another GoHighLevel sub-account. Hover a zip to see which one; you can still submit them.</p>}
                {!scopeKey && parsed.valid.length > 0 && <p className="mt-2 text-xs text-slate-500">Select a sub-account to run the cooldown check.</p>}
              </div>
            )}

            <Field label="Note (optional)"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>

            <Button className="w-full" size="lg" icon={Send} loading={busy} onClick={submit} disabled={!parsed.valid.length || !subAccount}>
              Submit {parsed.valid.length ? `${parsed.valid.length} zip${parsed.valid.length > 1 ? 's' : ''}` : ''}
            </Button>
            <p className="flex gap-2 text-xs text-slate-500">
              <Info className="h-4 w-4 shrink-0" />
              Cooldown rule: {COOLDOWN_SCOPES[settings.cooldownScope]}. Zips still in cooldown are saved as flagged so you can see why.
            </p>
          </div>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader
            title={showAll ? 'All submissions' : 'My submissions'}
            actions={
              <>
                {leadership && (
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" /> All CSMs
                  </label>
                )}
                <Button size="sm" variant="secondary" icon={Download} onClick={() => downloadCsv('zip-submissions.csv', filtered.map((s) => ({
                  zip: s.zip, client: s.clientName, subAccount: s.subAccountName, status: s.status, submittedBy: s.submittedByName, submitted: fmtDate(s.createdAt),
                })))}>CSV</Button>
              </>
            }
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
            <Tabs
              value={tab}
              onChange={(v) => setParams((p) => { p.set('tab', v); return p; })}
              tabs={[
                { value: 'all', label: 'All', count: counts.all },
                { value: 'flagged', label: 'Flagged', count: counts.flagged || 0 },
                { value: 'pending', label: 'Pending', count: counts.pending || 0 },
                { value: 'progress', label: 'With Ops/CJ', count: counts.progress || 0 },
                { value: 'fulfilled', label: 'Delivered', count: counts.fulfilled || 0 },
              ]}
            />
            <SearchInput value={search} onChange={setSearch} placeholder="Search zip, client…" className="sm:w-48" />
          </div>
          {filtered.length === 0 ? <EmptyState icon={MapPin} title="Nothing here yet" /> : (
            <Table className="max-h-[640px] overflow-y-auto">
              <thead><tr><Th>Zip</Th><Th>Client › Sub-account</Th><Th>Status</Th><Th>Submitted</Th><Th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s) => (
                  <tr key={s.id} className={s.status === 'flagged' ? 'bg-down-50/30' : ''}>
                    <Td className="font-mono font-semibold text-slate-900">{s.zip}</Td>
                    <Td>
                      <p className="text-slate-900">{s.clientName}</p>
                      <p className="text-xs text-slate-500">{s.subAccountName}</p>
                    </Td>
                    <Td>
                      <StatusBadge map={ZIP_STATUS} value={s.status} />
                      {s.status === 'flagged' && s.conflict && (
                        <p className="mt-1 max-w-[260px] text-xs text-down-700">
                          Used for {s.conflict.clientName} › {s.conflict.subAccountName} on {fmtDate(s.conflict.lockedAt)}. Eligible <b>{fmtDate(s.conflict.eligibleAt)}</b>.
                        </p>
                      )}
                      {s.status === 'rejected' && s.rejectReason && <p className="mt-1 text-xs text-slate-500">{s.rejectReason}</p>}
                    </Td>
                    <Td className="text-slate-500">{fmtDate(s.createdAt)}{showAll && <span className="block text-xs">{s.submittedByName}</span>}</Td>
                    <Td className="text-right">
                      {s.status === 'flagged' && (
                        <div className="flex justify-end gap-1">
                          {leadership && (
                            <Button size="xs" variant="subtle" icon={ShieldAlert} onClick={async () => {
                              if (await confirm({ title: `Override cooldown for ${s.zip}?`, message: 'This sends the zip to Ops and to the admins for a contact sheet, even though it is inside the cooldown window, and restarts the cooldown for this scope.', confirmLabel: 'Override' })) {
                                try {
                                  await overrideFlag(s, profile, settings);
                                  // The overridden zip joins the normal workflow: admins upload its contact sheet.
                                  await startZipWorkflow({
                                    results: [{ zip: s.zip, status: 'pending' }],
                                    client: { id: s.clientId, name: s.clientName },
                                    subAccount: { id: s.subAccountId, name: s.subAccountName },
                                    profile,
                                    requester: { id: s.submittedBy, name: s.submittedByName },
                                  }).catch((err) => toast.error(`Override applied, but the admin task couldn't be created: ${friendlyError(err)}`));
                                  toast.success('Override applied · sent to the admins for a contact sheet');
                                } catch (e) { toast.error(friendlyError(e)); }
                              }
                            }}>Override</Button>
                          )}
                          <Button size="xs" variant="ghost" onClick={() => dismissFlag(s)}>Dismiss</Button>
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Modal open={Boolean(results)} onClose={() => setResults(null)} title="Submission results" footer={<Button onClick={() => setResults(null)}>Done</Button>}>
        {results && (
          <div className="space-y-4">
            {[
              ['pending', CheckCircle2, 'text-up-600', 'Sent to Ops for review'],
              ['flagged', AlertTriangle, 'text-down-600', 'Flagged — inside the cooldown window'],
              ['error', XCircle, 'text-slate-500', 'Failed — please retry'],
            ].map(([status, Icon, tone, label]) => {
              const list = results.filter((r) => r.status === status);
              if (!list.length) return null;
              return (
                <div key={status}>
                  <p className={cn('mb-2 flex items-center gap-2 text-sm font-semibold', tone)}><Icon className="h-4 w-4" />{list.length} · {label}</p>
                  <div className="space-y-1">
                    {list.map((r) => (
                      <div key={r.zip} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                        <span className="font-mono font-medium">{r.zip}</span>
                        {r.status === 'flagged' && <span className="text-xs text-slate-500">{r.conflict.clientName} › {r.conflict.subAccountName} · eligible {fmtDate(r.eligibleAt)}</span>}
                        {r.status === 'error' && <span className="text-xs text-slate-500">{friendlyError(r.error)}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </>
  );
}
