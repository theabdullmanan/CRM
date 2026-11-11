import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, KeyRound, Save, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ROLES } from '../lib/constants';
import { fmtDate, fmtDateTime, friendlyError } from '../lib/utils';
import { changeMyPassword, updateMyProfile } from '../services/userService';
import { PasswordField } from '../components/PasswordField';
import { Avatar, Badge, Button, Card, CardHeader, Field, Input, PageHeader } from '../components/ui';

const PW_ERRORS = {
  'auth/invalid-credential': 'Your current password is incorrect.',
  'auth/wrong-password': 'Your current password is incorrect.',
  'auth/weak-password': 'The new password is too weak. Use at least 8 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/requires-recent-login': 'Please sign out and sign back in, then try again.',
};

export default function Account() {
  const { profile, user } = useAuth();
  const [me, setMe] = useState({ name: '', phone: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => { setMe({ name: profile?.name || '', phone: profile?.phone || '' }); }, [profile?.name, profile?.phone]);

  const mismatch = pw.confirm && pw.next !== pw.confirm;
  const sameAsOld = pw.next && pw.next === pw.current;
  const pwValid = pw.current && pw.next.length >= 8 && pw.next === pw.confirm && !sameAsOld;

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try { await updateMyProfile(profile.id, me); toast.success('Profile saved'); } catch (err) { toast.error(friendlyError(err)); } finally { setSavingProfile(false); }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (!pwValid) return;
    setSavingPw(true);
    try {
      await changeMyPassword(pw.current, pw.next);
      setPw({ current: '', next: '', confirm: '' });
      toast.success('Password changed. Use the new one next time you sign in.');
    } catch (err) {
      toast.error(PW_ERRORS[err.code] || friendlyError(err));
    } finally { setSavingPw(false); }
  };

  return (
    <>
      <PageHeader title="My account" subtitle="Your profile and sign-in details." />

      {profile?.mustChangePassword && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-[13px] text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p><b className="font-semibold">Your password was set by an admin.</b> Choose your own password below so only you know it.</p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <div className="flex flex-col items-center px-6 py-7 text-center">
            <Avatar name={profile?.name} size="lg" />
            <p className="mt-3 text-[15px] font-semibold text-slate-900">{profile?.name}</p>
            {profile?.jobTitle && <p className="text-[13px] text-slate-500">{profile.jobTitle}</p>}
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              <Badge color={ROLES[profile?.role]?.color}><ShieldCheck className="h-3 w-3" />{ROLES[profile?.role]?.label}</Badge>
              {profile?.department && <Badge>{profile.department}</Badge>}
            </div>
          </div>
          <dl className="grid grid-cols-[110px_1fr] gap-y-2 border-t border-slate-100 px-6 py-4 text-[13px]">
            <dt className="text-slate-500">Email</dt><dd className="truncate text-slate-800">{user?.email || profile?.email}</dd>
            <dt className="text-slate-500">Member since</dt><dd className="text-slate-800">{fmtDate(profile?.createdAt)}</dd>
            {profile?.createdByName && <><dt className="text-slate-500">Added by</dt><dd className="text-slate-800">{profile.createdByName}</dd></>}
            <dt className="text-slate-500">Password</dt><dd className="text-slate-800">{profile?.passwordChangedAt ? `Changed ${fmtDateTime(profile.passwordChangedAt)}` : profile?.mustChangePassword ? 'Set by admin' : 'Set at sign-up'}</dd>
          </dl>
          <p className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500">Your role and department are managed by an admin.</p>
        </Card>

        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Change password" subtitle="Enter your current password, then choose a new one (at least 8 characters)." />
            <form onSubmit={savePassword} className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Current password" className="sm:col-span-2">
                <PasswordField value={pw.current} onChange={(v) => setPw((s) => ({ ...s, current: v }))} meter={false} autoComplete="current-password" />
              </Field>
              <Field label="New password" error={sameAsOld ? 'Choose a password different from the current one' : pw.next && pw.next.length < 8 ? 'Use at least 8 characters' : null}>
                <PasswordField value={pw.next} onChange={(v) => setPw((s) => ({ ...s, next: v }))} generate />
              </Field>
              <Field label="Confirm new password" error={mismatch ? "Passwords don't match" : null}>
                <PasswordField value={pw.confirm} onChange={(v) => setPw((s) => ({ ...s, confirm: v }))} meter={false} />
              </Field>
              <div className="flex justify-end sm:col-span-2">
                <Button type="submit" icon={KeyRound} loading={savingPw} disabled={!pwValid}>Update password</Button>
              </div>
            </form>
          </Card>

          <Card>
            <CardHeader title="Profile" subtitle="How you appear to your team." />
            <form onSubmit={saveProfile} className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Full name"><Input required value={me.name} onChange={(e) => setMe((s) => ({ ...s, name: e.target.value }))} /></Field>
              <Field label="Phone"><Input value={me.phone} onChange={(e) => setMe((s) => ({ ...s, phone: e.target.value }))} /></Field>
              <div className="flex justify-end sm:col-span-2">
                <Button type="submit" variant="secondary" icon={Save} loading={savingProfile} disabled={!me.name.trim()}>Save profile</Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
