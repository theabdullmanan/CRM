import { useMemo, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { BadgeCheck, CheckCircle2, Code2, Inbox, Send } from 'lucide-react';
import { db } from '../lib/firebase';
import { previewDb } from '../lib/preview';
import { useCollection } from '../hooks/useFirestore';
import { useUsers } from '../hooks/useData';
import { ROLES } from '../lib/constants';
import { cn, fmtDate, fromNow, toDate } from '../lib/utils';
import { WORKFLOW_KIND, DEV_ROLE } from '../services/workflowService';
import { groupJobs } from './workflow';
import {
  Avatar, Badge, Card, CardHeader, EmptyState, ProgressBar, Select, StatCard, Table, Tabs, Td, Th,
} from './ui';

const PERIODS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'all', label: 'All time' },
];

const STAGES = {
  waiting: { label: 'Waiting on CJ', color: 'amber' },
  with_devs: { label: 'With developers', color: 'sky' },
  completed: { label: 'Completed', color: 'emerald' },
};

const stageOf = (j) => (j.process?.status === 'done' ? 'completed' : j.process ? 'with_devs' : 'waiting');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/**
 * Whole request pipeline for the zip → contact-sheet workflow:
 * requester sends zips to CJ → CJ approves (uploads the sheet) and it is assigned to the
 * Backend Developers → the first developer to finish completes it.
 */
export default function RequestPipeline() {
  const [period, setPeriod] = useState('30');
  const [roleF, setRoleF] = useState('');
  const [personF, setPersonF] = useState('');
  const [devF, setDevF] = useState('');
  const [stageF, setStageF] = useState('');
  const [showAll, setShowAll] = useState(false);

  const { data: tasks, loading } = useCollection(
    () => query(collection(db, 'tasks'), where('kind', '==', WORKFLOW_KIND)),
    [],
    () => previewDb.tasks.filter((t) => t.kind === WORKFLOW_KIND),
  );
  const { data: users } = useUsers();
  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);

  // Every run (request), with who sent it, who approved it and which developer completed it.
  const jobs = useMemo(() => groupJobs(tasks).map((j) => {
    const requesterId = j.base.requestedBy || j.base.createdBy;
    return {
      ...j,
      stage: stageOf(j),
      requestedAt: toDate(j.base.requestedAt) || toDate(j.upload?.createdAt) || toDate(j.base.createdAt) || j.at,
      requesterId,
      requesterName: j.base.requestedByName || j.base.createdByName || 'Unknown',
      requesterRole: userById[requesterId]?.role || '',
      approvedByName: j.upload?.completedByName || j.process?.createdByName || '',
      approvedAt: j.upload?.completedAt || j.process?.createdAt || null,
    };
  }), [tasks, userById]);

  // Filter options come from the data itself, so nobody shows up with nothing to filter.
  const requesters = useMemo(() => {
    const m = new Map();
    jobs.forEach((j) => m.set(j.requesterId, { id: j.requesterId, name: j.requesterName, role: j.requesterRole }));
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [jobs]);
  const roleOptions = useMemo(() => [...new Set(requesters.map((r) => r.role).filter(Boolean))], [requesters]);
  const developers = useMemo(() => {
    const m = new Map();
    users.filter((u) => u.role === DEV_ROLE && u.active).forEach((u) => m.set(u.id, { id: u.id, name: u.name }));
    jobs.forEach((j) => { if (j.process?.completedBy) m.set(j.process.completedBy, { id: j.process.completedBy, name: j.process.completedByName || userById[j.process.completedBy]?.name || 'Unknown' }); });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [users, jobs, userById]);

  const filtered = useMemo(() => {
    const since = period === 'all' ? null : Date.now() - Number(period) * 864e5;
    return jobs.filter((j) => {
      if (since && j.requestedAt < since) return false;
      if (roleF && j.requesterRole !== roleF) return false;
      if (personF && j.requesterId !== personF) return false;
      if (stageF && j.stage !== stageF) return false;
      if (devF) {
        const p = j.process;
        if (!p) return false;
        // Completed runs count for the developer who finished them; open ones for everyone they were sent to.
        if (p.status === 'done' ? p.completedBy !== devF : !(p.assigneeIds || []).includes(devF)) return false;
      }
      return true;
    }).sort((a, b) => b.requestedAt - a.requestedAt);
  }, [jobs, period, roleF, personF, stageF, devF]);

  const sent = filtered.length;
  const approved = filtered.filter((j) => j.stage !== 'waiting').length;
  const assigned = filtered.filter((j) => j.process).length;
  const completed = filtered.filter((j) => j.stage === 'completed').length;
  const zipTotal = filtered.reduce((s, j) => s + (j.base.zipCount || j.base.zips?.length || 0), 0);

  const byRequester = useMemo(() => {
    const m = new Map();
    filtered.forEach((j) => {
      const r = m.get(j.requesterId) || { id: j.requesterId, name: j.requesterName, role: j.requesterRole, sent: 0, approved: 0, completed: 0, zips: 0 };
      r.sent += 1;
      r.zips += j.base.zipCount || j.base.zips?.length || 0;
      if (j.stage !== 'waiting') r.approved += 1;
      if (j.stage === 'completed') r.completed += 1;
      m.set(j.requesterId, r);
    });
    return [...m.values()].sort((a, b) => b.sent - a.sent || a.name.localeCompare(b.name));
  }, [filtered]);

  const byDeveloper = useMemo(() => developers
    .filter((d) => !devF || d.id === devF)
    .map((d) => {
      const done = filtered.filter((j) => j.process?.status === 'done' && j.process.completedBy === d.id);
      const open = filtered.filter((j) => j.process && j.process.status !== 'done' && (j.process.assigneeIds || []).includes(d.id)).length;
      const last = done.reduce((m, j) => Math.max(m, toDate(j.process.completedAt)?.getTime() || 0), 0);
      return { ...d, completed: done.length, open, last: last ? new Date(last) : null };
    })
    .sort((a, b) => b.completed - a.completed || a.name.localeCompare(b.name)), [developers, filtered, devF]);

  const anyFilter = roleF || personF || devF || stageF;
  const rows = showAll ? filtered : filtered.slice(0, 10);

  return (
    <Card className="mb-6">
      <CardHeader
        title="Request pipeline"
        subtitle="Requests sent to CJ → approved by CJ and assigned to the Backend Developers → completed. One request = one person's zip codes for one sub-account."
      />
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs size="sm" tabs={PERIODS} value={period} onChange={setPeriod} />
          <Select className="h-9 w-auto min-w-[150px]" value={roleF} onChange={(e) => { setRoleF(e.target.value); setPersonF(''); }}>
            <option value="">All roles</option>
            {roleOptions.map((r) => <option key={r} value={r}>{ROLES[r]?.label || r}</option>)}
          </Select>
          <Select className="h-9 w-auto min-w-[170px]" value={personF} onChange={(e) => setPersonF(e.target.value)}>
            <option value="">Everyone who sent requests</option>
            {requesters.filter((r) => !roleF || r.role === roleF).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Select className="h-9 w-auto min-w-[170px]" value={devF} onChange={(e) => setDevF(e.target.value)}>
            <option value="">All backend developers</option>
            {developers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select className="h-9 w-auto min-w-[150px]" value={stageF} onChange={(e) => setStageF(e.target.value)}>
            <option value="">All stages</option>
            {Object.entries(STAGES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </Select>
          {anyFilter && (
            <button onClick={() => { setRoleF(''); setPersonF(''); setDevF(''); setStageF(''); }} className="px-2 text-[13px] font-medium text-slate-500 hover:text-slate-900">
              Clear filters
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Requests sent to CJ" value={sent} icon={Send} tone="brand" sub={`${zipTotal} zip code${zipTotal === 1 ? '' : 's'}`} />
          <StatCard label="Approved by CJ" value={approved} icon={BadgeCheck} tone="emerald" sub={`${sent - approved} still waiting on CJ`} />
          <StatCard label="Assigned to backend devs" value={assigned} icon={Code2} tone="sky" sub={`${assigned - completed} in progress`} />
          <StatCard label="Completed by backend devs" value={completed} icon={CheckCircle2} tone="violet" sub={`${pct(completed, sent)}% of requests sent`} />
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
        ) : !jobs.length ? (
          <EmptyState icon={Inbox} title="No requests yet" message="Requests appear here as soon as someone submits zip codes." />
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <p className="eyebrow border-b border-slate-100 px-4 py-3">Requests by person</p>
                {byRequester.length ? (
                  <Table>
                    <thead><tr><Th>Sent by</Th><Th className="text-right">Sent</Th><Th className="text-right">Approved</Th><Th className="text-right">Completed</Th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {byRequester.map((r) => (
                        <tr key={r.id} className={cn('cursor-pointer', personF === r.id && 'bg-brand-50/50')} onClick={() => setPersonF(personF === r.id ? '' : r.id)}>
                          <Td>
                            <div className="flex items-center gap-2.5">
                              <Avatar name={r.name} userId={r.id} size="sm" />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-slate-900">{r.name}</p>
                                <p className="text-[11.5px] text-slate-500">{ROLES[r.role]?.label || '—'} · {r.zips} zips</p>
                              </div>
                            </div>
                          </Td>
                          <Td className="text-right font-semibold tabular-nums text-slate-900">{r.sent}</Td>
                          <Td className="text-right tabular-nums">{r.approved}</Td>
                          <Td className="text-right tabular-nums">{r.completed}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                ) : <p className="px-4 py-6 text-center text-[13px] text-slate-500">No requests match these filters.</p>}
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <p className="eyebrow border-b border-slate-100 px-4 py-3">Backend developers</p>
                {byDeveloper.length ? (
                  <Table>
                    <thead><tr><Th>Developer</Th><Th className="text-right">Completed</Th><Th className="text-right">Open</Th><Th>Share</Th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {byDeveloper.map((d) => (
                        <tr key={d.id} className={cn('cursor-pointer', devF === d.id && 'bg-brand-50/50')} onClick={() => setDevF(devF === d.id ? '' : d.id)}>
                          <Td>
                            <div className="flex items-center gap-2.5">
                              <Avatar name={d.name} userId={d.id} size="sm" />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-slate-900">{d.name}</p>
                                <p className="text-[11.5px] text-slate-500">{d.last ? `Last completed ${fromNow(d.last)}` : 'Nothing completed yet'}</p>
                              </div>
                            </div>
                          </Td>
                          <Td className="text-right font-semibold tabular-nums text-slate-900">{d.completed}</Td>
                          <Td className="text-right tabular-nums">{d.open}</Td>
                          <Td className="w-28"><ProgressBar value={pct(d.completed, completed)} tone="bg-brand-500" /></Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                ) : <p className="px-4 py-6 text-center text-[13px] text-slate-500">No backend developers yet.</p>}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <p className="eyebrow">All requests <span className="ml-1 rounded bg-slate-100 px-1.5 font-mono text-[11px] text-slate-600">{filtered.length}</span></p>
                {filtered.length > 10 && (
                  <button onClick={() => setShowAll((v) => !v)} className="text-[13px] font-medium text-slate-600 hover:text-slate-900">
                    {showAll ? 'Show fewer' : `Show all ${filtered.length}`}
                  </button>
                )}
              </div>
              {filtered.length ? (
                <Table>
                  <thead>
                    <tr><Th>Sent</Th><Th>Sent by</Th><Th>Client › Sub-account</Th><Th className="text-right">Zips</Th><Th>Stage</Th><Th>Approved by CJ</Th><Th>Completed by</Th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((j) => (
                      <tr key={j.jobId}>
                        <Td className="whitespace-nowrap text-slate-500" title={fmtDate(j.requestedAt, 'MMM d, yyyy h:mm a')}>{fmtDate(j.requestedAt)}</Td>
                        <Td className="whitespace-nowrap">
                          <p className="font-medium text-slate-900">{j.requesterName}</p>
                          <p className="text-[11.5px] text-slate-500">{ROLES[j.requesterRole]?.label || ''}</p>
                        </Td>
                        <Td className="max-w-[260px] truncate">{j.base.clientName} <span className="text-slate-400">›</span> {j.base.subAccountName}</Td>
                        <Td className="text-right tabular-nums">{j.base.zipCount || j.base.zips?.length || 0}</Td>
                        <Td><Badge color={STAGES[j.stage].color} dot>{STAGES[j.stage].label}</Badge></Td>
                        <Td className="whitespace-nowrap">{j.approvedByName ? <>{j.approvedByName} <span className="text-slate-400">· {fromNow(j.approvedAt)}</span></> : <span className="text-slate-400">—</span>}</Td>
                        <Td className="whitespace-nowrap">
                          {j.process?.status === 'done'
                            ? <>{j.process.completedByName} <span className="text-slate-400">· {fromNow(j.process.completedAt)}</span></>
                            : j.process ? <span className="text-slate-500">Open to {j.process.assigneeIds?.length || 0} developer{j.process.assigneeIds?.length === 1 ? '' : 's'}</span>
                              : <span className="text-slate-400">—</span>}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : <p className="px-4 py-6 text-center text-[13px] text-slate-500">No requests match these filters.</p>}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
