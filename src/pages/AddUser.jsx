import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Check, CheckCircle2, Copy, KeyRound, LogIn, ShieldCheck, UserPlus, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useDepartments } from '../hooks/useData';
import { ACCESS, ROLE_GROUPS, ROLES } from '../lib/constants';
import { cn, friendlyError } from '../lib/utils';
import { createUserAccount, passwordStrength } from '../services/userService';
import { NAV } from '../components/layout/Layout';
import { PasswordField } from '../components/PasswordField';
import { Avatar, Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select } from '../components/ui';

const EMPTY = { name: '', email: '', role: 'developer', department: '', jobTitle: '', phone: '', password: '' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const AUTH_ERRORS = {
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/invalid-email': 'That email address is not valid.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/operation-not-allowed': 'Email/Password sign-in is turned off. Enable it in Firebase Console → Authentication → Sign-in method.',
};

/** Pages a role can open, derived from the same access map the app uses. */
function pagesFor(role) {
  return NAV.filter((n) => n.to && ACCESS[n.area]?.includes(role)).map((n) => n.label);
}

export default function AddUser() {
  const { profile } = useAuth();
  const { data: departments } = useDepartments();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const pages = useMemo(() => pagesFor(form.role), [form.role]);
  const strength = passwordStrength(form.password);
  const emailOk = EMAIL_RE.test(form.email.trim());
  const valid = form.name.trim().length >= 2 && emailOk && form.password.length >= 8;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await createUserAccount(form, profile);
      setCreated({ ...form, email: form.email.trim().toLowerCase() });
      setCopied(false);
      toast.success(`Account created for ${form.name.trim()}`);
    } catch (err) {
      toast.error(AUTH_ERRORS[err.code] || friendlyError(err), { duration: 6000 });
    } finally { setBusy(false); }
  };

  const loginUrl = `${window.location.origin}/login`;
  const credText = created && `Hi ${created.name.split(' ')[0]}, your CRM account is ready.\n\nLogin: ${loginUrl}\nEmail: ${created.email}\nTemporary password: ${created.password}\n\nPlease change your password after signing in (My account → Change password).`;

  return (
    <>
      <Link to="/team" className="mb-3 inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" /> Users & roles</Link>
      <PageHeader title="Add user" subtitle="Create a login for a team member, choose their role and set a starting password. They can change it any time after signing in." />

      {created ? (
        <Card className="mx-auto max-w-2xl overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-100 bg-up-50/60 px-6 py-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-up text-white"><Check className="h-5 w-5" /></span>
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900">{created.name} can sign in now</h2>
              <p className="text-[13px] text-slate-600">Share these details privately. The password is shown only once.</p>
            </div>
          </div>
          <div className="space-y-4 px-6 py-5">
            <div className="flex items-center gap-3">
              <Avatar name={created.name} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{created.name}{created.jobTitle && <span className="font-normal text-slate-500"> · {created.jobTitle}</span>}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge color={ROLES[created.role].color}><ShieldCheck className="h-3 w-3" />{ROLES[created.role].label}</Badge>
                  {created.department && <Badge>{created.department}</Badge>}
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-[130px_1fr] gap-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-4 text-[13px]">
              <dt className="text-slate-500">Login page</dt><dd className="font-mono text-slate-900">{loginUrl}</dd>
              <dt className="text-slate-500">Email</dt><dd className="font-mono text-slate-900">{created.email}</dd>
              <dt className="text-slate-500">Temporary password</dt><dd className="font-mono text-slate-900">{created.password}</dd>
            </dl>
            <p className="flex items-start gap-2 text-xs text-slate-500"><KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />They'll see a reminder to change this password until they do. If they forget it, they can use "Forgot password?" on the login page.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-3">
            <Button variant="secondary" icon={copied ? Check : Copy} onClick={() => navigator.clipboard?.writeText(credText).then(() => { setCopied(true); toast.success('Login details copied'); })}>{copied ? 'Copied' : 'Copy login details'}</Button>
            <Link to="/team"><Button variant="secondary">Done</Button></Link>
            <Button icon={UserPlus} onClick={() => { setCreated(null); setForm({ ...EMPTY, role: created.role, department: created.department }); }}>Add another</Button>
          </div>
        </Card>
      ) : (
        <form onSubmit={submit} className="grid gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Person" subtitle="Their name and email are what they'll sign in with." />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Full name"><Input required autoFocus value={form.name} onChange={set('name')} placeholder="e.g. Sarah Ahmed" /></Field>
              <Field label="Email" error={form.email && !emailOk ? 'Enter a valid email address' : null}>
                <Input required type="email" value={form.email} onChange={set('email')} placeholder="sarah@company.com" autoComplete="off" />
              </Field>
              <Field label="Job title" hint="Optional, shown next to their name"><Input value={form.jobTitle} onChange={set('jobTitle')} placeholder="e.g. Senior Backend Engineer" /></Field>
              <Field label="Phone" hint="Optional"><Input value={form.phone} onChange={set('phone')} placeholder="(555) 010-1234" /></Field>
            </div>

            <CardHeader title="Role & department" subtitle="The role decides which pages they can open." className="border-t" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Role">
                <Select value={form.role} onChange={set('role')}>
                  {ROLE_GROUPS.map(([group, roles]) => (
                    <optgroup key={group} label={group}>
                      {roles.map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              <Field label="Department">
                <Select value={form.department} onChange={set('department')}>
                  <option value="">No department</option>
                  {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                </Select>
              </Field>
            </div>

            <CardHeader title="Starting password" subtitle="At least 8 characters. They can change it after signing in." className="border-t" />
            <div className="p-5">
              <Field label="Password" error={form.password && form.password.length < 8 ? 'Use at least 8 characters' : null}>
                <PasswordField value={form.password} onChange={set('password')} generate placeholder="Type one or click Generate" />
              </Field>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
              <Link to="/team"><Button type="button" variant="secondary">Cancel</Button></Link>
              <Button type="submit" icon={UserPlus} loading={busy} disabled={!valid}>Create account</Button>
            </div>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader title="Access preview" subtitle={ROLES[form.role].description} />
              <div className="p-5">
                <div className="flex items-center gap-3">
                  <Avatar name={form.name || '?'} />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{form.name || 'New team member'}</p>
                    <Badge color={ROLES[form.role].color}><ShieldCheck className="h-3 w-3" />{ROLES[form.role].label}</Badge>
                  </div>
                </div>
                <p className="eyebrow mt-5">Can open</p>
                <ul className="mt-2 space-y-1.5">
                  {NAV.filter((n) => n.to).map((n) => {
                    const ok = pages.includes(n.label) || ['/notifications', '/account'].includes(n.to);
                    return (
                      <li key={n.to} className={cn('flex items-center gap-2 text-[13px]', ok ? 'text-slate-800' : 'text-slate-400')}>
                        {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-up" /> : <X className="h-3.5 w-3.5" />}{n.label}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </Card>
            <Card>
              <CardHeader title="What happens next" />
              <ol className="space-y-3 p-5 text-[13px] text-slate-600">
                {[
                  [UserPlus, 'The account is created and active right away. No approval step needed.'],
                  [LogIn, 'They sign in on the login page with this email and password.'],
                  [KeyRound, 'They change their password from My account whenever they want.'],
                ].map(([Icon, t], i) => (
                  <li key={i} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50"><Icon className="h-3.5 w-3.5 text-slate-500" /></span>{t}</li>
                ))}
              </ol>
              {strength.score > 0 && form.password && <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Password strength: <b className="text-slate-700">{strength.label}</b></p>}
            </Card>
          </div>
        </form>
      )}
    </>
  );
}
