import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { Button, Field, Input } from '../../components/ui';
import { friendlyError } from '../../lib/utils';
import AuthShell from './AuthShell';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { isFirst } = await register(form);
      toast.success(isFirst ? 'Welcome! You are the first user, so you are the admin.' : 'Account created. An admin will approve your access.');
      navigate('/');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <AuthShell title="Create your account" subtitle="An admin assigns your role and department after you sign up.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name"><Input required value={form.name} onChange={set('name')} /></Field>
        <Field label="Work email"><Input type="email" required autoComplete="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="Password" hint="At least 6 characters.">
          <Input type="password" required minLength={6} autoComplete="new-password" value={form.password} onChange={set('password')} />
        </Field>
        {error && <p className="rounded-lg bg-down-50 px-3 py-2 text-sm text-down-700">{error}</p>}
        <Button type="submit" loading={busy} className="w-full" size="lg">Create account</Button>
        <p className="text-center text-sm text-slate-500">
          Already have an account? <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
