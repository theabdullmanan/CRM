import { useEffect, useState } from 'react';
import { Maximize2, Trophy } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useMinuteTick } from '../hooks/useBusinessDayWindow';
import { centralClock, centralDate } from '../lib/businessDay';
import { canViewLeaderboard, isDisplayAccount } from '../lib/leaderboard';
import { friendlyError } from '../lib/utils';
import { Podium, RankList } from '../components/leaderboard/Board';

/*
 * /leaderboard/tv: full-screen board for a wall TV.
 * Registered outside the normal sign-in guard so the dedicated TV account can use it:
 * that account has role "display" and stays disabled (active: false), so every existing
 * Firestore rule still denies it; only the new leaderboard rules let it read the board.
 * Everyone else allowed on the leaderboard can open it too.
 */

const shell = 'theme-fixed min-h-screen bg-[#06070d] text-white antialiased';

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-right">
      <p className="font-display text-5xl font-extrabold tabular-nums tracking-tight">{centralClock(now, { second: '2-digit' })}</p>
      <p className="mt-1 text-lg text-slate-400">{centralDate(now)} · Central time</p>
    </div>
  );
}

function SignIn() {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const field = 'mt-1.5 block w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-lg text-white placeholder:text-slate-500 focus:border-brand-400 focus:outline-none';
  return (
    <div className={`${shell} flex items-center justify-center p-6`}>
      <form
        className="w-full max-w-md space-y-5 rounded-2xl bg-white/[0.04] p-8 ring-1 ring-white/10"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setError('');
          try { await login(form.email.trim(), form.password); } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
        }}
      >
        <div className="flex items-center gap-3">
          <Trophy className="h-8 w-8 text-amber-400" />
          <h1 className="text-2xl font-bold">Leaderboard TV</h1>
        </div>
        <label className="block text-sm text-slate-300">Email<input className={field} type="email" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label className="block text-sm text-slate-300">Password<input className={field} type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-brand-600 py-3 text-lg font-semibold text-white hover:bg-brand-500 disabled:opacity-60">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

function Board() {
  const lb = useLeaderboard('today');
  const now = useMinuteTick();
  const { rows, span, settings } = lb;
  const resets = span.end.toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'long', hour: 'numeric', minute: '2-digit' });

  return (
    <div className={`${shell} flex flex-col px-6 py-6 sm:px-10 sm:py-8`}>
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 shadow-lg">
            <Trophy className="h-9 w-9" />
          </span>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight">Senders Leaderboard</h1>
            <p className="mt-1 text-xl text-slate-400">Today · <span className="font-semibold text-white tabular-nums">{lb.total}</span> leads sent</p>
          </div>
        </div>
        <Clock />
      </header>

      <main className="mt-8 flex-1 space-y-6">
        {lb.error ? (
          <p className="rounded-2xl bg-rose-500/10 p-6 text-2xl text-rose-300 ring-1 ring-rose-400/30">The leaderboard couldn't load ({lb.error.code || 'error'}). Retrying automatically…</p>
        ) : lb.loading ? (
          <p className="p-6 text-2xl text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-2xl text-slate-400">No senders on the leaderboard yet.</p>
        ) : (
          <>
            {lb.total === 0 && <p className="rounded-2xl bg-white/[0.04] px-6 py-4 text-center text-2xl text-slate-300 ring-1 ring-white/10">No leads sent yet today</p>}
            <Podium rows={rows} now={now} idleMinutes={settings.idleMinutes} span={span} range="today" tv />
            <RankList rows={rows} now={now} idleMinutes={settings.idleMinutes} span={span} range="today" tv />
          </>
        )}
      </main>

      <footer className="mt-6 flex items-center justify-between text-base text-slate-500">
        <span>Updates live · resets {resets} CT</span>
        <button type="button" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-300">
          <Maximize2 className="h-4 w-4" /> Full screen
        </button>
      </footer>
    </div>
  );
}

export default function LeaderboardTv() {
  const { user, profile, loading, logout, preview } = useAuth();

  if (loading) return <div className={`${shell} flex items-center justify-center text-2xl text-slate-400`}>Loading…</div>;
  if (preview) return <Board />;
  if (!user) return <SignIn />;
  if (isDisplayAccount(profile) || canViewLeaderboard(profile)) return <Board />;

  return (
    <div className={`${shell} flex flex-col items-center justify-center gap-4 p-6 text-center`}>
      <p className="text-2xl">This account can't open the leaderboard.</p>
      <p className="text-slate-400">Use the TV display account, or an account in the Sending Department.</p>
      <button type="button" onClick={logout} className="rounded-lg bg-white/10 px-4 py-2 hover:bg-white/15">Sign out</button>
    </div>
  );
}
