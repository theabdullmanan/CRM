import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../lib/theme';
import { cn } from '../../lib/utils';

/** Light / dark switch for the top bar: a pill with a sliding thumb. */
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const dark = theme === 'dark';

  const options = [
    ['light', Sun, 'Light theme'],
    ['dark', Moon, 'Dark theme'],
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="relative flex h-9 items-center gap-0.5 rounded-full border border-slate-200 bg-slate-100/80 p-1 shadow-[inset_0_1px_2px_rgba(16,24,40,.06)]"
    >
      {options.map(([value, Icon, label]) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'relative flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
              active ? (dark ? 'text-brand-700' : 'text-amber-500') : 'text-slate-400 hover:text-slate-600',
            )}
          >
            {active && (
              <motion.span
                layoutId="theme-thumb"
                className="absolute inset-0 rounded-full bg-white shadow-[0_1px_3px_rgba(16,24,40,.15),0_0_0_1px_rgba(16,24,40,.05)] dark:bg-slate-200 dark:shadow-[0_0_12px_rgba(129,134,248,.35)]"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <motion.span
              key={`${value}-${active}`}
              initial={active ? { rotate: -90, scale: 0.6 } : false}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="relative"
            >
              <Icon className="h-4 w-4" strokeWidth={2} fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
            </motion.span>
          </button>
        );
      })}
    </div>
  );
}
