import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { collection, query, where } from 'firebase/firestore';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, Users, MapPin, ClipboardCheck, DollarSign, Map, CheckSquare,
  UserCog, Settings, LogOut, Menu, X, Bell, Search, ChevronRight, Building2, SearchCheck, UserPlus, CircleUser, KeyRound,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection } from '../../hooks/useFirestore';
import { useTasks, useUsers, useWorkflowTasks } from '../../hooks/useData';
import { PhotoContext } from '../../lib/photos';
import { db } from '../../lib/firebase';
import { isPreview, previewDb as P } from '../../lib/preview';
import { ASSIGNABLE_ROLES, ROLES } from '../../lib/constants';
import { cn } from '../../lib/utils';
import { flagOverdueTasks } from '../../services/taskService';
import { Avatar, Badge, PageLoader } from '../ui';
import NotificationBell from './NotificationBell';
import CommandPalette from './CommandPalette';

export const NAV = [
  { section: 'Overview' },
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, area: 'dashboard', end: true },
  { to: '/clients', label: 'Clients', icon: Users, area: 'clients' },
  { to: '/sub-accounts', label: 'Sub-accounts', icon: Building2, area: 'agency' },
  { section: 'Zip codes' },
  { to: '/zip-lookup', label: 'Zip lookup', icon: SearchCheck, area: 'agency' },
  { to: '/zip-codes', label: 'Submit zip codes', icon: MapPin, area: 'zipSubmit', countKey: 'flagged' },
  { to: '/zip-queue', label: 'Ops review queue', icon: ClipboardCheck, area: 'zipQueue', countKey: 'pending' },
  { section: 'Insights' },
  { to: '/revenue', label: 'Revenue & spend', icon: DollarSign, area: 'revenue' },
  { to: '/map', label: 'Users map', icon: Map, area: 'map' },
  { section: 'Team' },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare, area: 'tasks', countKey: 'tasks' },
  { to: '/notifications', label: 'Notifications', icon: Bell, area: 'dashboard' },
  { to: '/team', label: 'Users & roles', icon: UserCog, area: 'team', end: true },
  { to: '/team/add', label: 'Add user', icon: UserPlus, area: 'team' },
  { to: '/account', label: 'My account', icon: CircleUser, area: 'dashboard' },
  { to: '/settings', label: 'Settings', icon: Settings, area: 'settings' },
];

function useNavCounts() {
  const { can, user } = useAuth();
  const pending = useCollection(
    () => (can('zipQueue') ? query(collection(db, 'zipSubmissions'), where('status', 'in', ['pending', 'approved'])) : null),
    [can('zipQueue')],
    () => (can('zipQueue') ? P.zipSubmissions.filter((z) => ['pending', 'approved'].includes(z.status)) : []),
  );
  const flagged = useCollection(
    () => (can('zipSubmit') && user ? query(collection(db, 'zipSubmissions'), where('submittedBy', '==', user.uid), where('status', '==', 'flagged')) : null),
    [can('zipSubmit'), user?.uid],
    () => (can('zipSubmit') ? P.zipSubmissions.filter((z) => z.submittedBy === user?.uid && z.status === 'flagged') : []),
  );
  const myTasks = useTasks('mine');
  const shared = useWorkflowTasks();
  const allTasks = useTasks(can('teamProgress') ? 'all' : null);

  // Overdue alerts: assignees check their own tasks; leadership checks the whole team.
  useEffect(() => {
    if (isPreview) return undefined;
    const run = () => {
      flagOverdueTasks(myTasks.data);
      if (can('teamProgress')) flagOverdueTasks(allTasks.data);
    };
    run();
    const t = setInterval(run, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTasks.data, allTasks.data]);

  return {
    pending: pending.data.length,
    flagged: flagged.data.length,
    tasks: myTasks.data.filter((t) => t.status !== 'done').length
      + shared.data.filter((t) => t.status !== 'done' && t.assigneeIds?.includes(user?.uid)).length,
  };
}

export function LogoMark({ className }) {
  return (
    <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-950 shadow-[inset_0_-1px_0_rgba(0,0,0,.12)]', className)}>
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
        <rect x="4" y="9" width="3.2" height="9" rx="0.8" />
        <rect x="5.1" y="6" width="1" height="15" rx="0.5" />
        <rect x="10.4" y="5" width="3.2" height="9" rx="0.8" />
        <rect x="11.5" y="3" width="1" height="13" rx="0.5" />
        <rect x="16.8" y="7" width="3.2" height="6" rx="0.8" />
        <rect x="17.9" y="4.5" width="1" height="11" rx="0.5" />
      </svg>
    </div>
  );
}

function Logo({ name }) {
  return (
    <div className="flex items-center gap-2.5 px-4 pb-4 pt-5">
      <LogoMark />
      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold tracking-tight text-white">{name || 'Ops CRM'}</p>
        <p className="text-[11px] text-slate-500">Operations platform</p>
      </div>
    </div>
  );
}

function Sidebar({ onNavigate, counts, pillId }) {
  const { can, profile, role, logout, settings } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="relative flex h-full flex-col overflow-hidden border-r border-white/[0.06] bg-[#0e0e10] text-slate-400">
      <Logo name={settings.companyName} />

      <nav className="scrollbar-thin relative flex-1 space-y-px overflow-y-auto px-2.5 pb-4">
        {NAV.map((item, i) => {
          if (item.section) {
            const visible = NAV.slice(i + 1).find((n) => n.section || can(n.area));
            if (!visible || visible.section) return null;
            return <p key={item.section} className="px-2.5 pb-1.5 pt-5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-slate-600">{item.section}</p>;
          }
          if (!can(item.area)) return null;
          const count = item.countKey ? counts[item.countKey] : 0;
          return (
            <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate} className="group relative block">
              {({ isActive }) => (
                <div className={cn('relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors duration-150', isActive ? 'text-white' : 'hover:bg-white/[0.04] hover:text-slate-200')}>
                  {isActive && (
                    <motion.div layoutId={pillId} className="absolute inset-0 rounded-md bg-white/[0.08] shadow-[inset_0_0_0_1px_rgba(255,255,255,.05)]" transition={{ type: 'tween', ease: [0.2, 0.7, 0.2, 1], duration: 0.25 }} />
                  )}
                  <item.icon className={cn('relative h-4 w-4 shrink-0', isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300')} strokeWidth={1.75} />
                  <span className="relative flex-1 truncate">{item.label}</span>
                  {count > 0 && (
                    <span className={cn('relative min-w-[20px] rounded px-1 text-center font-mono text-[10.5px] font-medium tabular-nums', item.countKey === 'flagged' ? 'bg-down/15 text-[#ff7a85]' : 'bg-white/[0.08] text-slate-300')}>
                      {count}
                    </span>
                  )}
                </div>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="relative border-t border-white/[0.06] p-2.5">
        <div className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-white/[0.04]">
          <Link to="/account" onClick={onNavigate} title="My account" className="flex min-w-0 flex-1 items-center gap-2.5">
          <Avatar name={profile?.name} src={profile?.photoURL} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-slate-100">{profile?.name}</p>
            <p className="truncate text-[11px] text-slate-500">{ROLES[role]?.label}{profile?.department ? ` · ${profile.department}` : ''}</p>
          </div>
          </Link>
          <button
            title="Sign out"
            onClick={async () => { await logout(); navigate('/login'); }}
            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Layout() {
  const { data: users } = useUsers();
  const photos = useMemo(() => Object.fromEntries(users.filter((u) => u.photoURL).map((u) => [u.id, u.photoURL])), [users]);
  return <PhotoContext.Provider value={photos}><LayoutInner /></PhotoContext.Provider>;
}

function LayoutInner() {
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const { role, preview, setPreviewRole, profile } = useAuth();
  const counts = useNavCounts();
  const location = useLocation();
  const navigate = useNavigate();
  const firstRole = useRef(role);

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    // In preview, switching the role jumps back to that role's dashboard.
    if (preview && role !== firstRole.current) { firstRole.current = role; navigate('/', { replace: true }); }
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const current = NAV.filter((n) => n.to).sort((a, b) => b.to.length - a.to.length).find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)));
  const isDetail = current && location.pathname !== current.to;

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">
        <Sidebar counts={counts} pillId="nav-pill" />
      </aside>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div className="absolute inset-0 bg-slate-950/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside
              className="absolute inset-y-0 left-0 w-72 shadow-2xl"
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'tween', ease: [0.2, 0.7, 0.2, 1], duration: 0.28 }}
            >
              <Sidebar counts={counts} pillId="nav-pill-mobile" onNavigate={() => setOpen(false)} />
              <button onClick={() => setOpen(false)} className="absolute right-3 top-5 text-slate-500 hover:text-white"><X className="h-5 w-5" /></button>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="lg:pl-60">
        <header className="glass sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200/80 px-4 sm:px-6 lg:px-8">
          <button className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>

          <div className="hidden min-w-0 items-center gap-1.5 text-[13px] md:flex">
            <span className="text-slate-400">Workspace</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
            <AnimatePresence mode="wait">
              <motion.span
                key={current?.label}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className={cn('truncate font-medium', isDetail ? 'text-slate-500' : 'text-slate-900')}
              >
                {current?.label || 'Dashboard'}
              </motion.span>
            </AnimatePresence>
            {isDetail && <><ChevronRight className="h-3.5 w-3.5 text-slate-300" /><span className="font-medium text-slate-900">Details</span></>}
          </div>

          <div className="flex-1" />

          {preview && (
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-md border border-amber-200/80 bg-amber-50 px-2 py-1 text-[11.5px] font-medium text-amber-800 xl:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Preview · sample data
              </span>
              <select
                value={role}
                onChange={(e) => setPreviewRole(e.target.value)}
                title="View the CRM as another role"
                className="h-8 cursor-pointer rounded-md border border-slate-200 bg-white px-2 text-[13px] text-slate-800 transition-colors hover:border-slate-300 focus:border-brand-500 focus:outline-none"
              >
                {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>View as {ROLES[r].label}</option>)}
              </select>
            </div>
          )}

          <button
            onClick={() => setPalette(true)}
            className="group flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-slate-50/80 px-2.5 text-[13px] text-slate-400 transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-600 sm:w-56"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden flex-1 text-left sm:inline">Search…</span>
            <kbd className="hidden rounded border border-slate-200 bg-white px-1.5 font-mono text-[10px] text-slate-500 sm:inline">Ctrl K</kbd>
          </button>
          {!preview && <Badge color={ROLES[role]?.color} dot>{ROLES[role]?.label}</Badge>}
          <NotificationBell />
        </header>

        {profile?.mustChangePassword && location.pathname !== '/account' && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-900">
            <KeyRound className="h-3.5 w-3.5 text-amber-600" />
            Your password was set by an admin. Please choose your own.
            <Link to="/account" className="font-semibold underline underline-offset-2 hover:text-amber-950">Change password</Link>
          </div>
        )}
        <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
            className="page"
          >
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </motion.div>
        </main>
      </div>

      <CommandPalette open={palette} onClose={() => setPalette(false)} nav={NAV} />
    </div>
  );
}
