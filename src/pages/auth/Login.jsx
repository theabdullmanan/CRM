import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { Button, Field, Input } from '../../components/ui';
import { friendlyError } from '../../lib/utils';
import AuthShell from './AuthShell';

export default function Login() {
  const { login, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!form.email) return setError('Enter your email first, then click "Forgot password".');
    try {
      await resetPassword(form.email);
      toast.success('Password reset email sent.');
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your CRM account.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <Input type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password">
          <Input type="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {error && <p className="rounded-lg bg-down-50 px-3 py-2 text-sm text-down-700">{error}</p>}
        <Button type="submit" loading={busy} className="w-full" size="lg">Sign in</Button>
        <div className="flex justify-between text-sm">
          <button type="button" onClick={forgot} className="text-slate-500 hover:text-slate-700">Forgot password?</button>
          <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">Create account</Link>
        </div>
      </form>
    </AuthShell>
  );
}
