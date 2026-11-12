import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Check, CheckCircle2, Download, FileSpreadsheet, Inbox, Loader2, MapPin, Upload, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useWorkflowTasks } from '../hooks/useData';
import { cn, friendlyError, fromNow, toDate } from '../lib/utils';
import { completePoolTask, downloadSheet, uploadSheetAndDispatch } from '../services/workflowService';
import { Badge, Button, Card, CardHeader, ease, EmptyState } from './ui';

/** Groups workflow tasks into runs: { jobId, upload, process, at }. Newest first. */
export function groupJobs(tasks) {
  const jobs = {};
  tasks.forEach((t) => {
    const j = (jobs[t.jobId] ||= { jobId: t.jobId });
    if (t.step === 'admin_upload') j.upload = t; else if (t.step === 'dev_process') j.process = t;
  });
  return Object.values(jobs)
    .map((j) => {
      const base = j.upload || j.process;
      return { ...j, base, at: toDate(j.process?.completedAt) || toDate(j.process?.createdAt) || toDate(base?.createdAt) || new Date(0) };
    })
    .filter((j) => j.base)
    .sort((a, b) => b.at - a.at);
}

const fmtSize = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round((b || 0) / 1e3))} KB`);

/** Three-step timeline: submitted → CSV uploaded → completed. */
function Steps({ job }) {
  const { upload, process, base } = job;
  const steps = [
    { label: 'Zips submitted', who: base.requestedByName, at: base.requestedAt || base.createdAt, done: true },
    { label: 'CSV uploaded', who: upload?.completedByName || (process ? process.createdByName : null), at: upload?.completedAt || process?.createdAt, done: Boolean(process) },
    { label: 'Completed', who: process?.completedByName, at: process?.completedAt, done: process?.status === 'done' },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol className="grid grid-cols-3 gap-2">
      {steps.map((s, i) => (
        <li key={s.label} className="relative">
          <div className="flex items-center gap-2">
            <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
              s.done ? 'bg-up text-white' : i === current ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400')}>
              {s.done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            {i < 2 && <span className={cn('h-px flex-1', s.done ? 'bg-up/50' : 'bg-slate-200')} />}
          </div>
          <p className={cn('mt-1.5 text-[11.5px] font-medium', s.done || i === current ? 'text-slate-800' : 'text-slate-400')}>{s.label}</p>
          <p className="truncate text-[11px] text-slate-500">
            {s.done ? `${s.who || '—'} · ${fromNow(s.at)}` : i === current ? (i === 1 ? 'Waiting for an admin' : 'Waiting for a developer') : ''}
          </p>
        </li>
      ))}
    </ol>
  );
}

function JobHeader({ t }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[13.5px] font-semibold text-slate-900">{t.clientName} › {t.subAccountName}</p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{t.zipCount} zips</span>
        <span>by {t.requestedByName}</span>
        {t.sheetName && <span className="flex items-center gap-1"><FileSpreadsheet className="h-3 w-3" />{t.sheetName} · {(t.sheetRows || 0).toLocaleString()} rows</span>}
      </p>
    </div>
  );
}

/** Green "completed" ribbon shown to everyone once one developer finishes. */
function CompletedRibbon({ task, me }) {
  const mine = task.completedBy === me;
  return (
    <div className="relative overflow-hidden rounded-lg border border-up-100 bg-up-50/70">
      <span className="absolute right-[-34px] top-[10px] w-[120px] rotate-45 bg-up py-0.5 text-center text-[9.5px] font-bold uppercase tracking-wider text-white shadow-sm">Done</span>
      <div className="flex items-center gap-3 px-4 py-3 pr-12">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-up text-white"><CheckCircle2 className="h-4 w-4" /></span>
        <p className="text-[13px] text-up-700">
          <b className="font-semibold">{mine ? 'You' : task.completedByName}</b> completed this task {fromNow(task.completedAt)}.
          {!mine && task.assigneeIds?.includes(me) && <span className="text-up-700/80"> No task available here. Nothing left for you to do.</span>}
        </p>
      </div>
    </div>
  );
}

function JobCard({ job, children }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }} transition={{ duration: 0.25, ease }}
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      {children}
      <Steps job={job} />
    </motion.div>
  );
}

function UploadButton({ task }) {
  const { profile } = useAuth();
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (file) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) return toast.error('Please choose a .csv file');
    setBusy(true);
    try {
      await uploadSheetAndDispatch(task, file, profile);
      toast.success('CSV uploaded. Sent to every Backend Developer.');
    } catch (e) { toast.error(e.message?.startsWith('There are no') ? e.message : friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { onFile(e.target.files[0]); e.target.value = ''; }} />
      <Button size="sm" icon={Upload} loading={busy} onClick={() => ref.current?.click()}>Upload CSV</Button>
    </>
  );
}

function DownloadButton({ task }) {
  const [busy, setBusy] = useState(false);
  if (!task.sheetId) return null;
  return (
    <Button size="sm" variant="secondary" icon={Download} loading={busy}
      onClick={async () => { setBusy(true); try { await downloadSheet(task.sheetId); } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(false); } }}>
      CSV {task.sheetSize ? <span className="text-slate-400">· {fmtSize(task.sheetSize)}</span> : null}
    </Button>
  );
}

function CompleteButton({ task }) {
  const { profile } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <Button size="sm" variant="success" icon={busy ? Loader2 : Check} loading={busy}
      onClick={async () => {
        setBusy(true);
        try { await completePoolTask(task, profile); toast.success('Task completed. Your team has been notified.'); } catch (e) { toast.error(e.code === 'already-done' ? e.message : friendlyError(e)); } finally { setBusy(false); }
      }}>
      Mark complete
    </Button>
  );
}

function Section({ title, count, children, empty }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <p className="eyebrow">{title}</p>
        {count != null && <span className="rounded bg-slate-100 px-1.5 font-mono text-[11px] text-slate-600">{count}</span>}
      </div>
      {empty || <div className="space-y-3"><AnimatePresence initial={false}>{children}</AnimatePresence></div>}
    </div>
  );
}

/**
 * The shared zip → contact-sheet board.
 * Admins: upload CSVs for new submissions and follow progress.
 * Backend Developers: pick up available tasks; finished ones show who completed them.
 */
export function WorkflowBoard({ compact = false }) {
  const { profile, isAdmin, role } = useAuth();
  const { data, loading } = useWorkflowTasks();
  const jobs = groupJobs(data);
  const me = profile?.id;
  const limit = compact ? 3 : 12;

  if (loading) return <Card><div className="p-8 text-center text-sm text-slate-400">Loading…</div></Card>;

  if (isAdmin) {
    const waiting = jobs.filter((j) => j.upload && j.upload.status !== 'done');
    const withDevs = jobs.filter((j) => j.process && j.process.status !== 'done');
    const done = jobs.filter((j) => j.process?.status === 'done');
    return (
      <Card>
        <CardHeader title="Zip code workflow" subtitle="Backend Developers submit zips → you upload the CSV → the first developer to finish completes it."
          actions={compact && <Link to="/tasks?view=workflow" className="text-[13px] font-medium text-slate-600 hover:text-slate-900">Open</Link>} />
        <div className="space-y-6 p-5">
          <Section title="Waiting for your CSV" count={waiting.length}
            empty={!waiting.length && <p className="rounded-lg border border-dashed border-slate-200 px-4 py-5 text-center text-[13px] text-slate-500">Nothing to upload right now.</p>}>
            {waiting.slice(0, limit).map((j) => (
              <JobCard key={j.jobId} job={j}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <JobHeader t={j.upload} />
                  <div className="flex items-center gap-2"><Badge color="amber" dot>Needs CSV</Badge><UploadButton task={j.upload} /></div>
                </div>
                <div className="flex flex-wrap gap-1">{(j.upload.zips || []).slice(0, 24).map((z) => <span key={z} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">{z}</span>)}</div>
              </JobCard>
            ))}
          </Section>
          {(!compact || withDevs.length > 0) && (
            <Section title="With Backend Developers" count={withDevs.length}
              empty={!withDevs.length && <p className="text-[13px] text-slate-400">None in progress.</p>}>
              {withDevs.slice(0, limit).map((j) => (
                <JobCard key={j.jobId} job={j}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <JobHeader t={j.process} />
                    <div className="flex items-center gap-2"><Badge color="sky" dot><Users className="h-3 w-3" />{j.process.assigneeIds?.length || 0} developers</Badge><DownloadButton task={j.process} /></div>
                  </div>
                </JobCard>
              ))}
            </Section>
          )}
          {done.length > 0 && (
            <Section title="Completed" count={done.length}>
              {done.slice(0, compact ? 2 : limit).map((j) => (
                <JobCard key={j.jobId} job={j}>
                  <div className="flex flex-wrap items-start justify-between gap-3"><JobHeader t={j.process} /><DownloadButton task={j.process} /></div>
                  <CompletedRibbon task={j.process} me={me} />
                </JobCard>
              ))}
            </Section>
          )}
        </div>
      </Card>
    );
  }

  // Backend Developer (or anyone the shared tasks are assigned to)
  const available = jobs.filter((j) => j.process && j.process.status !== 'done' && j.process.assigneeIds?.includes(me));
  const finished = jobs.filter((j) => j.process?.status === 'done' && j.process.assigneeIds?.includes(me));
  // Runs I started that I'm not working on myself (e.g. a Manager's submissions).
  const mySubs = jobs.filter((j) => j.base.requestedBy === me && !j.process?.assigneeIds?.includes(me));
  const isDev = role === 'backend_developer' || available.length > 0 || finished.length > 0;

  if (!isDev) {
    return (
      <Card>
        <CardHeader title="My zip submissions" subtitle="Your zips go to the admins, who upload the CSV; then the first Backend Developer to finish completes it."
          actions={compact ? <Link to="/tasks?view=workflow" className="text-[13px] font-medium text-slate-600 hover:text-slate-900">Open</Link> : <Link to="/zip-codes"><Button size="sm" icon={MapPin}>Submit zip codes</Button></Link>} />
        <div className="space-y-3 p-5">
          {mySubs.length === 0 ? (
            <EmptyState icon={MapPin} title="No submissions yet" message="Submit zip codes and you can follow each one here: CSV uploaded, then completed." action={compact && <Link to="/zip-codes"><Button size="sm" icon={MapPin}>Submit zip codes</Button></Link>} />
          ) : (
            <AnimatePresence initial={false}>
              {mySubs.slice(0, limit).map((j) => (
                <JobCard key={j.jobId} job={j}>
                  <JobHeader t={j.process || j.base} />
                  {j.process?.status === 'done' && <CompletedRibbon task={j.process} me={me} />}
                </JobCard>
              ))}
            </AnimatePresence>
          )}
        </div>
      </Card>
    );
  }
  const mineWaiting = jobs.filter((j) => j.base.requestedBy === me && !j.process);

  return (
    <Card>
      <CardHeader title="Shared tasks" subtitle="Sent to every Backend Developer. The first to complete one takes it, and it disappears for everyone else."
        actions={compact && <Link to="/tasks?view=workflow" className="text-[13px] font-medium text-slate-600 hover:text-slate-900">Open</Link>} />
      <div className="space-y-6 p-5">
        <Section title="Available" count={available.length}
          empty={!available.length && <EmptyState icon={Inbox} title="No task available" message="When an admin uploads a contact sheet, it appears here for every Backend Developer." />}>
          {available.slice(0, limit).map((j) => (
            <JobCard key={j.jobId} job={j}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <JobHeader t={j.process} />
                <div className="flex items-center gap-2"><DownloadButton task={j.process} /><CompleteButton task={j.process} /></div>
              </div>
              <p className="text-xs text-slate-500">Uploaded by {j.process.createdByName} {fromNow(j.process.createdAt)} · shared with {j.process.assigneeIds?.length || 0} developers</p>
            </JobCard>
          ))}
        </Section>

        {finished.length > 0 && (
          <Section title="Completed by your team" count={finished.length}>
            {finished.slice(0, compact ? 2 : limit).map((j) => (
              <JobCard key={j.jobId} job={j}>
                <JobHeader t={j.process} />
                <CompletedRibbon task={j.process} me={me} />
              </JobCard>
            ))}
          </Section>
        )}

        {mineWaiting.length > 0 && (
          <Section title="Your submissions" count={mineWaiting.length}>
            {mineWaiting.slice(0, limit).map((j) => (
              <JobCard key={j.jobId} job={j}><JobHeader t={j.base} /></JobCard>
            ))}
          </Section>
        )}
      </div>
    </Card>
  );
}
