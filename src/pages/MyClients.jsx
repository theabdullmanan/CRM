import { useEffect, useMemo, useState } from 'react';
import { Clock, Users, UserX } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../lib/firebase';
import { useActiveUsers, useClientsForCsm } from '../hooks/useData';
import { csmClientCounts, isCsmDepartment, OFF_WINDOW_DAYS, STATUS_TRACKING_SINCE } from '../lib/csmClients';
import { CLIENT_STATUS } from '../lib/constants';
import { fmtDate } from '../lib/utils';
import {
  Card, CardHeader, EmptyState, PageHeader, PageLoader, Select, StatCard, StatusBadge, Table, Td, Th,
} from '../components/ui';

/** Fetches { leadsYesterday, leads7d } per client for one CSM, via the trusted server-side
 * /api/csm-leads endpoint — never reads System B directly from this page. */
function useCsmLeads(csmId, elevated) {
  const [state, setState] = useState({ status: 'idle', leads: {} });

  useEffect(() => {
    if (!csmId) { setState({ status: 'idle', leads: {} }); return undefined; }
    let cancelled = false;
    setState((s) => ({ ...s, status: 'loading' }));
    (async () => {
      try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/csm-leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify(elevated ? { csmId } : {}),
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(body.error || 'Could not load lead counts');
        setState({ status: 'ready', leads: body.leads || {} });
      } catch (e) {
        if (!cancelled) { console.error('[csm-leads]', e); setState({ status: 'error', leads: {} }); }
      }
    })();
    return () => { cancelled = true; };
  }, [csmId, elevated]);

  return state;
}

export default function MyClients() {
  const { profile, isAdmin, role } = useAuth();
  const elevated = isAdmin || role === 'manager';
  const { data: users, loading: usersLoading } = useActiveUsers();
  const csmUsers = useMemo(() => users.filter(isCsmDepartment), [users]);
  const [selectedCsm, setSelectedCsm] = useState('');

  const targetCsmId = elevated ? selectedCsm : profile.id;
  const targetCsmName = elevated ? csmUsers.find((u) => u.id === selectedCsm)?.name : profile.name;

  const { data: clients, loading: clientsLoading } = useClientsForCsm(targetCsmId);
  const counts = useMemo(() => csmClientCounts(clients, targetCsmId), [clients, targetCsmId]);
  const leads = useCsmLeads(targetCsmId, elevated);

  if (usersLoading) return <PageLoader />;

  return (
    <>
      <PageHeader
        title="My Clients"
        subtitle={targetCsmName ? `${targetCsmName}'s clients · daily numbers` : 'Pick a CSM to view their clients'}
        actions={elevated && (
          <Select value={selectedCsm} onChange={(e) => setSelectedCsm(e.target.value)} className="h-9 w-auto">
            <option value="">Select a CSM…</option>
            {csmUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        )}
      />

      {!targetCsmId ? (
        <EmptyState icon={Users} title="No CSM selected" message="Choose a CSM above to see their Active, Paused and Off clients, plus lead counts." />
      ) : clientsLoading ? (
        <PageLoader />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard label="Active clients" value={counts.active} icon={Users} tone="emerald" />
            <StatCard label="Paused clients" value={counts.paused} icon={Clock} tone="amber" />
            <StatCard label={`Off (last ${OFF_WINDOW_DAYS} days)`} value={counts.off} icon={UserX} tone="red" sub={`Tracking since ${fmtDate(STATUS_TRACKING_SINCE)}`} />
          </div>

          <Card>
            <CardHeader title="Leads received" subtitle="Per client, from the linked GHL sub-account(s) — an admin links these from the client's own page" />
            {clients.length === 0 ? (
              <EmptyState icon={Users} title="No clients assigned yet" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Client</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Leads yesterday</Th>
                    <Th className="text-right">Leads last 7 days</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clients.map((c) => {
                    const linked = (c.ghlLocationIds || []).length > 0;
                    const l = leads.leads[c.id];
                    const cell = (v) => {
                      if (!linked) return <span className="text-slate-400">Not linked</span>;
                      if (leads.status === 'loading') return <span className="text-slate-300">…</span>;
                      if (leads.status === 'error') return <span className="text-down-500">—</span>;
                      // Linked, but its sub-account(s) no longer exist in System B — distinct from a real 0.
                      if (l && l.matched === false) return <span className="text-slate-400">No data</span>;
                      return v ?? 0;
                    };
                    return (
                      <tr key={c.id}>
                        <Td className="font-medium text-slate-900">{c.name}</Td>
                        <Td><StatusBadge map={CLIENT_STATUS} value={c.status} /></Td>
                        <Td className="text-right font-mono tabular-nums">{cell(l?.leadsYesterday)}</Td>
                        <Td className="text-right font-mono tabular-nums">{cell(l?.leads7d)}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}
    </>
  );
}
