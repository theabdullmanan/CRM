import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { addDays, format, isToday } from 'date-fns';
import toast from 'react-hot-toast';
import { Plus, CheckSquare, Clock, AlertTriangle, CheckCircle2, Pencil, Trash2, Circle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useActiveUsers, useClients, useTasks } from '../hooks/useData';
import { TASK_PRIORITY, TASK_STATUS } from '../lib/constants';
import { cn, fmtDateTime, friendlyError, fromNow, toDate } from '../lib/utils';
import { createTask, deleteTask, updateTask } from '../services/taskService';
import { WorkflowBoard } from '../components/workflow';
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, PageLoader, ProgressBar, SearchInput, Select, StatCard, StatusBadge, Tabs, Textarea, useConfirm,
} from '../components/ui';

const isOverdue = (t) => t.status !== 'done' && toDate(t.dueDate) < new Date();

function TaskModal({ open, onClose, task }) {
  const { profile } = useAuth();
  const { data: users } = useActiveUsers();
  const { data: clients } = useClients();
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(task ? {
      title: task.title, description: task.description, assigneeId: task.assigneeId, priority: task.priority,
      due: format(toDate(task.dueDate), "yyyy-MM-dd'T'HH:mm"), clientId: task.clientId || '',
    } : {
      title: '', description: '', assigneeId: profile.id, priority: 'medium',
      due: format(addDays(new Date(), 1).setHours(17, 0, 0, 0), "yyyy-MM-dd'T'HH:mm"), clientId: '',
    });
  }, [open, task, profile.id]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const assignee = users.find((u) => u.id === form.assigneeId);
    const client = clients.find((c) => c.id === form.clientId);
    const data = {
      title: form.title, description: form.description, assigneeId: assignee.id, assigneeName: assignee.name,
      priority: form.priority, dueDate: new Date(form.due), clientId: client?.id || null, clientName: client?.name || null,
    };
    setBusy(true);
    try {
      if (task) await updateTask(task, data, profile);
      else await createTask(data, profile);
      toast.success(task ? 'Task updated' : 'Task assigned');
      onClose();
    } catch (err) { toast.error(friendlyError(err)); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={task ? 'Edit task' : 'New task'} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="task-form" type="submit" loading={busy}>{task ? 'Save' : 'Assign task'}</Button></>}>
      <form id="task-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2"><Input required value={form.title || ''} onChange={set('title')} /></Field>
        <Field label="Assign to">
          <Select required value={form.assigneeId || ''} onChange={set('assigneeId')}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.department ? ` · ${u.department}` : ''}</option>)}
          </Select>
        </Field>
        <Field label="Deadline"><Input type="datetime-local" required value={form.due || ''} onChange={set('due')} /></Field>
        <Field label="Priority">
          <Select value={form.priority || 'medium'} onChange={set('priority')}>
            {Object.entries(TASK_PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>
        <Field label="Related client (optional)">
          <Select value={form.clientId || ''} onChange={set('clientId')}>
            <option value="">None</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Details" className="sm:col-span-2"><Textarea value={form.description || ''} onChange={set('description')} /></Field>
      </form>
    </Modal>
  );
}

function TaskRow({ t, onEdit }) {
  const { profile, can } = useAuth();
  const confirm = useConfirm();
  const overdue = isOverdue(t);
  const canEdit = can('teamProgress') || t.createdBy === profile.id;
  const setStatus = (status) => updateTask(t, { status }, profile)
    .then(() => { if (status === 'done') toast.success('Task completed. Your team has been notified.'); })
    .catch((e) => toast.error(friendlyError(e)));

  return (
    <div className={cn('flex items-start gap-3 px-5 py-4 transition hover:bg-slate-50', overdue && 'bg-down-50/40')}>
      <button onClick={() => setStatus(t.status === 'done' ? 'todo' : 'done')} className="mt-0.5 text-slate-300 hover:text-up" title={t.status === 'done' ? 'Reopen' : 'Mark done'}>
        {t.status === 'done' ? <CheckCircle2 className="h-5 w-5 text-up" /> : <Circle className="h-5 w-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('font-medium', t.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-900')}>{t.title}</p>
          <StatusBadge map={TASK_PRIORITY} value={t.priority} />
          {overdue && <Badge color="red"><AlertTriangle className="h-3 w-3" />Overdue</Badge>}
          {t.clientName && <Badge color="indigo">{t.clientName}</Badge>}
        </div>
        {t.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{t.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><Avatar name={t.assigneeName} userId={t.assigneeId} size="sm" />{t.assigneeName}</span>
          <span className={cn('flex items-center gap-1', overdue && 'font-medium text-down-600')}>
            <Clock className="h-3.5 w-3.5" />
            {t.status === 'done' ? `Done ${fromNow(t.completedAt)}${t.completedAt && toDate(t.completedAt) > toDate(t.dueDate) ? ' · late' : ''}` : `Due ${isToday(toDate(t.dueDate)) ? `today ${format(toDate(t.dueDate), 'h:mm a')}` : fmtDateTime(t.dueDate)} (${fromNow(t.dueDate)})`}
          </span>
          <span>Assigned by {t.createdByName}</span>
          {t.status === 'done' && (
            <span className="inline-flex items-center gap-1 rounded bg-up-50 px-1.5 py-0.5 font-medium text-up-700">
              <CheckCircle2 className="h-3 w-3" />Completed by {t.completedBy === profile.id ? 'you' : (t.completedByName || t.assigneeName)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Select value={t.status} onChange={(e) => setStatus(e.target.value)} className="h-8 w-[130px] py-1 text-xs">
          {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        {canEdit && (
          <>
            <button onClick={() => onEdit(t)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-4 w-4" /></button>
            <button onClick={async () => { if (await confirm({ title: 'Delete task?', message: t.title, danger: true, confirmLabel: 'Delete' })) deleteTask(t); }} className="rounded p-1.5 text-slate-400 hover:bg-down-50 hover:text-down-600"><Trash2 className="h-4 w-4" /></button>
          </>
        )}
      </div>
    </div>
  );
}

function TeamProgress({ tasks }) {
  const { data: users } = useActiveUsers();
  const rows = users.map((u) => {
    const mine = tasks.filter((t) => t.assigneeId === u.id);
    const done = mine.filter((t) => t.status === 'done');
    const onTime = done.filter((t) => toDate(t.completedAt) && toDate(t.completedAt) <= toDate(t.dueDate)).length;
    return {
      u, total: mine.length, done: done.length,
      open: mine.filter((t) => t.status === 'todo').length,
      progress: mine.filter((t) => t.status === 'in_progress').length,
      overdue: mine.filter(isOverdue).length,
      rate: mine.length ? Math.round((done.length / mine.length) * 100) : 0,
      onTime: done.length ? Math.round((onTime / done.length) * 100) : null,
    };
  }).filter((r) => r.total > 0).sort((a, b) => b.overdue - a.overdue || a.rate - b.rate);

  if (!rows.length) return <EmptyState icon={CheckSquare} title="No tasks assigned yet" />;
  return (
    <div className="divide-y divide-slate-100">
      {rows.map((r) => (
        <div key={r.u.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
          <div className="flex w-56 items-center gap-3">
            <Avatar name={r.u.name} userId={r.u.id} />
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-900">{r.u.name}</p>
              <p className="truncate text-xs text-slate-500">{r.u.department || r.u.role}</p>
            </div>
          </div>
          <div className="min-w-[180px] flex-1">
            <div className="mb-1 flex justify-between text-xs text-slate-500"><span>{r.done}/{r.total} complete</span><span>{r.rate}%</span></div>
            <ProgressBar value={r.rate} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>{r.open} to do</Badge>
            <Badge color="sky">{r.progress} in progress</Badge>
            {r.overdue > 0 ? <Badge color="red">{r.overdue} overdue</Badge> : <Badge color="emerald">On track</Badge>}
            {r.onTime != null && <Badge color="violet">{r.onTime}% on time</Badge>}
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentlyCompleted({ tasks }) {
  const { profile } = useAuth();
  const done = tasks.filter((t) => t.status === 'done' && t.completedAt)
    .sort((a, b) => toDate(b.completedAt) - toDate(a.completedAt)).slice(0, 8);
  if (!done.length) return null;
  return (
    <Card className="mt-6">
      <CardHeader title="Recently completed" subtitle="Who finished what. Completed tasks leave the open list for everyone." />
      <ul className="divide-y divide-slate-100">
        {done.map((t) => {
          const late = toDate(t.completedAt) > toDate(t.dueDate);
          const who = t.completedBy === profile.id ? 'You' : (t.completedByName || t.assigneeName);
          return (
            <li key={t.id} className="flex items-center gap-3 px-5 py-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-up-50 text-up-600"><CheckCircle2 className="h-4 w-4" /></span>
              <p className="min-w-0 flex-1 text-[13px] text-slate-600">
                <b className="font-medium text-slate-900">{who}</b> completed <span className="font-medium text-slate-900">"{t.title}"</span>
                <span className="text-slate-400"> · assigned by {t.createdBy === profile.id ? 'you' : t.createdByName}</span>
              </p>
              {late ? <Badge color="amber">Late</Badge> : <Badge color="emerald">On time</Badge>}
              <span className="whitespace-nowrap text-xs text-slate-400">{fromNow(t.completedAt)}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export default function Tasks() {
  const { can, role } = useAuth();
  const [params, setParams] = useSearchParams();
  const leadership = can('teamProgress');
  const workflow = can('workflow');
  // Opens on the Zip workflow board for everyone who has it; others start on "Assigned to me".
  const view = params.get('view') || (workflow ? 'workflow' : 'mine');
  const [status, setStatus] = useState('open');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState({ open: false, task: null });

  const scope = view === 'workflow' ? null : view === 'created' ? 'created' : view === 'mine' ? 'mine' : 'all';
  const { data: allTasks, loading } = useTasks(scope);
  // Shared workflow tasks live on their own board, not in the personal lists.
  const tasks = useMemo(() => allTasks.filter((t) => !t.pool), [allTasks]);

  const list = useMemo(() => tasks
    .filter((t) => {
      if (status === 'open' && t.status === 'done') return false;
      if (status === 'overdue' && !isOverdue(t)) return false;
      if (status === 'done' && t.status !== 'done') return false;
      const q = search.toLowerCase();
      return !q || [t.title, t.assigneeName, t.clientName].some((v) => v?.toLowerCase().includes(q));
    })
    .sort((a, b) => (a.status === 'done') - (b.status === 'done') || (toDate(a.dueDate) - toDate(b.dueDate))), [tasks, status, search]);

  const stats = {
    open: tasks.filter((t) => t.status !== 'done').length,
    overdue: tasks.filter(isOverdue).length,
    dueToday: tasks.filter((t) => t.status !== 'done' && isToday(toDate(t.dueDate))).length,
    done: tasks.filter((t) => t.status === 'done').length,
  };

  return (
    <>
      <PageHeader title="Tasks" subtitle="Assign work with deadlines. Overdue tasks alert the assignee, creator and admins." actions={<Button icon={Plus} onClick={() => setModal({ open: true, task: null })}>New task</Button>} />

      {view !== 'workflow' && <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open" value={stats.open} icon={CheckSquare} tone="brand" onClick={() => setStatus('open')} />
        <StatCard label="Overdue" value={stats.overdue} icon={AlertTriangle} tone="red" onClick={() => setStatus('overdue')} />
        <StatCard label="Due today" value={stats.dueToday} icon={Clock} tone="amber" />
        <StatCard label="Completed" value={stats.done} icon={CheckCircle2} tone="emerald" onClick={() => setStatus('done')} />
      </div>}

      <div className="mb-4">
        <Tabs value={view} onChange={(v) => setParams({ view: v })} tabs={[
          ...(workflow ? [{ value: 'workflow', label: role === 'backend_developer' ? 'Shared tasks' : 'Zip workflow' }] : []),
          { value: 'mine', label: 'Assigned to me' },
          { value: 'created', label: 'Created by me' },
          ...(leadership ? [{ value: 'all', label: 'All tasks' }, { value: 'team', label: 'Team progress' }] : []),
        ]} />
      </div>

      {view === 'workflow' ? <WorkflowBoard /> : view === 'team' ? (
        <Card>
          <CardHeader title="Team progress" subtitle="Completion and overdue work per person" />
          {loading ? <PageLoader /> : <TeamProgress tasks={tasks} />}
        </Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
            <Tabs value={status} onChange={setStatus} tabs={[
              { value: 'open', label: 'Open' }, { value: 'overdue', label: 'Overdue' }, { value: 'done', label: 'Done' }, { value: 'all', label: 'All' },
            ]} />
            <SearchInput value={search} onChange={setSearch} placeholder="Search tasks…" />
          </div>
          {loading ? <PageLoader /> : list.length === 0 ? (
            <EmptyState icon={CheckSquare} title="No tasks here" message="Nice — nothing matches this filter." />
          ) : (
            <div className="divide-y divide-slate-100">
              <AnimatePresence initial={false}>
                {list.map((t) => (
                  <motion.div key={t.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0, transition: { duration: 0.25 } }} className="overflow-hidden">
                    <TaskRow t={t} onEdit={(task) => setModal({ open: true, task })} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </Card>
      )}

      {!['team', 'workflow'].includes(view) && <RecentlyCompleted tasks={tasks} />}

      <TaskModal open={modal.open} task={modal.task} onClose={() => setModal({ open: false, task: null })} />
    </>
  );
}
