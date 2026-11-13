import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Check, Copy, Crown, Trash2, ShieldCheck, ShieldOff, UserCheck, UserPlus, Users, UserX, Hourglass, KeyRound,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUsers } from '../hooks/useData';
import { ROLES } from '../lib/constants';
import { fmtDate, friendlyError } from '../lib/utils';
import { createSuperAdminAccount, deleteUserAccount, updateSuperAdmin } from '../services/userService';
import { PasswordField } from '../components/PasswordField';
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, Input, PageLoader, ProgressBar, StatCard, useConfirm,
} from '../components/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EMPTY = { name: '', email: '', password: '' };

const AUTH_ERRORS = {
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/invalid-email': 'That email address is not valid.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/operation-not-allowed': 'Email/Password sign-in is turned off. Enable it in Firebase Console → Authentication → Sign-in method.',
};

function AddSuperAdmin({ profile }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  const emailOk = EMAIL_RE.test(form.email.trim());
  const valid = emailOk && form.password.length >= 8;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await createSuperAdminAccount(form, profile);
      setCreated({ email: form.email.trim().toLowerCase(), password: form.password });
      setCopied(false);
      setForm(EMPTY);
      toast.success('Super admin account created');
    } catch (err) {
      toast.error(AUTH_ERRORS[err.code] || friendlyError(err), { duration: 6000 });
    } finally { setBusy(false); }
  };

  const loginUrl = `${window.location.origin}/login`;
  const credText = created && `Your Super Admin account for the CRM is ready.\n\nLogin: ${loginUrl}\nEmail: ${created.email}\nTemporary password: ${created.password}\n\nPlease change your password after signing in (My account → Change password).`;

  return (
    <Card>
      <CardHeader title="Add a super admin" subtitle="Creates a login with full access, including this dashboard." />
      {created && (
        <div className="mx-5 mt-5 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
          <p className="flex items-center gap-2 text-[13px] font-medium text-emerald-900"><Check className="h-4 w-4" />Account created. Share these details privately. The password is shown only once.</p>
          <dl className="mt-3 grid grid-cols-[110px_1fr] gap-y-1.5 text-[13px]">
            <dt className="text-slate-500">Login page</dt><dd className="break-all font-mono text-slate-900">{loginUrl}</dd>
            <dt className="text-slate-500">Email</dt><dd className="break-all font-mono text-slate-900">{created.email}</dd>
            <dt className="text-slate-500">Password</dt><dd className="break-all font-mono text-slate-900">{created.password}</dd>
          </dl>
          <div className="mt-3 flex gap-2">
            <Button size="xs" variant="secondary" icon={copied ? Check : Copy} onClick={() => navigator.clipboard?.writeText(credText).then(() => { setCopied(true); toast.success('Login details copied'); })}>{copied ? 'Copied' : 'Copy login details'}</Button>
            <Button size="xs" variant="ghost" onClick={() => setCreated(null)}>Dismiss</Button>
          </div>
        </div>
      )}
      <form onSubmit={submit} className="space-y-4 p-5">
        <Field label="Email" error={form.email && !emailOk ? 'Enter a valid email address' : null}>
          <Input required type="email" value={form.email} onChange={set('email')} placeholder="owner@company.com" autoComplete="off" />
        </Field>
        <Field label="Password" error={form.password && form.password.length < 8 ? 'Use at least 8 characters' : null}>
          <PasswordField value={form.password} onChange={set('password')} generate placeholder="Type one or click Generate" />
        </Field>
        <Field label="Name" hint="Optional. Defaults to the part of the email before @">
          <Input value={form.name} onChange={set('name')} placeholder="e.g. Sarah Ahmed" />
        </Field>
        <p className="flex items-start gap-2 text-xs text-slate-500"><KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />They'll be reminded to change this password after their first sign-in.</p>
        <div className="flex justify-end">
          <Button type="submit" icon={UserPlus} loading={busy} disabled={!valid}>Create super admin</Button>
        </div>
      </form>
    </Card>
  );
}

function SuperAdminRow({ u, me, activeCount, profile }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const isMe = u.id === me;
  const lastOne = u.active && activeCount <= 1;

  const run = async (patch, opts) => {
    if (!(await confirm(opts))) return;
    setBusy(true);
    try {
      await updateSuperAdmin(u, patch, profile);
      toast.success('Saved');
    } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(false); }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${u.name}'s account?`,
      message: `${u.name} (${u.email}) loses all access to the CRM immediately. This can't be undone.`,
      confirmLabel: 'Delete account',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteUserAccount(u, profile);
      toast.success(`${u.name}'s account was deleted`);
    } catch (e) { toast.error(friendlyError(e)); setBusy(false); }
  };

  return (
    <div className={`flex flex-wrap items-center gap-3 px-5 py-3.5 ${u.active ? '' : 'opacity-60'}`}>
      <Avatar name={u.name} userId={u.id} size="sm" />
      <div className="min-w-[160px] flex-1">
        <p className="font-medium text-slate-900">{u.name} {isMe && <span className="text-xs text-slate-400">(you)</span>}</p>
        <p className="text-xs text-slate-500">{u.email} · added {fmtDate(u.createdAt)}{u.createdByName ? ` by ${u.createdByName}` : ''}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {u.active ? <Badge color="emerald">Active</Badge> : <Badge>Disabled</Badge>}
        {u.active && u.mustChangePassword && <Badge color="amber">Temp password</Badge>}
      </div>
      {!isMe && (
        <div className="flex gap-1">
          <Button size="xs" variant="ghost" icon={ShieldOff} disabled={busy || lastOne}
            title={lastOne ? 'There must be at least one active super admin' : undefined}
            onClick={() => run({ role: 'admin', superAdminRevoked: true }, { title: `Make ${u.name} a regular admin?`, message: 'They keep admin access but lose the Super Admin dashboard.', confirmLabel: 'Change to admin' })}>
            Make admin
          </Button>
          {u.active ? (
            <Button size="xs" variant="ghost" icon={UserX} disabled={busy || lastOne}
              onClick={() => run({ active: false }, { title: `Disable ${u.name}?`, message: 'They will no longer be able to use the CRM until re-enabled.', confirmLabel: 'Disable', danger: true })}>
              Disable
            </Button>
          ) : (
            <Button size="xs" variant="subtle" icon={UserCheck} disabled={busy}
              onClick={() => run({ active: true }, { title: `Enable ${u.name}?`, message: 'They will be able to sign in again with full access.', confirmLabel: 'Enable' })}>
              Enable
            </Button>
          )}
          <Button size="xs" variant="ghost" icon={Trash2} disabled={busy || lastOne}
            title={lastOne ? 'There must be at least one active super admin' : undefined}
            onClick={remove}>
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}

export default function SuperAdmin() {
  const { profile } = useAuth();
  const { data: users, loading } = useUsers();

  const stats = useMemo(() => {
    const active = users.filter((u) => u.active && u.role !== 'pending');
    const byRole = {};
    active.forEach((u) => { byRole[u.role] = (byRole[u.role] || 0) + 1; });
    return {
      total: users.length,
      active: active.length,
      pending: users.filter((u) => u.role === 'pending' && !u.active).length,
      disabled: users.filter((u) => !u.active && u.role !== 'pending').length,
      admins: active.filter((u) => u.role === 'admin').length,
      byRole: Object.entries(byRole).sort((a, b) => b[1] - a[1]),
    };
  }, [users]);

  const supers = users.filter((u) => u.role === 'superadmin');
  const activeSupers = supers.filter((u) => u.active).length;

  if (loading) return <PageLoader />;

  return (
    <>
      <div className="theme-fixed relative mb-7 overflow-hidden rounded-3xl bg-gradient-to-br from-[#1b1d4a] via-brand-700 to-violet-700 p-6 text-white shadow-lift sm:p-8">
        <div className="bg-dots pointer-events-none absolute inset-0 opacity-50 [mask-image:linear-gradient(to_left,black,transparent_75%)]" />
        <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-fuchsia-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-brand-400/30 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
              <Crown className="h-7 w-7 text-amber-300" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-200">Owner console</p>
              <h1 className="mt-0.5 text-[28px] font-extrabold leading-tight tracking-tight">Super Admin</h1>
              <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-white/75">
                Welcome back, {profile.name?.split(' ')[0] || 'there'}. Overview of everyone in the CRM, and the place to add or manage other super admins.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/team">
              <button type="button" className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/15 px-4 text-[13px] font-semibold text-white ring-1 ring-white/25 backdrop-blur transition-colors hover:bg-white/25">
                <Users className="h-4 w-4" />Users & roles
              </button>
            </Link>
            <Link to="/team/add">
              <button type="button" className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-brand-700 shadow-lg transition-colors hover:bg-brand-50">
                <UserPlus className="h-4 w-4" />Add user
              </button>
            </Link>
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Super admins" value={activeSupers} icon={Crown} tone="violet" sub={supers.length > activeSupers ? `${supers.length - activeSupers} disabled` : 'all active'} />
        <StatCard label="Admins" value={stats.admins} icon={ShieldCheck} tone="brand" />
        <StatCard label="Active users" value={stats.active} icon={Users} tone="emerald" sub={`${stats.total} accounts in total`} />
        <StatCard label="Awaiting approval" value={stats.pending} icon={Hourglass} tone="amber" sub={stats.disabled ? `${stats.disabled} disabled` : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title={`Super admins (${supers.length})`} subtitle="Super admins can do everything an admin can, plus manage this page. At least one must stay active." />
            {supers.length === 0 ? <EmptyState icon={Crown} title="No super admins yet" /> : (
              <div className="divide-y divide-slate-100">
                {supers.map((u) => <SuperAdminRow key={u.id} u={u} me={profile.id} activeCount={activeSupers} profile={profile} />)}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Active users by role" />
            <div className="space-y-3 p-5">
              {stats.byRole.length === 0 && <p className="text-sm text-slate-400">No active users.</p>}
              {stats.byRole.map(([role, n]) => (
                <div key={role} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-[13px] text-slate-700">{ROLES[role]?.label || role}</span>
                  <ProgressBar value={(n / stats.active) * 100} className="flex-1" tone="bg-violet-500" />
                  <span className="w-8 text-right font-mono text-[12px] tabular-nums text-slate-600">{n}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div>
          <AddSuperAdmin profile={profile} />
        </div>
      </div>
    </>
  );
}
