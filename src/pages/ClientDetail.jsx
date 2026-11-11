import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Pencil, Trash2, Plus, Mail, Phone, UserCircle2, Layers, MapPin, FileSpreadsheet, DollarSign,
  CalendarDays, TrendingUp, Infinity as InfinityIcon, Download,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useDocument } from '../hooks/useFirestore';
import { useClients, useDataRequests, usePayments, useSubAccounts, useZipSubmissions } from '../hooks/useData';
import { computeSpend, dailySeries, pctChange, withChange } from '../lib/spend';
import { PriceChart } from '../components/charts';
import { CLIENT_STATUS, PAYMENT_TYPES, ZIP_STATUS } from '../lib/constants';
import { downloadCsv, fmtDate, fmtDateTime, friendlyError, money, num } from '../lib/utils';
import {
  Avatar, Badge, Button, Card, CardHeader, Delta, EmptyState, PageLoader, Select, StatCard, StatusBadge, Table, Td, Th, useConfirm,
} from '../components/ui';
import { ClientFormModal, SubAccountFormModal } from '../components/forms';
import PaymentModal from '../components/PaymentModal';
import { deleteClient, deleteSubAccount } from '../services/clientService';
import { deletePayment } from '../services/paymentService';

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { can } = useAuth();
  const { data: client, loading } = useDocument('clients', id);
  const { data: subs } = useSubAccounts(id);
  const { data: zips } = useZipSubmissions({ field: 'clientId', op: '==', value: id });
  const { data: requests } = useDataRequests();
  const { data: payments } = usePayments(id);
  const { data: allClients } = useClients();

  const [editClient, setEditClient] = useState(false);
  const [subModal, setSubModal] = useState({ open: false, sub: null });
  const [payModal, setPayModal] = useState(false);
  const [subFilter, setSubFilter] = useState('all');

  const spend = useMemo(() => computeSpend(payments), [payments]);
  const series = useMemo(() => withChange(dailySeries(spend.byDay, 90)), [spend.byDay]);
  const spark = series.slice(-30).map((d) => d.spend);
  const t = spend.totals;
  const sheets = requests.filter((r) => r.clientId === id && (r.files || []).length);
  const editable = can('clientsEdit');

  const zipStats = useMemo(() => {
    const m = {};
    zips.forEach((z) => {
      const s = (m[z.subAccountId] ||= { total: 0 });
      s[z.status] = (s[z.status] || 0) + 1;
      if (!['flagged', 'rejected', 'dismissed'].includes(z.status)) s.total += 1;
    });
    return m;
  }, [zips]);

  if (loading) return <PageLoader />;
  if (!client) return <EmptyState title="Client not found" action={<Link to="/clients"><Button variant="secondary">Back to clients</Button></Link>} />;

  const visibleZips = zips.filter((z) => subFilter === 'all' || z.subAccountId === subFilter);
  const sortedPayments = [...payments].sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));

  const removeClient = async () => {
    if (!(await confirm({ title: 'Delete client?', message: `This removes ${client.name} and all of its sub-accounts. Zip history and payments are kept.`, danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await deleteClient(client);
      toast.success('Client deleted');
      navigate('/clients');
    } catch (e) { toast.error(friendlyError(e)); }
  };

  return (
    <>
      <Link to="/clients" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> All clients
      </Link>

      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={client.name} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold text-slate-900">{client.name}</h1>
                <StatusBadge map={CLIENT_STATUS} value={client.status} />
                {client.setupFeePaid ? <Badge color="emerald">Setup fee paid</Badge> : <Badge color="amber">Setup fee pending</Badge>}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500">
                {client.contactName && <span className="flex items-center gap-1.5"><UserCircle2 className="h-4 w-4" />{client.contactName}</span>}
                {client.email && <a href={`mailto:${client.email}`} className="flex items-center gap-1.5 hover:text-brand-600"><Mail className="h-4 w-4" />{client.email}</a>}
                {client.phone && <span className="flex items-center gap-1.5"><Phone className="h-4 w-4" />{client.phone}</span>}
                <span className="flex items-center gap-1.5"><DollarSign className="h-4 w-4" />{client.dailyRate ? `${money(client.dailyRate)}/day` : 'No daily rate'}</span>
                <span>CSM: <b className="font-medium text-slate-700">{client.csmName || 'Unassigned'}</b></span>
              </div>
            </div>
          </div>
          {editable && (
            <div className="flex gap-2">
              <Button variant="secondary" icon={Pencil} onClick={() => setEditClient(true)}>Edit</Button>
              {can('zipOverride') && <Button variant="ghost" icon={Trash2} onClick={removeClient} className="text-down-600 hover:bg-down-50">Delete</Button>}
            </div>
          )}
        </div>
        {client.notes && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{client.notes}</p>}
      </Card>

      {can('revenue') && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Today's spend" value={money(t.today)} icon={DollarSign} tone="emerald" delta={pctChange(t.today, t.yesterday)} deltaLabel="vs yesterday" spark={spark.slice(-14)} />
            <StatCard label="Last 7 days" value={money(t.week)} icon={CalendarDays} tone="sky" delta={pctChange(t.week, t.prevWeek)} deltaLabel="vs prior 7d" spark={spark.slice(-7)} />
            <StatCard label="Last 30 days" value={money(t.d30)} icon={TrendingUp} tone="brand" delta={pctChange(t.d30, t.prevD30)} deltaLabel="vs prior 30d" spark={spark} />
            <StatCard label="Lifetime spend" value={money(t.lifetime)} sub="Excludes setup fee" icon={InfinityIcon} tone="violet" />
          </div>
          {t.lifetime > 0 && (
            <Card className="mb-6 overflow-hidden">
              <div className="flex flex-wrap items-baseline gap-3 border-b border-slate-100 px-5 py-4">
                <p className="eyebrow w-full">Daily spend · 90 days</p>
                <span className="font-mono text-[22px] font-semibold tracking-tight text-slate-900 tabular-nums">{money(series[series.length - 1].spend)}</span>
                <Delta value={pctChange(series[series.length - 1].spend, series[0].spend)} />
                <span className="text-xs text-slate-500">over 90 days</span>
              </div>
              <div className="px-2 pb-2 pt-1"><PriceChart data={series} height={240} /></div>
            </Card>
          )}
        </>
      )}

      {/* Sub-accounts */}
      <Card className="mb-6">
        <CardHeader
          title="Sub-accounts"
          subtitle="Zip codes and contact sheets are tracked separately for every sub-account."
          actions={editable && <Button size="sm" icon={Plus} onClick={() => setSubModal({ open: true, sub: null })}>Add sub-account</Button>}
        />
        {subs.length === 0 ? (
          <EmptyState icon={Layers} title="No sub-accounts yet" message="Add one sub-account per client account so data is never overwritten." />
        ) : (
          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
            {subs.map((s) => {
              const st = zipStats[s.id] || {};
              return (
                <div key={s.id} className="rounded-lg border border-slate-200 bg-white p-4 transition-[border-color,box-shadow] duration-200 hover:border-slate-300 hover:shadow-lift">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{s.name}</p>
                      <p className="text-xs text-slate-500">{[s.accountRef, s.market].filter(Boolean).join(' · ') || '—'}</p>
                    </div>
                    <Badge color={s.status === 'active' ? 'emerald' : 'slate'}>{s.status}</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                    {[['Pending', (st.pending || 0) + (st.approved || 0), 'text-amber-600'], ['Requested', st.requested || 0, 'text-sky-600'], ['Delivered', st.fulfilled || 0, 'text-violet-600'], ['Flagged', st.flagged || 0, 'text-down-600']].map(([l, v, c]) => (
                      <div key={l} className="rounded-lg bg-slate-50 py-2">
                        <p className={`text-lg font-semibold ${c}`}>{v}</p>
                        <p className="text-[11px] text-slate-500">{l}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <span>{num(s.deliveredContacts)} contacts · last delivery {fmtDate(s.lastDeliveryAt)}</span>
                    {editable && (
                      <span className="flex gap-1">
                        <button className="rounded p-1 hover:bg-slate-100" onClick={() => setSubModal({ open: true, sub: s })}><Pencil className="h-3.5 w-3.5" /></button>
                        <button className="rounded p-1 hover:bg-down-50 hover:text-down-600" onClick={async () => {
                          if (await confirm({ title: 'Delete sub-account?', message: s.name, danger: true, confirmLabel: 'Delete' })) deleteSubAccount(s.id).catch((e) => toast.error(friendlyError(e)));
                        }}><Trash2 className="h-3.5 w-3.5" /></button>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-5">
        {/* Zip history */}
        <Card className="xl:col-span-3">
          <CardHeader
            title="Zip code history"
            subtitle={`${zips.length} submissions`}
            actions={
              <>
                <Select value={subFilter} onChange={(e) => setSubFilter(e.target.value)} className="h-8 w-auto py-1">
                  <option value="all">All sub-accounts</option>
                  {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
                {can('zipSubmit') && <Link to={`/zip-codes?client=${id}`}><Button size="sm" icon={MapPin}>Submit zips</Button></Link>}
              </>
            }
          />
          {visibleZips.length === 0 ? <EmptyState icon={MapPin} title="No zip codes yet" /> : (
            <Table className="max-h-[480px] overflow-y-auto">
              <thead><tr><Th>Zip</Th><Th>Sub-account</Th><Th>Status</Th><Th>Submitted</Th><Th>Eligible again</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {visibleZips.map((z) => (
                  <tr key={z.id}>
                    <Td className="font-mono font-medium text-slate-900">{z.zip}</Td>
                    <Td>{z.subAccountName}</Td>
                    <Td><StatusBadge map={ZIP_STATUS} value={z.status} /></Td>
                    <Td className="text-slate-500">{fmtDate(z.createdAt)}<span className="block text-xs">{z.submittedByName}</span></Td>
                    <Td className="text-slate-500">{fmtDate(z.status === 'flagged' ? z.conflict?.eligibleAt : z.eligibleAgainAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {/* Contact sheets */}
        <Card className="xl:col-span-2">
          <CardHeader title="Contact sheets" subtitle="Uploaded by CJ, attached to each sub-account" />
          {sheets.length === 0 ? <EmptyState icon={FileSpreadsheet} title="No contact sheets yet" /> : (
            <ul className="divide-y divide-slate-100">
              {sheets.flatMap((r) => r.files.map((f) => (
                <li key={f.path} className="flex items-center gap-3 px-5 py-3">
                  <FileSpreadsheet className="h-5 w-5 shrink-0 text-up-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{f.name}</p>
                    <p className="text-xs text-slate-500">{r.subAccountName} · {r.zips.length} zips{f.rows ? ` · ${num(f.rows)} rows` : ''} · {fmtDate(f.uploadedAt)}</p>
                  </div>
                  <a href={f.url} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-brand-600"><Download className="h-4 w-4" /></a>
                </li>
              )))}
            </ul>
          )}
        </Card>
      </div>

      {can('revenue') && (
        <Card className="mt-6">
          <CardHeader
            title="Payments"
            subtitle={`Setup fees collected: ${money(spend.totals.setupFees)} (excluded from spend)`}
            actions={
              <>
                <Button size="sm" variant="secondary" icon={Download} onClick={() => downloadCsv(`${client.name}-payments.csv`, sortedPayments.map((p) => ({ date: p.day, amount: p.amount, type: p.type, note: p.note })))}>Export</Button>
                <Button size="sm" icon={Plus} onClick={() => setPayModal(true)}>Record payment</Button>
              </>
            }
          />
          {sortedPayments.length === 0 ? <EmptyState icon={DollarSign} title="No payments recorded" /> : (
            <Table className="max-h-[420px] overflow-y-auto">
              <thead><tr><Th>Date</Th><Th>Type</Th><Th>Note</Th><Th className="text-right">Amount</Th><Th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {sortedPayments.slice(0, 200).map((p) => (
                  <tr key={p.id}>
                    <Td>{fmtDate(p.date)}</Td>
                    <Td><StatusBadge map={PAYMENT_TYPES} value={p.type} /></Td>
                    <Td className="text-slate-500">{p.note}{p.subAccountName ? ` · ${p.subAccountName}` : ''}</Td>
                    <Td className={`text-right font-medium tabular-nums ${p.type === 'setup_fee' ? 'text-slate-400 line-through decoration-slate-300' : ''}`}>{money(p.amount, true)}</Td>
                    <Td className="w-10">
                      <button title={`Added by ${p.createdByName} · ${fmtDateTime(p.createdAt)}`} className="rounded p-1 text-slate-400 hover:bg-down-50 hover:text-down-600" onClick={async () => {
                        if (await confirm({ title: 'Delete payment?', message: `${money(p.amount, true)} on ${fmtDate(p.date)}`, danger: true, confirmLabel: 'Delete' })) deletePayment(p);
                      }}><Trash2 className="h-4 w-4" /></button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      <ClientFormModal open={editClient} onClose={() => setEditClient(false)} client={client} />
      <SubAccountFormModal open={subModal.open} onClose={() => setSubModal({ open: false, sub: null })} client={client} subAccount={subModal.sub} />
      <PaymentModal open={payModal} onClose={() => setPayModal(false)} clients={allClients} defaultClientId={id} />
    </>
  );
}
