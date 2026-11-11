import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, Download, Layers } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useClients, usePayments, useSubAccounts } from '../hooks/useData';
import { computeSpend } from '../lib/spend';
import { CLIENT_STATUS } from '../lib/constants';
import { downloadCsv, money, fmtDate } from '../lib/utils';
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, PageLoader, SearchInput, Select, StatusBadge, Table, Td, Th } from '../components/ui';
import { ClientFormModal } from '../components/forms';

export default function Clients() {
  const { can, profile } = useAuth();
  const navigate = useNavigate();
  const { data: clients, loading } = useClients();
  const { data: subs } = useSubAccounts();
  const { data: payments } = usePayments();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [mine, setMine] = useState(profile.role === 'csm');
  const [showForm, setShowForm] = useState(false);

  const spendByClient = useMemo(() => {
    const { clients: list } = computeSpend(payments);
    return Object.fromEntries(list.map((c) => [c.clientId, c]));
  }, [payments]);

  const subCount = useMemo(() => subs.reduce((m, s) => ({ ...m, [s.clientId]: (m[s.clientId] || 0) + 1 }), {}), [subs]);

  const rows = clients.filter((c) => {
    if (status !== 'all' && c.status !== status) return false;
    if (mine && c.csmId !== profile.id) return false;
    const q = search.toLowerCase();
    return !q || [c.name, c.contactName, c.email, c.csmName].some((v) => v?.toLowerCase().includes(q));
  });

  const showSpend = can('revenue');

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${clients.length} clients · ${subs.length} sub-accounts`}
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={() => downloadCsv('clients.csv', rows.map((c) => ({
              name: c.name, status: c.status, contact: c.contactName, email: c.email, csm: c.csmName,
              dailyRate: c.dailyRate, subAccounts: subCount[c.id] || 0,
              ...(showSpend ? { spend30d: spendByClient[c.id]?.d30 || 0, lifetime: spendByClient[c.id]?.lifetime || 0 } : {}),
            })))}>Export</Button>
            {can('clientsEdit') && <Button icon={Plus} onClick={() => setShowForm(true)}>New client</Button>}
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search clients, contacts, CSM…" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
            <option value="all">All statuses</option>
            {Object.entries(CLIENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
            Only my clients
          </label>
        </div>

        {loading ? <PageLoader /> : rows.length === 0 ? (
          <EmptyState icon={Users} title="No clients found" message={clients.length ? 'Try a different filter.' : 'Add your first client to get started.'}
            action={can('clientsEdit') && !clients.length && <Button icon={Plus} onClick={() => setShowForm(true)}>New client</Button>} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Client</Th><Th>Status</Th><Th>CSM</Th><Th>Sub-accounts</Th><Th className="text-right">Daily rate</Th>
                {showSpend && <><Th className="text-right">30-day spend</Th><Th className="text-right">Lifetime</Th></>}
                <Th>Since</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
                <tr key={c.id} onClick={() => navigate(`/clients/${c.id}`)} className="cursor-pointer hover:bg-slate-50">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name} size="sm" />
                      <div>
                        <p className="font-medium text-slate-900">{c.name}</p>
                        <p className="text-xs text-slate-500">{c.contactName || c.email || '—'}</p>
                      </div>
                    </div>
                  </Td>
                  <Td><StatusBadge map={CLIENT_STATUS} value={c.status} /></Td>
                  <Td>{c.csmName || <span className="text-slate-400">Unassigned</span>}</Td>
                  <Td><Badge color="indigo"><Layers className="h-3 w-3" />{subCount[c.id] || 0}</Badge></Td>
                  <Td className="text-right tabular-nums">{c.dailyRate ? money(c.dailyRate) : '—'}</Td>
                  {showSpend && (
                    <>
                      <Td className="text-right font-medium tabular-nums">{money(spendByClient[c.id]?.d30)}</Td>
                      <Td className="text-right tabular-nums">{money(spendByClient[c.id]?.lifetime)}</Td>
                    </>
                  )}
                  <Td className="text-slate-500">{fmtDate(c.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <ClientFormModal open={showForm} onClose={() => setShowForm(false)} onSaved={(id) => navigate(`/clients/${id}`)} />
    </>
  );
}
