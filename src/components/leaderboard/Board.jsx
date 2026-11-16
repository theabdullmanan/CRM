import { AnimatePresence, motion } from 'framer-motion';
import { Clock, Crown, Medal, Target } from 'lucide-react';
import { cn } from '../../lib/utils';
import { shortAgo } from '../../lib/leaderboard';
import { Avatar } from '../ui';

const spring = { type: 'spring', stiffness: 260, damping: 32 };

/**
 * How long a sender has been quiet (Today view only, during the business day):
 * amber after the idle threshold, red after twice that. Counts from the day start when
 * they haven't sent anything yet.
 */
export function idleLevel(row, now, idleMinutes, span, range) {
  if (range !== 'today' || now < span.start.getTime()) return null;
  const from = row.last && row.last >= span.start ? row.last.getTime() : span.start.getTime();
  const mins = (now - from) / 60000;
  if (mins >= idleMinutes * 2) return 'red';
  if (mins >= idleMinutes) return 'amber';
  return null;
}

/** "27 / 40" with a bar and percentage. Green with a check once the target is hit. */
export function ProgressMeter({ row, tv = false, compact = false }) {
  const pct = Math.min(100, row.pct);
  return (
    <div className={cn('min-w-0', compact ? 'w-full' : 'w-full')}>
      <div className={cn('flex items-baseline justify-between gap-2 tabular-nums', tv ? 'text-xl' : 'text-xs')}>
        <span className={cn('font-semibold', row.hit ? 'text-up-600' : tv ? 'text-white' : 'text-slate-700')}>
          {row.count} / {row.goal}
        </span>
        <span className={cn(row.hit ? 'font-semibold text-up-600' : tv ? 'text-slate-400' : 'text-slate-500')}>
          {row.hit ? <span className="inline-flex items-center gap-1"><Target className={tv ? 'h-5 w-5' : 'h-3 w-3'} />Target hit</span> : `${row.pct}%`}
        </span>
      </div>
      <div className={cn('mt-1.5 overflow-hidden rounded-full', tv ? 'h-3 bg-white/10' : 'h-2 bg-slate-100')}>
        <motion.div
          className={cn('h-full rounded-full', row.hit ? 'bg-up' : 'bg-brand-500')}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
        />
      </div>
    </div>
  );
}

/** "Last lead 12 min ago", amber/red when the sender has gone quiet. */
export function LastLead({ row, now, level, tv = false }) {
  const tone = level === 'red' ? 'text-down-600' : level === 'amber' ? 'text-amber-500' : tv ? 'text-slate-400' : 'text-slate-500';
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap', tone, tv ? 'text-lg' : 'text-xs', level && 'font-semibold')}>
      <Clock className={tv ? 'h-5 w-5' : 'h-3.5 w-3.5'} />
      {row.last ? shortAgo(row.last, now) : 'No leads yet'}
      {level && <span className="sr-only"> (quiet)</span>}
    </span>
  );
}

const MEDALS = [
  { label: '1st', ring: 'ring-amber-400/70', chip: 'bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950', glow: 'from-amber-400/20' },
  { label: '2nd', ring: 'ring-slate-300/70', chip: 'bg-gradient-to-b from-slate-200 to-slate-400 text-slate-900', glow: 'from-slate-300/15' },
  { label: '3rd', ring: 'ring-orange-400/60', chip: 'bg-gradient-to-b from-orange-300 to-orange-500 text-orange-950', glow: 'from-orange-400/15' },
];
// Desktop order: 2nd · 1st · 3rd, with 1st raised. Phones stack 1st, 2nd, 3rd.
const ORDER = ['sm:order-2', 'sm:order-1', 'sm:order-3'];

/** Featured cards for the top three. */
export function Podium({ rows, now, idleMinutes, span, range, tv = false }) {
  const top = rows.slice(0, 3);
  if (!top.length) return null;
  return (
    <div className={cn('grid gap-4 sm:items-end', top.length === 1 ? 'sm:grid-cols-1' : top.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
      {top.map((r, i) => {
        const m = MEDALS[i];
        const level = idleLevel(r, now, idleMinutes, span, range);
        return (
          <motion.div
            key={r.id}
            layout
            transition={spring}
            className={cn(
              'relative overflow-hidden rounded-2xl ring-1',
              top.length === 3 && ORDER[i],
              m.ring,
              tv ? 'bg-white/[0.04] p-7' : 'border border-slate-200 bg-white p-5 shadow-sm',
              i === 0 && (tv ? 'sm:pb-10 sm:pt-9' : 'sm:pb-7 sm:pt-6'),
            )}
          >
            <span className={cn('pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b to-transparent', m.glow)} />
            <div className="relative flex items-center gap-3">
              <span className={cn('flex shrink-0 items-center justify-center rounded-full font-extrabold shadow', m.chip, tv ? 'h-14 w-14 text-xl' : 'h-9 w-9 text-sm')}>
                {i === 0 ? <Crown className={tv ? 'h-7 w-7' : 'h-5 w-5'} /> : <Medal className={tv ? 'h-7 w-7' : 'h-4 w-4'} />}
              </span>
              <div className="min-w-0">
                <p className={cn('font-semibold uppercase tracking-wider', tv ? 'text-base text-slate-400' : 'text-[11px] text-slate-500')}>{m.label}</p>
                <p className={cn('truncate font-bold', tv ? 'text-3xl text-white' : 'text-[15px] text-slate-900')}>{r.name}</p>
              </div>
              {!tv && <span className="ml-auto"><Avatar name={r.name} userId={r.userId || r.id} size="md" /></span>}
            </div>
            <div className="relative mt-4 flex items-end justify-between gap-3">
              <p className={cn('font-display font-extrabold leading-none tabular-nums', tv ? 'text-7xl text-white' : 'text-[40px] text-slate-900')}>
                {r.count}
                <span className={cn('ml-2 font-semibold', tv ? 'text-xl text-slate-400' : 'text-xs text-slate-500')}>leads</span>
              </p>
              <LastLead row={r} now={now} level={level} tv={tv} />
            </div>
            <div className="relative mt-4"><ProgressMeter row={r} tv={tv} /></div>
          </motion.div>
        );
      })}
    </div>
  );
}

/** Ranked list for everyone after the top three. Rows glide to their new place when ranks change. */
export function RankList({ rows, now, idleMinutes, span, range, tv = false, from = 3 }) {
  const rest = rows.slice(from);
  if (!rest.length) return null;
  return (
    <div className={cn('overflow-hidden rounded-2xl', tv ? 'bg-white/[0.03] ring-1 ring-white/10' : 'border border-slate-200 bg-white')}>
      <div className={cn('grid items-center gap-4 border-b px-5 py-3 font-semibold uppercase tracking-[0.06em]',
        tv ? 'grid-cols-[4rem_1fr_7rem_minmax(0,18rem)_10rem] border-white/10 text-sm text-slate-400' : 'grid-cols-[2.5rem_1fr_4.5rem] border-slate-100 bg-slate-50/80 text-[11px] text-slate-500 sm:grid-cols-[3rem_1fr_5rem_minmax(0,14rem)_8rem]')}>
        <span>Rank</span><span>Sender</span><span className="text-right">Leads sent</span>
        <span className={tv ? '' : 'hidden sm:block'}>Target</span><span className={tv ? 'text-right' : 'hidden text-right sm:block'}>Last lead</span>
      </div>
      <AnimatePresence initial={false}>
        {rest.map((r) => {
          const level = idleLevel(r, now, idleMinutes, span, range);
          return (
            <motion.div
              key={r.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={spring}
              className={cn('grid items-center gap-4 border-b px-5 last:border-b-0',
                tv ? 'grid-cols-[4rem_1fr_7rem_minmax(0,18rem)_10rem] border-white/5 py-4' : 'grid-cols-[2.5rem_1fr_4.5rem] border-slate-100 py-3 sm:grid-cols-[3rem_1fr_5rem_minmax(0,14rem)_8rem]')}
            >
              <span className={cn('font-bold tabular-nums', tv ? 'text-2xl text-slate-300' : 'text-sm text-slate-500')}>#{r.rank}</span>
              <div className="flex min-w-0 items-center gap-3">
                {!tv && <Avatar name={r.name} userId={r.userId || r.id} size="sm" />}
                <div className="min-w-0">
                  <p className={cn('truncate font-semibold', tv ? 'text-2xl text-white' : 'text-[13.5px] text-slate-900')}>{r.name}</p>
                  {!tv && <div className="mt-1 sm:hidden"><ProgressMeter row={r} compact /><div className="mt-1"><LastLead row={r} now={now} level={level} /></div></div>}
                </div>
              </div>
              <span className={cn('text-right font-display font-extrabold tabular-nums', tv ? 'text-4xl text-white' : 'text-lg text-slate-900')}>{r.count}</span>
              <div className={tv ? '' : 'hidden sm:block'}><ProgressMeter row={r} tv={tv} /></div>
              <div className={cn('text-right', tv ? '' : 'hidden sm:block')}><LastLead row={r} now={now} level={level} tv={tv} /></div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
