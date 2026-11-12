import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Camera, ImagePlus, KeyRound, Loader2, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ROLES } from '../lib/constants';
import { PhotoCropper } from '../components/PhotoCropper';
import { fmtDate, fmtDateTime, friendlyError } from '../lib/utils';
import { changeMyPassword, updateMyPhoto, updateMyProfile } from '../services/userService';
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

  const fileRef = useRef(null);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const savePhoto = async (photo) => {
    setSavingPhoto(true);
    try {
      await updateMyPhoto(profile.id, photo);
      toast.success(photo ? 'Photo updated' : 'Photo removed');
      return true;
    } catch (err) { toast.error(friendlyError(err)); return false; } finally { setSavingPhoto(false); }
  };
  // Picking a file opens the cropper; the photo is saved from there.
  const [cropFile, setCropFile] = useState(null);
  const pickPhoto = (file) => {
    if (!file) return;
    if (!file.type?.startsWith('image/')) return toast.error('Please choose an image file.');
    setCropFile(file);
  };
  const saveCropped = async (dataUrl) => {
    if (await savePhoto(dataUrl)) setCropFile(null);
  };

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
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pickPhoto(e.target.files[0]); e.target.value = ''; }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={savingPhoto} title="Choose a photo from your gallery"
              className="group relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2">
              <Avatar name={profile?.name} src={profile?.photoURL} size="xl" />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-950/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
                {savingPhoto ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
              </span>
              <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-white shadow">
                <Camera className="h-3.5 w-3.5" />
              </span>
            </button>
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" variant="secondary" icon={ImagePlus} loading={savingPhoto} onClick={() => fileRef.current?.click()}>
                {profile?.photoURL ? 'Change photo' : 'Select image'}
              </Button>
              {profile?.photoURL && <Button size="sm" variant="ghost" icon={Trash2} disabled={savingPhoto} onClick={() => savePhoto(null)}>Remove</Button>}
            </div>
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

      <PhotoCropper file={cropFile} saving={savingPhoto} onCancel={() => setCropFile(null)} onSave={saveCropped} />
    </>
  );
}
