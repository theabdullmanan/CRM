import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, animate, useInView } from 'framer-motion';
import { Loader2, X, Inbox, Search } from 'lucide-react';
import { cn, initials } from '../../lib/utils';
import { PhotoContext } from '../../lib/photos';

export const ease = [0.2, 0.7, 0.2, 1];
const slide = { type: 'tween', ease, duration: 0.28 };

// ---------- Button ----------
const variants = {
  primary: 'bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_1px_2px_rgba(16,24,40,.12),0_4px_12px_-4px_rgba(80,70,229,.5)] hover:from-brand-600 hover:to-brand-700',
  secondary: 'bg-white text-slate-800 border border-slate-200 shadow-[0_1px_2px_rgba(16,24,40,.05)] hover:bg-slate-50 hover:border-slate-300',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-gradient-to-b from-down to-down-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_4px_12px_-4px_rgba(225,29,72,.5)] hover:from-down-600 hover:to-down-700',
  success: 'bg-gradient-to-b from-up to-up-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_4px_12px_-4px_rgba(5,150,105,.5)] hover:from-up-600 hover:to-up-700',
  subtle: 'bg-slate-100 text-slate-800 hover:bg-slate-200/70',
};
const sizes = { xs: 'h-7 px-2.5 text-xs rounded-md', sm: 'h-8 px-3 text-[13px] rounded-lg', md: 'h-9 px-4 text-[13px] rounded-lg', lg: 'h-11 px-5 text-sm rounded-xl' };

export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, className, children, ...props }) {
  return (
    <button
      className={cn(
        'relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap font-semibold transition-all duration-150 active:translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50',
        variants[variant], sizes[size], className,
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4 opacity-80" strokeWidth={2} /> : null}
      {children}
    </button>
  );
}

// ---------- Card ----------
export function Card({ className, children, interactive, ...props }) {
  return (
    <div
      className={cn(
        'surface-gradient rounded-2xl border border-slate-200/70 bg-white shadow-card transition-all duration-200 dark:border-white/[0.07] dark:shadow-[inset_0_1px_0_rgba(255,255,255,.04),0_8px_24px_-12px_rgba(0,0,0,.5)]',
        interactive && 'cursor-pointer hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lift',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, actions, className }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-bold tracking-tight text-slate-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------- Badge ----------
const badgeColors = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200/80',
  red: 'bg-down-50 text-down-700 ring-down-100',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200/70',
  emerald: 'bg-up-50 text-up-700 ring-up-100',
  sky: 'bg-sky-50 text-sky-800 ring-sky-200/70',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200/70',
  indigo: 'bg-brand-50 text-brand-700 ring-brand-100',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200/70',
};
const dotColors = { slate: 'bg-slate-400', red: 'bg-down', amber: 'bg-amber-500', emerald: 'bg-up', sky: 'bg-sky-500', violet: 'bg-violet-500', indigo: 'bg-brand-500', rose: 'bg-rose-500' };

export function Badge({ color = 'slate', dot, className, children }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset', badgeColors[color] || badgeColors.slate, className)}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dotColors[color])} />}
      {children}
    </span>
  );
}

export function StatusBadge({ map, value }) {
  const s = map[value] || { label: value, color: 'slate' };
  return <Badge color={s.color} dot>{s.label}</Badge>;
}

/** ▲ +4.2% / ▼ −3.1% change indicator in market colours. */
export function Delta({ value, className, suffix = '%', chip = true }) {
  if (value == null || !Number.isFinite(value)) return <span className={cn('text-xs text-slate-400', className)}>—</span>;
  const r = Math.round(value * 10) / 10;
  const up = r >= 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-mono text-[11.5px] font-medium tabular-nums',
        up ? 'text-up-700' : 'text-down-700',
        chip && (up ? 'rounded bg-up-50 px-1.5 py-0.5' : 'rounded bg-down-50 px-1.5 py-0.5'),
        className,
      )}
    >
      <span className="text-[9px]">{up ? '▲' : '▼'}</span>
      {up ? '+' : '−'}{Math.abs(r).toFixed(1)}{suffix}
    </span>
  );
}

// ---------- Form controls ----------
const control = 'block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13.5px] text-slate-900 placeholder:text-slate-400 shadow-[0_1px_2px_rgba(16,24,40,.04)] transition-[border-color,box-shadow] duration-150 hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 disabled:bg-slate-50 dark:bg-slate-50/60 dark:focus:bg-white';

export function Field({ label, hint, error, children, className }) {
  return (
    <label className={cn('block', className)}>
      {label && <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">{label}</span>}
      {children}
      {error ? <span className="mt-1 block text-xs text-down-700">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}
export const Input = ({ className, ...p }) => <input className={cn(control, className)} {...p} />;
export const Textarea = ({ className, ...p }) => <textarea className={cn(control, 'min-h-[90px]', className)} {...p} />;
export function Select({ className, children, ...p }) {
  // A fixed height (e.g. compact table pickers) replaces the default vertical padding,
  // so the text stays centred instead of being clipped.
  const fixedHeight = /(^|\s)h-\d/.test(className || '');
  const base = fixedHeight ? control.replace(' py-2 ', ' py-0 ') : control;
  return <select className={cn(base, 'cursor-pointer pr-8', className)} {...p}>{children}</select>;
}

// ---------- Modal ----------
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  const width = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            className={cn('relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-pop sm:rounded-2xl', width)}
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.22, ease }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
              <div>
                <h2 className="text-[16px] font-bold tracking-tight text-slate-900">{title}</h2>
                {subtitle && <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{subtitle}</p>}
              </div>
              <button onClick={onClose} className="-mr-1 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ---------- Confirm dialog (promise based) ----------
const ConfirmCtx = createContext(() => Promise.resolve(false));
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => setState({ ...opts, resolve })), []);
  const close = (v) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={Boolean(state)}
        onClose={() => close(false)}
        title={state?.title || 'Are you sure?'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>Cancel</Button>
            <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{state?.confirmLabel || 'Confirm'}</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">{state?.message}</p>
      </Modal>
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

// ---------- Loading ----------
export function Spinner({ className }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-slate-400', className)} />;
}

export function Skeleton({ className }) {
  return <div className={cn('skeleton', className)} />;
}

export function PageLoader() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[132px] rounded-2xl" />)}
      </div>
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 rounded-2xl bg-gradient-to-br from-brand-50 to-violet-50 p-3.5 ring-1 ring-brand-100">
        <Icon className="h-6 w-6 text-brand-500 dark:text-brand-700" strokeWidth={1.75} />
      </div>
      <p className="font-display text-[15px] font-bold text-slate-900">{title}</p>
      {message && <p className="mt-1 max-w-sm text-[13px] text-slate-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ---------- Animated number ----------
const NUM_RE = /^([^\d-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/;

export function AnimatedNumber({ value }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const str = String(value ?? '');
  const m = str.match(NUM_RE);
  const target = m ? Number(m[2].replace(/,/g, '')) : null;
  const decimals = m && m[2].includes('.') ? m[2].split('.')[1].length : 0;
  const prev = useRef(0);

  useEffect(() => {
    if (!ref.current || target == null || !inView) return undefined;
    const fmt = (n) => `${m[1]}${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${m[3]}`;
    const controls = animate(prev.current, target, {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { if (ref.current) ref.current.textContent = fmt(v); },
    });
    prev.current = target;
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, inView]);

  return <span ref={ref}>{target == null ? str : `${m[1]}0${m[3]}`}</span>;
}

// ---------- Stat card ----------
// Icon tile + background glow per tone.
const TONES = {
  brand: { tile: 'from-brand-500 to-violet-600 shadow-[0_6px_16px_-6px_rgba(99,102,241,.7)]', glow: 'bg-brand-500' },
  emerald: { tile: 'from-emerald-400 to-teal-600 shadow-[0_6px_16px_-6px_rgba(16,185,129,.7)]', glow: 'bg-emerald-500' },
  amber: { tile: 'from-amber-400 to-orange-500 shadow-[0_6px_16px_-6px_rgba(245,158,11,.7)]', glow: 'bg-amber-500' },
  red: { tile: 'from-rose-400 to-red-600 shadow-[0_6px_16px_-6px_rgba(244,63,94,.7)]', glow: 'bg-rose-500' },
  sky: { tile: 'from-sky-400 to-blue-600 shadow-[0_6px_16px_-6px_rgba(14,165,233,.7)]', glow: 'bg-sky-500' },
  violet: { tile: 'from-violet-500 to-fuchsia-600 shadow-[0_6px_16px_-6px_rgba(139,92,246,.7)]', glow: 'bg-violet-500' },
};

/**
 * KPI tile. `delta` (percent) renders a market-style change chip and
 * `spark` (array of numbers) renders a trend sparkline coloured by direction.
 */
export function StatCard({ label, value, sub, icon: Icon, tone = 'brand', onClick, delta, deltaLabel, spark, children }) {
  const t = TONES[tone] || TONES.brand;
  return (
    <Card interactive={Boolean(onClick)} className="group relative overflow-hidden p-5 hover:shadow-lift" onClick={onClick}>
      <span className={cn('pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-[0.08] blur-2xl transition-opacity duration-300 group-hover:opacity-[0.16]', t.glow)} />
      <div className="relative flex items-start justify-between gap-3">
        <p className="eyebrow pt-1">{label}</p>
        {Icon && (
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white transition-transform duration-200 group-hover:scale-105', t.tile)}>
            <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
        )}
      </div>
      <div className="relative mt-2 flex items-end justify-between gap-3">
        <p className="truncate font-display text-[30px] font-bold leading-none tracking-tight text-slate-900 tabular-nums">
          <AnimatedNumber value={value} />
        </p>
        {spark && spark.length > 1 && <MiniSpark data={spark} />}
      </div>
      {(delta !== undefined || sub) && (
        <div className="relative mt-3 flex items-center gap-2 text-xs text-slate-500">
          {delta !== undefined && <Delta value={delta} />}
          {deltaLabel && <span>{deltaLabel}</span>}
          {sub && <span className="truncate">{sub}</span>}
        </div>
      )}
      {children}
    </Card>
  );
}

/** Pure-SVG sparkline (no axes), green when the period closed higher, red when lower. */
export function MiniSpark({ data, width = 92, height = 32, className }) {
  const gid = useId().replace(/:/g, '');
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => [i * step, height - 2 - ((v - min) / span) * (height - 4)]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const up = data[data.length - 1] >= data[0];
  const color = up ? '#089981' : '#f23645';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn('shrink-0 overflow-visible', className)} aria-hidden>
      <defs>
        <linearGradient id={`sp${gid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#sp${gid})`} />
      <motion.path
        d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease }}
      />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.25" fill={color} />
    </svg>
  );
}

const avatarTones = [
  'bg-gradient-to-br from-brand-500 to-violet-600',
  'bg-gradient-to-br from-sky-500 to-blue-600',
  'bg-gradient-to-br from-emerald-500 to-teal-600',
  'bg-gradient-to-br from-amber-500 to-orange-600',
  'bg-gradient-to-br from-fuchsia-500 to-purple-600',
  'bg-gradient-to-br from-rose-500 to-pink-600',
];
export function Avatar({ name, size = 'md', userId, src }) {
  const photos = useContext(PhotoContext);
  const photo = src || (userId ? photos[userId] : null);
  const tone = avatarTones[(name || '').split('').reduce((s, c) => s + c.charCodeAt(0), 0) % avatarTones.length];
  const dim = { sm: 'h-7 w-7 text-[10.5px]', md: 'h-8 w-8 text-xs', lg: 'h-12 w-12 text-base', xl: 'h-24 w-24 text-2xl' }[size];
  if (photo) return <img src={photo} alt={name || ''} className={cn('shrink-0 rounded-full object-cover shadow-sm ring-1 ring-black/5', dim)} />;
  return (
    <div className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide text-white shadow-[inset_0_1px_0_rgba(255,255,255,.25)]', tone, dim)}>
      {initials(name)}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, icon: Icon }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon && (
          <span className="bg-brand-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-glow">
            <Icon className="h-5 w-5" strokeWidth={2} />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Segmented control with a sliding thumb. */
export function Tabs({ tabs, value, onChange, size = 'md' }) {
  const id = useId();
  return (
    <div className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-slate-100/80 p-1 ring-1 ring-inset ring-slate-200/70">
      {tabs.map((t) => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={cn(
              'relative flex items-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-[13px]',
              active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800',
            )}
          >
            {active && <motion.span layoutId={`tab-${id}`} className="absolute inset-0 rounded-lg bg-white shadow-[0_1px_3px_rgba(16,24,40,.1),0_0_0_1px_rgba(16,24,40,.04)]" transition={slide} />}
            {t.icon && <t.icon className="relative h-3.5 w-3.5" />}
            <span className="relative">{t.label}</span>
            {t.count != null && (
              <span className={cn('relative rounded px-1 font-mono text-[11px] tabular-nums', active ? 'bg-brand-600 text-white' : 'bg-slate-200/80 text-slate-600')}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Table({ children, className }) {
  return (
    <div className={cn('scrollbar-thin overflow-x-auto', className)}>
      <table className="min-w-full divide-y divide-slate-100 text-[13px] [&_tbody_tr]:transition-colors [&_tbody_tr]:duration-100 [&_tbody_tr:hover]:bg-brand-50/40">{children}</table>
    </div>
  );
}
export const Th = ({ className, children, ...p }) => (
  <th className={cn('sticky top-0 z-[1] whitespace-nowrap border-b border-slate-100 bg-slate-50/80 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500 backdrop-blur', className)} {...p}>{children}</th>
);
export const Td = ({ className, children, ...p }) => (
  <td className={cn('px-4 py-3 align-middle text-slate-700', className)} {...p}>{children}</td>
);

export function SearchInput({ value, onChange, placeholder = 'Search…', className }) {
  return (
    <div className={cn('relative sm:w-64', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-full pl-9" type="search" />
    </div>
  );
}

export function ProgressBar({ value, className, tone }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-slate-100', className)}>
      <motion.div
        className={cn('h-full rounded-full', tone || (v >= 70 ? 'bg-up' : v >= 40 ? 'bg-amber-500' : 'bg-down'))}
        initial={{ width: 0 }}
        animate={{ width: `${v}%` }}
        transition={{ duration: 0.8, ease }}
      />
    </div>
  );
}
