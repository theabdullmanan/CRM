import { useMemo } from 'react';
import { format } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import {
  DollarSign, TrendingUp, MapPin, AlertTriangle, ClipboardCheck, CheckSquare, Clock, Users, ArrowRight, Activity, Plus, Building2,
} from 'lucide-react';
import { db } from '../lib/firebase';
import { previewDb } from '../lib/preview';
import { useAuth } from '../contexts/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import { useClients, usePayments, useTasks, useZipSubmissions } from '../hooks/useData';
import { computeSpend, dailySeries, pctChange, withChange } from '../lib/spend';
import { ROLES, TASK_PRIORITY } from '../lib/constants';
import { cn, fmtDateTime, fromNow, money, toDate } from '../lib/utils';
import { Avatar, Button, Card, CardHeader, Delta, EmptyState, MiniSpark, StatCard, StatusBadge } from '../components/ui';
import { PriceChart } from '../components/charts';
import { WorkflowBoard } from '../components/workflow';
import { useAgency } from '../hooks/useAgency';
import { isLow, LOW_LEFT_PCT, pct as pctOf, shortNum } from '../lib/agency';

const ACTION_LABEL = {
  'zip.submit': (d) => `submitted zips for ${d.subAccount} (${d.accepted} accepted, ${d.flagged} flagged)`,
  'zip.approve': (d) => `approved ${d.count} zip codes`,
  'zip.reject': (d) => `rejected zip ${d.zip}`,
  'zip.override': (d) => `overrode the cooldown for ${d.zip}`,
  'data.request': (d) => `requested data from CJ for ${d.subAccount} (${d.zips} zips)`,
  'data.fulfilled': (d) => `delivered contact sheets for ${d.subAccount}`,
  'task.create': (d) => `assigned "${d.title}" to ${d.assignee}`,
  'task.done': (d) => `completed "${d.title}"${d.late ? ' (late)' : ''}`,
  'client.create': (d) => `added client ${d.name}`,
  'client.update': (d) => `updated client ${d.name}`,
  'client.assign': (d) => `assigned ${d.count} client${d.count === 1 ? '' : 's'} to ${d.csm}`,
  'client.unassign': (d) => `unassigned ${d.count} client${d.count === 1 ? '' : 's'}`,
  'payment.add': (d) => `recorded ${money(d.amount)} for ${d.client}`,
  'payment.daily': (d) => `logged daily charges for ${d.clients} clients`,
  'payment.import': (d) => `imported ${d.rows} payments`,
  'workflow.submit': (d) => `submitted ${d.zips} zips for ${d.subAccount} (waiting for a CSV)`,
  'workflow.upload': (d) => `uploaded the contact sheet for ${d.subAccount} (${Number(d.rows || 0).toLocaleString()} rows)`,
  'workflow.done': (d) => `completed "${d.title}"`,
  'user.create': (d) => `added ${d.name} as ${ROLES[d.role]?.label || d.role}`,
  'user.approve': (d) => `approved ${d.name} as ${ROLES[d.role]?.label || d.role}`,
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard() {
  const { profile, role, can, settings } = useAuth();
  const navigate = useNavigate();
  const { data: payments } = usePayments();
  const { data: myTasks } = useTasks('mine');
  const { data: mySubs } = useZipSubmissions(can('zipSubmit') ? { field: 'submittedBy', op: '==', value: profile.id } : null);
  const { data: queue } = useZipSubmissions(can('zipQueue') ? { field: 'status', op: 'in', value: ['pending', 'approved'] } : null);
  const { data: clients } = useClients();
  const { data: activity } = useCollection(
    () => (can('teamProgress') ? query(collection(db, 'activity'), orderBy('createdAt', 'desc'), limit(12)) : null),
    [can('teamProgress')],
    () => (can('teamProgress') ? previewDb.activity : []),
  );

  const agency = useAgency();
  const spend = useMemo(() => computeSpend(payments), [payments]);
  // Payment entries carry amounts, so they're only shown to roles that can see revenue (admins).
  const feed = activity.filter((a) => can('revenue') || !String(a.action).startsWith('payment.'));
  const series = useMemo(() => withChange(dailySeries(spend.byDay, 60)), [spend.byDay]);
  const spark = series.slice(-30).map((d) => d.spend);
  const t = spend.totals;
  const openTasks = myTasks.filter((t) => t.status !== 'done').sort((a, b) => toDate(a.dueDate) - toDate(b.dueDate));
  const overdue = openTasks.filter((t) => toDate(t.dueDate) < new Date());
  const topClients = [...spend.clients].sort((a, b) => b.d30 - a.d30).slice(0, 6)
    .map((c) => ({ ...c, chg: pctChange(c.week, c.prevWeek), spark: dailySeries(c.byDay, 14).map((d) => d.spend) }));

  const tiles = [];
  if (can('revenue')) {
    tiles.push(<StatCard key="today" label="Spend today" value={money(t.today)} icon={DollarSign} tone="emerald" delta={pctChange(t.today, t.yesterday)} deltaLabel="vs yesterday" spark={spark.slice(-14)} onClick={() => navigate('/revenue')} />);
    tiles.push(<StatCard key="d30" label="Last 30 days" value={money(t.d30)} icon={TrendingUp} tone="brand" delta={pctChange(t.d30, t.prevD30)} deltaLabel="vs prior 30d" spark={spark} onClick={() => navigate('/revenue')} />);
  }
  if (can('zipSubmit')) {
    tiles.push(<StatCard key="flag" label="My flagged zips" value={mySubs.filter((s) => s.status === 'flagged').length} sub="Inside cooldown" icon={AlertTriangle} tone="red" onClick={() => navigate('/zip-codes?tab=flagged')} />);
  }
  if (can('zipQueue')) {
    tiles.push(<StatCard key="queue" label="Ops queue" value={queue.length} sub="Valid zips to process" icon={ClipboardCheck} tone="amber" onClick={() => navigate('/zip-queue')} />);
  }
  tiles.push(<StatCard key="tasks" label="My open tasks" value={openTasks.length} sub={overdue.length ? `${overdue.length} overdue` : 'None overdue'} icon={CheckSquare} tone={overdue.length ? 'red' : 'violet'} onClick={() => navigate('/tasks')} />);
  if (can('clients') && tiles.length < 4) {
    tiles.push(<StatCard key="clients" label="Active clients" value={clients.filter((c) => c.status === 'active').length} icon={Users} tone="brand" onClick={() => navigate('/clients')} />);
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
          <h1 className="mt-1.5 text-[22px] font-semibold tracking-tight text-slate-900">{greeting()}, {profile.name?.split(' ')[0]}</h1>
          <p className="mt-1 text-[13.5px] text-slate-500">
            {overdue.length
              ? <><span className="font-medium text-down-700">{overdue.length} overdue task{overdue.length > 1 ? 's' : ''}</span> need attention. </>
              : openTasks.length ? `${openTasks.length} open task${openTasks.length > 1 ? 's' : ''}. ` : 'You are all caught up. '}
            <span className="text-slate-400">{ROLES[role]?.description}.</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/tasks"><Button variant="secondary" icon={Plus}>New task</Button></Link>
          {can('zipSubmit') && <Link to="/zip-codes"><Button icon={MapPin}>Submit zip codes</Button></Link>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{tiles.slice(0, 4)}</div>

      {can('agency') && agency.status === 'ready' && (() => {
        const r = agency.rows;
        const act = r.filter((x) => x.isActive).length;
        const low = r.filter((x) => x.isActive && isLow(x)).length;
        const contacts = r.reduce((s2, x) => s2 + (x.leftContacts || 0), 0);
        const l7 = r.reduce((s2, x) => s2 + (x.leads7d || 0), 0);
        return (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="GHL sub-accounts" value={r.length.toLocaleString()} icon={Building2} tone="brand" sub={`${pctOf(act, r.length).toFixed(0)}% active · live from n8n`} onClick={() => navigate('/sub-accounts')} />
            <StatCard label="Contacts left" value={shortNum(contacts)} icon={Users} tone="sky" sub="Across all sub-accounts" onClick={() => navigate('/sub-accounts')} />
            <StatCard label="Running low" value={low.toLocaleString()} icon={AlertTriangle} tone="red" sub={`Active, under ${LOW_LEFT_PCT}% contacts left`} onClick={() => navigate('/sub-accounts?view=low')} />
            <StatCard label="Leads · 7 days" value={l7.toLocaleString()} icon={Activity} tone="violet" sub={`${r.reduce((s2, x) => s2 + (x.leadsYesterday || 0), 0).toLocaleString()} yesterday`} onClick={() => navigate('/sub-accounts')} />
          </div>
        );
      })()}

      {can('workflow') && <div className="mt-6"><WorkflowBoard compact /></div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {can('revenue') && (
          <Card className="overflow-hidden xl:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="eyebrow">Client spend · 60 days</p>
                <div className="mt-1.5 flex items-baseline gap-3">
                  <span className="font-mono text-[22px] font-semibold tracking-tight text-slate-900 tabular-nums">{money(t.today)}</span>
                  <Delta value={pctChange(t.today, t.yesterday)} />
                  <span className="text-xs text-slate-500">today</span>
                </div>
              </div>
              <Link to="/revenue" className="flex items-center gap-1 text-[13px] font-medium text-slate-600 transition-colors hover:text-slate-900">Full report <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
            <div className="px-2 pb-2 pt-1"><PriceChart data={series} height={330} /></div>
          </Card>
        )}

        {can('revenue') && (
          <Card>
            <CardHeader title="Watchlist" subtitle="Top clients by 30-day spend" actions={<span className="eyebrow">7d chg</span>} />
            {topClients.length === 0 ? <EmptyState icon={DollarSign} title="No spend yet" /> : (
              <ul className="divide-y divide-slate-100">
                {topClients.map((c) => (
                  <li key={c.clientId}>
                    <Link to={`/clients/${c.clientId}`} className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-slate-50">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-slate-900">{c.clientName}</p>
                        <p className="font-mono text-[11.5px] text-slate-500 tabular-nums">{money(c.d30)}{c.d30 >= settings.highValueMonthly && <span className="ml-1.5 font-sans text-violet-700">· High value</span>}</p>
                      </div>
                      <MiniSpark data={c.spark} width={60} height={22} />
                      <Delta value={c.chg} className="w-[70px] justify-center" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {can('teamProgress') && (
          <Card className="xl:col-span-2">
            <CardHeader title="Recent activity" subtitle="Across all departments" />
            {feed.length === 0 ? <EmptyState icon={Activity} title="No activity yet" /> : (
              <ul className="divide-y divide-slate-100">
                {feed.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                    <Avatar name={a.userName} userId={a.userId} size="sm" />
                    <p className="flex-1 text-[13px] text-slate-600"><b className="font-medium text-slate-900">{a.userName}</b> {ACTION_LABEL[a.action]?.(a.details || {}) || a.action}</p>
                    <span className="whitespace-nowrap text-xs text-slate-400">{fromNow(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        <div className={cn('grid content-start gap-6', can('teamProgress') ? '' : 'md:grid-cols-2 xl:col-span-3')}>
          <Card>
            <CardHeader title="My upcoming tasks" actions={<Link to="/tasks" className="text-[13px] font-medium text-slate-600 hover:text-slate-900">View all</Link>} />
            {openTasks.length === 0 ? <EmptyState icon={CheckSquare} title="No open tasks" /> : (
              <ul className="divide-y divide-slate-100">
                {openTasks.slice(0, 6).map((t) => {
                  const late = toDate(t.dueDate) < new Date();
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                      <Clock className={cn('h-4 w-4 shrink-0', late ? 'text-down' : 'text-slate-400')} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-slate-900">{t.title}</p>
                        <p className={cn('text-xs', late ? 'font-medium text-down-700' : 'text-slate-500')}>{late ? 'Overdue · ' : ''}due {fmtDateTime(t.dueDate)}</p>
                      </div>
                      <StatusBadge map={TASK_PRIORITY} value={t.priority} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

        </div>
      </div>
    </>
  );
}
