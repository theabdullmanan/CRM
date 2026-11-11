import { motion } from 'framer-motion';
import { MapPin, LineChart, CheckSquare, ShieldCheck } from 'lucide-react';
import { LogoMark } from '../../components/layout/Layout';

const FEATURES = [
  [MapPin, 'Zip codes without duplicates', '6-week cooldown enforced per client sub-account.'],
  [LineChart, 'Real-time client spend', 'Daily, weekly, 30-day and lifetime, setup fees excluded.'],
  [CheckSquare, 'Tasks and deadlines', 'Overdue alerts and team progress for admins.'],
  [ShieldCheck, 'Role-based access', 'Every department sees exactly what it needs.'],
];

const ease = [0.2, 0.7, 0.2, 1];

// Deterministic sample candles for the decorative chart.
const CANDLES = (() => {
  const out = [];
  let v = 52;
  for (let i = 0; i < 34; i += 1) {
    const drift = Math.sin(i * 0.55) * 4 + (i * 0.6) + ((i * 37) % 7) - 3;
    const open = v;
    const close = 52 + drift;
    const high = Math.max(open, close) + 1.5 + ((i * 13) % 4);
    const low = Math.min(open, close) - 1.5 - ((i * 7) % 3);
    out.push({ open, close, high, low });
    v = close;
  }
  return out;
})();

function CandlePreview() {
  const W = 520; const H = 180;
  const min = Math.min(...CANDLES.map((c) => c.low));
  const max = Math.max(...CANDLES.map((c) => c.high));
  const y = (v) => H - ((v - min) / (max - min)) * (H - 16) - 8;
  const step = W / CANDLES.length;
  const last = CANDLES[CANDLES.length - 1];
  return (
    <svg viewBox={`0 0 ${W + 58} ${H}`} className="w-full" aria-hidden>
      {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="rgba(255,255,255,.05)" />)}
      {CANDLES.map((c, i) => {
        const up = c.close >= c.open;
        const color = up ? '#089981' : '#f23645';
        const cx = i * step + step / 2;
        return (
          <motion.g key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.025, duration: 0.35, ease }}>
            <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth="1" />
            <rect x={cx - step * 0.32} y={y(Math.max(c.open, c.close))} width={step * 0.64} height={Math.max(1.5, Math.abs(y(c.open) - y(c.close)))} fill={color} rx="1" />
          </motion.g>
        );
      })}
      <line x1="0" x2={W} y1={y(last.close)} y2={y(last.close)} stroke="#089981" strokeDasharray="2 3" strokeOpacity="0.8" />
      <rect x={W + 4} y={y(last.close) - 9} width="52" height="18" rx="3" fill="#089981" />
      <text x={W + 30} y={y(last.close) + 3.5} textAnchor="middle" fill="#fff" fontSize="10.5" fontWeight="600" fontFamily="JetBrains Mono, monospace">$4.8k</text>
    </svg>
  );
}

export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen bg-white">
      <div className="relative hidden w-[46%] flex-col overflow-hidden bg-[#0e0e10] p-12 text-white lg:flex">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="flex items-center gap-2.5">
          <LogoMark />
          <span className="text-[15px] font-semibold tracking-tight">Ops CRM</span>
        </motion.div>

        <div className="mt-auto">
          <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease, delay: 0.1 }} className="max-w-md text-[34px] font-semibold leading-[1.15] tracking-tight">
            Zip codes, client spend and your team's work, in one place.
          </motion.h2>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25, duration: 0.6 }} className="mt-4 max-w-md text-[15px] leading-relaxed text-slate-400">
            Replaces the spreadsheets and Slack threads with a workflow that checks itself.
          </motion.p>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.5 }} className="mt-10 rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">Client spend · 30 days</p>
                <p className="mt-1 font-mono text-xl font-semibold tabular-nums">$142,380.00 <span className="ml-1 text-[13px] font-medium text-[#2ec4a7]">▲ +6.4%</span></p>
              </div>
              <span className="font-mono text-[11px] text-slate-500">1D · 1W · <span className="text-slate-200">1M</span></span>
            </div>
            <CandlePreview />
          </motion.div>

          <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-5">
            {FEATURES.map(([Icon, t, d], i) => (
              <motion.div key={t} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 + i * 0.06, duration: 0.45, ease }} className="flex gap-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" strokeWidth={1.75} />
                <div>
                  <p className="text-[13px] font-medium text-slate-100">{t}</p>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-slate-500">{d}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease, delay: 0.05 }} className="w-full max-w-[360px]">
          <div className="mb-8 lg:hidden"><LogoMark className="bg-slate-900 text-white" /></div>
          <h1 className="text-[24px] font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[13.5px] text-slate-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </motion.div>
      </div>
    </div>
  );
}
