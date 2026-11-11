import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { Save, Plus, Trash2, Building2, Sparkles, Timer, DollarSign, Map } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useDepartments } from '../hooks/useData';
import { COOLDOWN_SCOPES } from '../lib/constants';
import { friendlyError } from '../lib/utils';
import { seedDemoData } from '../services/seedService';
import { Button, Card, CardHeader, Field, Input, PageHeader, Select, useConfirm } from '../components/ui';

export default function Settings() {
  const { settings, profile } = useAuth();
  const confirm = useConfirm();
  const { data: departments } = useDepartments();
  const [form, setForm] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [dept, setDept] = useState('');
  const [seeding, setSeeding] = useState(false);

  useEffect(() => setForm(settings), [settings]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    try {
      const { demoSeededAt, ...rest } = form;
      await setDoc(doc(db, 'settings', 'app'), {
        ...rest,
        cooldownDays: Number(form.cooldownDays) || 42,
        setupFee: Number(form.setupFee) || 0,
        dailyMin: Number(form.dailyMin) || 0,
        dailyMax: Number(form.dailyMax) || 0,
        highValueMonthly: Number(form.highValueMonthly) || 0,
        updatedAt: serverTimestamp(),
        updatedBy: profile.name,
      }, { merge: true });
      toast.success('Settings saved');
    } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(false); }
  };

  const addDept = async (e) => {
    e.preventDefault();
    if (!dept.trim()) return;
    if (departments.some((d) => d.name.toLowerCase() === dept.trim().toLowerCase())) return toast.error('Department already exists');
    await addDoc(collection(db, 'departments'), { name: dept.trim(), createdAt: serverTimestamp() });
    setDept('');
  };

  const seed = async () => {
    if (!(await confirm({ title: 'Load demo data?', message: 'Adds 8 sample clients with sub-accounts, ~4 months of daily payments, departments and tasks. Use it to explore the CRM; delete the demo clients before going live.', confirmLabel: 'Load demo data' }))) return;
    setSeeding(true);
    try {
      const n = await seedDemoData(profile, settings);
      toast.success(`Demo data loaded (${n} records)`);
    } catch (e) { toast.error(friendlyError(e)); } finally { setSeeding(false); }
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Business rules used across the CRM." actions={<Button icon={Save} loading={busy} onClick={save}>Save changes</Button>} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Timer className="h-4 w-4 text-brand-600" />Zip code cooldown</span>} subtitle="Prevents the same zip being used again too soon." />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Cooldown (days)" hint="6 weeks = 42 days"><Input type="number" min="1" value={form.cooldownDays} onChange={set('cooldownDays')} /></Field>
            <Field label="Applies to">
              <Select value={form.cooldownScope} onChange={set('cooldownScope')}>
                <option value="subAccount">Each sub-account</option>
                <option value="client">Each client</option>
                <option value="global">All clients (global)</option>
              </Select>
            </Field>
            <p className="text-sm text-slate-500 sm:col-span-2">{COOLDOWN_SCOPES[form.cooldownScope]}. Changing the scope applies to new submissions only.</p>
          </div>
        </Card>

        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-brand-600" />Revenue rules</span>} subtitle="Setup fees are always excluded from spend." />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Initial setup fee ($)"><Input type="number" value={form.setupFee} onChange={set('setupFee')} /></Field>
            <Field label="High-value threshold ($ / 30 days)"><Input type="number" value={form.highValueMonthly} onChange={set('highValueMonthly')} /></Field>
            <Field label="Daily rate — minimum ($)"><Input type="number" value={form.dailyMin} onChange={set('dailyMin')} /></Field>
            <Field label="Daily rate — maximum ($)"><Input type="number" value={form.dailyMax} onChange={set('dailyMax')} /></Field>
          </div>
        </Card>

        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Map className="h-4 w-4 text-brand-600" />General & map</span>} />
          <div className="grid gap-4 p-5">
            <Field label="Company / CRM name"><Input value={form.companyName} onChange={set('companyName')} /></Field>
            <Field label="Map dashboard embed URL" hint="The existing map dashboard. Use its embed/share link (it must allow being shown in an iframe).">
              <Input type="url" placeholder="https://lookerstudio.google.com/embed/reporting/…" value={form.mapEmbedUrl} onChange={set('mapEmbedUrl')} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-brand-600" />Departments</span>} subtitle="From Sergio's department list. Assign people to them on the Users page." />
          <div className="p-5">
            <form onSubmit={addDept} className="mb-4 flex gap-2">
              <Input value={dept} onChange={(e) => setDept(e.target.value)} placeholder="e.g. Customer Success" />
              <Button type="submit" icon={Plus}>Add</Button>
            </form>
            <div className="flex flex-wrap gap-2">
              {departments.map((d) => (
                <span key={d.id} className="flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-3 pr-1.5 text-sm text-slate-700">
                  {d.name}
                  <button onClick={() => deleteDoc(doc(db, 'departments', d.id))} className="rounded-full p-0.5 text-slate-400 hover:bg-down-100 hover:text-down-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </span>
              ))}
              {!departments.length && <p className="text-sm text-slate-400">No departments yet.</p>}
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-600" />Demo data</span>} subtitle="Explore every screen with realistic sample data." />
          <div className="flex flex-wrap items-center justify-between gap-4 p-5">
            <p className="max-w-2xl text-sm text-slate-600">
              Loads sample clients ($65–$400/day), sub-accounts, setup fees, ~4 months of daily payments and a few tasks.
              Demo records are tagged <code className="rounded bg-slate-100 px-1">demo: true</code>.
              {settings.demoSeededAt && <b className="ml-1 text-amber-700">Demo data has already been loaded once.</b>}
            </p>
            <Button variant="secondary" icon={Sparkles} loading={seeding} onClick={seed}>Load demo data</Button>
          </div>
        </Card>
      </div>
    </>
  );
}
