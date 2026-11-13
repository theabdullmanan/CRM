import { motion, useReducedMotion } from 'framer-motion';
import { MapPin, LineChart, CheckSquare, ShieldCheck, Users, CheckCircle2, Lock, Sparkles, TrendingUp } from 'lucide-react';
import { LogoMark } from '../../components/layout/Layout';

const ease = [0.2, 0.7, 0.2, 1];

// ---------- Decorative product preview (sample figures, not live data) ----------

const WEEK = [
  ['Mon', 38, 30], ['Tue', 46, 39], ['Wed', 41, 35], ['Thu', 55, 47], ['Fri', 52, 46], ['Sat', 64, 58], ['Sun', 58, 51],
];

const KPIS = [
  [Users, 'Active clients', '128', '+4', 'from-sky-400 to-blue-600'],
  [MapPin, 'Zips approved', '342', '+12%', 'from-brand-400 to-violet-600'],
  [CheckCircle2, 'Tasks on time', '96%', '+3%', 'from-emerald-400 to-teal-600'],
];

const TEAM = [
  ['EC', 'from-sky-400 to-blue-600'],
  ['CJ', 'from-amber-400 to-orange-600'],
  ['NP', 'from-emerald-400 to-teal-600'],
  ['SA', 'from-fuchsia-500 to-purple-600'],
];

const FEATURES = [
  [MapPin, 'No duplicate zips'],
  [LineChart, 'Live client spend'],
  [CheckSquare, 'Tasks & deadlines'],
  [ShieldCheck, 'Role-based access'],
];

/** Smooth line through points (Catmull-Rom converted to cubic Bézier). */
function smoothPath(pts) {
  return pts.reduce((d, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [x0, y0] = pts[i - 2] || pts[i - 1];
    const [x1, y1] = pts[i - 1];
    const [x3, y3] = pts[i + 1] || [x, y];
    const c1 = [x1 + (x - x0) / 6, y1 + (y - y0) / 6];
    const c2 = [x - (x3 - x1) / 6, y - (y3 - y1) / 6];
    return `${d} C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${x},${y}`;
  }, '');
}

/** Bars = zips submitted per day, line = zips approved. */
function WeekChart() {
  const W = 520; const H = 150; const top = 34; const bottom = H - 22;
  const max = Math.max(...WEEK.map(([, s]) => s));
  const slot = W / WEEK.length; const barW = slot * 0.42;
  const y = (v) => bottom - (v / max) * (bottom - top);
  const peak = 5;
  const line = smoothPath(WEEK.map(([, , a], i) => [i * slot + slot / 2, y(a)]));
  const [px, py] = [peak * slot + slot / 2, y(WEEK[peak][1])];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden>
      <defs>
        <linearGradient id="barFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#8186f8" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#8186f8" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id="barPeak" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.5" />
        </linearGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {[0.33, 0.66].map((g) => <line key={g} x1="0" x2={W} y1={top + (bottom - top) * g} y2={top + (bottom - top) * g} stroke="rgba(255,255,255,.06)" strokeDasharray="3 5" />)}
      {WEEK.map(([d, s], i) => (
        <motion.rect
          key={d} x={i * slot + (slot - barW) / 2} y={y(s)} width={barW} height={bottom - y(s)} rx="6"
          fill={i === peak ? 'url(#barPeak)' : 'url(#barFill)'}
          style={{ transformBox: 'fill-box', transformOrigin: 'bottom' }}
          initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
          transition={{ delay: 0.35 + i * 0.06, duration: 0.6, ease }}
        />
      ))}
      <motion.path d={line} fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" filter="url(#glow)"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.8, duration: 1.1, ease }} />
      <motion.g initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1, duration: 0.4 }}>
        <rect x={px - 36} y={py - 30} width="72" height="22" rx="11" fill="#fff" />
        <text x={px} y={py - 15} textAnchor="middle" fill="#312e81" fontSize="11" fontWeight="700" fontFamily="Inter, sans-serif">64 zips</text>
      </motion.g>
      {WEEK.map(([d], i) => (
        <text key={d} x={i * slot + slot / 2} y={H - 4} textAnchor="middle" fontSize="10.5" fontWeight={i === peak ? 700 : 500}
          fill={i === peak ? '#e9d5ff' : 'rgba(255,255,255,.4)'} fontFamily="Inter, sans-serif">{d}</text>
      ))}
    </svg>
  );
}

/** Small circular progress ring. */
function Ring({ value, size = 44 }) {
  const r = (size - 6) / 2; const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90" aria-hidden>
      <defs>
        <linearGradient id="ringGrad" x1="0" x2="1"><stop offset="0%" stopColor="#34d399" /><stop offset="100%" stopColor="#22d3ee" /></linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="5" />
      <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="5" strokeLinecap="round"
        strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value / 100) }}
        transition={{ delay: 0.9, duration: 1.2, ease }} />
    </svg>
  );
}

function Float({ children, className, delay = 0, distance = 7 }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={reduce ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, scale: 1, y: [0, -distance, 0] }}
      transition={reduce ? { delay, duration: 0.5 } : {
        opacity: { delay, duration: 0.5 }, scale: { delay, duration: 0.5 },
        y: { delay, duration: 6, repeat: Infinity, ease: 'easeInOut' },
      }}
    >
      {children}
    </motion.div>
  );
}

function ProductShot() {
  return (
    <div className="relative">
      {/* Main dashboard card with a gradient border */}
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6, ease }}
        className="rounded-[22px] bg-gradient-to-br from-white/25 via-white/[0.06] to-brand-400/30 p-px shadow-[0_30px_80px_-20px_rgba(79,70,229,.55)]"
      >
        <div className="rounded-[21px] bg-[#111331]/90 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-brand-300">This week</p>
              <p className="mt-0.5 font-display text-[17px] font-bold">Team overview</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex -space-x-1.5">
                {TEAM.map(([ini, tone]) => (
                  <span key={ini} className={`flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-bold ring-2 ring-[#111331] ${tone}`}>{ini}</span>
                ))}
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2a2d5c] text-[10px] font-bold text-slate-200 ring-2 ring-[#111331]">+8</span>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-400/25">
                <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" /></span>
                Live
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {KPIS.map(([Icon, label, value, change, tone], i) => (
              <motion.div key={label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 + i * 0.08, duration: 0.45, ease }}
                className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
                <div className="flex items-center justify-between">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br shadow-lg ${tone}`}><Icon className="h-3.5 w-3.5" strokeWidth={2.2} /></span>
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300"><TrendingUp className="h-2.5 w-2.5" />{change}</span>
                </div>
                <p className="mt-2.5 font-display text-[22px] font-extrabold leading-none tabular-nums">{value}</p>
                <p className="mt-1 truncate text-[10.5px] text-slate-400">{label}</p>
              </motion.div>
            ))}
          </div>

          <div className="mt-3 rounded-xl bg-white/[0.025] px-3 pt-3 ring-1 ring-white/[0.06]">
            <div className="flex items-center justify-between">
              <p className="text-[11.5px] font-semibold text-slate-200">Zip codes</p>
              <div className="flex items-center gap-3 text-[10.5px] text-slate-400">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-brand-400" />Submitted</span>
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-emerald-400" />Approved</span>
              </div>
            </div>
            <WeekChart />
          </div>
        </div>
      </motion.div>

      {/* Floating notification */}
      <Float delay={0.9} className="absolute -right-8 -top-16 z-10 w-[230px]">
        <div className="flex items-center gap-3 rounded-2xl bg-white p-3 text-slate-900 shadow-[0_20px_50px_-12px_rgba(0,0,0,.6)]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg"><CheckCircle2 className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-bold">12 zips approved</p>
            <p className="truncate text-[11px] text-slate-500">Summit Roofing · just now</p>
          </div>
        </div>
      </Float>

      {/* Floating progress card */}
      <Float delay={1.15} distance={5} className="absolute -bottom-14 -left-8 z-10">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#1a1c45]/95 p-3 pr-4 shadow-[0_20px_50px_-12px_rgba(0,0,0,.7)] backdrop-blur-xl">
          <div className="relative">
            <Ring value={96} />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">96%</span>
          </div>
          <div>
            <p className="text-[12.5px] font-bold">Tasks on track</p>
            <p className="text-[11px] text-slate-400">48 of 50 this week</p>
          </div>
        </div>
      </Float>
    </div>
  );
}

// ---------- Layout ----------

export default function AuthShell({ title, subtitle, children }) {
  const reduce = useReducedMotion();
  const drift = (x, y, d) => (reduce ? {} : { animate: { x: [0, x, 0], y: [0, y, 0] }, transition: { duration: d, repeat: Infinity, ease: 'easeInOut' } });

  return (
    <div className="flex min-h-screen bg-white">
      {/* Brand panel */}
      <div className="theme-fixed relative hidden w-[48%] flex-col overflow-hidden bg-[#080a1c] px-12 py-10 text-white lg:flex">
        {/* Aurora + grid */}
        <motion.div {...drift(40, 30, 18)} className="pointer-events-none absolute -left-32 -top-32 h-[520px] w-[520px] rounded-full bg-brand-600/40 blur-[120px]" />
        <motion.div {...drift(-30, 40, 22)} className="pointer-events-none absolute -right-40 top-1/3 h-[460px] w-[460px] rounded-full bg-fuchsia-600/25 blur-[120px]" />
        <motion.div {...drift(30, -30, 20)} className="pointer-events-none absolute -bottom-40 left-1/4 h-[420px] w-[420px] rounded-full bg-cyan-500/15 blur-[120px]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,black,transparent)]" />

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="relative flex items-center gap-3">
          <LogoMark />
          <span className="font-display text-[16px] font-bold tracking-tight">Ops CRM</span>
        </motion.div>

        <div className="relative my-auto py-8">
          <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11.5px] font-medium text-brand-200 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-amber-300" />Your operations command center
          </motion.span>
          <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease, delay: 0.08 }}
            className="mt-4 max-w-lg text-[36px] font-extrabold leading-[1.1] tracking-tight [@media(max-height:860px)]:text-[30px]">
            Zip codes, client spend and your team,{' '}
            <span className="bg-gradient-to-r from-brand-300 via-fuchsia-300 to-amber-200 bg-clip-text text-transparent">all in one place.</span>
          </motion.h2>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.6 }} className="mt-3 max-w-[320px] text-[14.5px] leading-relaxed text-slate-400">
            Replace spreadsheets and Slack threads with a workflow that checks itself.
          </motion.p>

          <div className="mr-6 mt-10 [@media(max-height:860px)]:mt-8">
            <ProductShot />
          </div>
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.6 }} className="relative flex flex-wrap gap-2 [@media(max-height:860px)]:hidden">
          {FEATURES.map(([Icon, label]) => (
            <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[12px] font-medium text-slate-200 backdrop-blur">
              <Icon className="h-3.5 w-3.5 text-brand-300" strokeWidth={2} />{label}
            </span>
          ))}
        </motion.div>
      </div>

      {/* Form side */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-20 h-80 w-80 rounded-full bg-violet-200/30 blur-3xl" />

        <div className="relative flex flex-1 items-center justify-center p-6">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease, delay: 0.05 }} className="w-full max-w-[380px]">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <LogoMark />
              <span className="font-display text-[16px] font-bold tracking-tight text-slate-900">Ops CRM</span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11.5px] font-semibold text-brand-700 ring-1 ring-brand-100">
              <Lock className="h-3 w-3" />Secure workspace
            </span>
            <h1 className="mt-4 text-[32px] font-extrabold leading-tight tracking-tight text-slate-900">{title}</h1>
            {subtitle && <p className="mt-2 text-[14px] text-slate-500">{subtitle}</p>}
            <div className="mt-8">{children}</div>
          </motion.div>
        </div>

        <p className="relative flex items-center justify-center gap-1.5 pb-6 text-[12px] text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5" />Encrypted sign-in · © {new Date().getFullYear()} Ops CRM
        </p>
      </div>
    </div>
  );
}
