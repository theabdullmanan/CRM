import { useState } from 'react';
import toast from 'react-hot-toast';
import { Check, CheckCircle2, Loader2, Moon, Palette, RotateCcw, Sun } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ACCENTS, DEFAULT_ACCENT } from '../lib/accents';
import { useTheme } from '../lib/theme';
import { cn, friendlyError } from '../lib/utils';
import { updateMyAppearance } from '../services/userService';
import { Badge, Button, Card, CardHeader, ProgressBar } from './ui';

/** Tiny mock dashboard used on the Light / Dark tiles. */
function ModeMock({ dark }) {
  return (
    <div className={cn('flex h-[72px] overflow-hidden rounded-lg ring-1', dark ? 'bg-[#0b0e17] ring-white/10' : 'bg-[#f5f6fa] ring-black/5')}>
      <div className="w-5 bg-gradient-to-b from-[#12142a] to-[#0a0b16]" />
      <div className="flex-1 space-y-1.5 p-2">
        <div className={cn('h-2 w-10 rounded-full', dark ? 'bg-[#eef0f5]/80' : 'bg-[#151925]/80')} />
        <div className="grid grid-cols-2 gap-1.5">
          {[0, 1].map((i) => (
            <div key={i} className={cn('h-7 rounded-md p-1 ring-1', dark ? 'bg-[#141824] ring-white/[0.07]' : 'bg-[#ffffff] ring-black/5')}>
              <div className="h-1.5 w-6 rounded-full bg-brand-500" />
              <div className={cn('mt-1 h-1.5 w-9 rounded-full', dark ? 'bg-white/20' : 'bg-black/10')} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AppearanceCard() {
  const { profile, preview } = useAuth();
  const { theme, setTheme, accent, setAccent } = useTheme();
  const [saving, setSaving] = useState(null);

  const pick = async (id) => {
    if (id === accent || saving) return;
    const previous = accent;
    setAccent(id); // apply instantly
    if (preview) { toast.success('Preview mode: applied on this browser only'); return; }
    setSaving(id);
    try {
      await updateMyAppearance(profile.id, { accentColor: id === DEFAULT_ACCENT ? null : id });
      toast.success(id === DEFAULT_ACCENT ? 'Back to the General theme' : `${ACCENTS.find((a) => a.id === id).label} theme saved`);
    } catch (e) {
      setAccent(previous);
      toast.error(friendlyError(e));
    } finally { setSaving(null); }
  };

  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><Palette className="h-4 w-4 text-brand-500" />Appearance</span>}
        subtitle="Personalise how the CRM looks for you. Only you see these changes, and they follow you on every device."
        actions={accent !== DEFAULT_ACCENT && (
          <Button size="sm" variant="ghost" icon={RotateCcw} disabled={Boolean(saving)} onClick={() => pick(DEFAULT_ACCENT)}>Reset to General</Button>
        )}
      />

      <div className="space-y-6 p-5">
        {/* Mode */}
        <div>
          <p className="mb-2.5 text-[13px] font-semibold text-slate-700">Mode</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[['light', Sun, 'Light'], ['dark', Moon, 'Dark']].map(([value, Icon, label]) => {
              const on = theme === value;
              return (
                <button key={value} type="button" onClick={() => setTheme(value)} aria-pressed={on}
                  className={cn('group rounded-xl border p-3 text-left transition-all',
                    on ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20' : 'border-slate-200 hover:border-slate-300')}>
                  <ModeMock dark={value === 'dark'} />
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[13px] font-semibold text-slate-800"><Icon className="h-4 w-4 text-slate-500" />{label}</span>
                    {on && <CheckCircle2 className="h-4 w-4 text-brand-600" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Accent colour */}
        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-slate-700">Accent colour</p>
            <p className="text-[12px] text-slate-500">Buttons, highlights, links and the sidebar glow</p>
          </div>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
            {ACCENTS.map((a) => {
              const on = accent === a.id;
              return (
                <button key={a.id} type="button" onClick={() => pick(a.id)} aria-pressed={on} title={a.label}
                  className={cn('relative flex flex-col items-center gap-2 rounded-xl border px-2 py-3 transition-all',
                    on ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20' : 'border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm')}>
                  <span className="relative flex h-9 w-9 items-center justify-center rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,.3)]"
                    style={{ backgroundImage: `linear-gradient(135deg, ${a.swatch[0]}, ${a.swatch[1]})`, boxShadow: `0 6px 14px -6px ${a.swatch[0]}` }}>
                    {saving === a.id ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : on && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                  </span>
                  <span className="text-[12px] font-semibold text-slate-700">{a.label}</span>
                  {a.id === DEFAULT_ACCENT && <span className="absolute right-1.5 top-1.5 rounded-full bg-slate-100 px-1.5 text-[9.5px] font-bold uppercase tracking-wide text-slate-500">Default</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Live preview */}
        <div className="rounded-xl border border-dashed border-slate-200 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Preview</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" icon={Check}>Primary action</Button>
            <Button size="sm" variant="secondary">Secondary</Button>
            <Badge color="indigo" dot>Highlighted</Badge>
            <span className="text-[13px] font-semibold text-brand-600 underline-offset-2 hover:underline">A link</span>
            <ProgressBar value={68} tone="bg-brand-500" className="w-32" />
          </div>
        </div>
      </div>
    </Card>
  );
}
