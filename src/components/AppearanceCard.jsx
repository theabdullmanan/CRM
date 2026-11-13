import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, CheckCircle2, Loader2, Moon, Palette, Pipette, RotateCcw, Sun } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ACCENTS, DEFAULT_ACCENT, isCustomAccent } from '../lib/accents';
import { HEX_RE, hexToHsl, hslToHex, normaliseBase } from '../lib/colorScale';
import { useTheme } from '../lib/theme';
import { cn, friendlyError } from '../lib/utils';
import { updateMyAppearance } from '../services/userService';
import { Badge, Button, Card, CardHeader, Input, ProgressBar } from './ui';

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

const DEFAULT_CUSTOM = '#4f7cff';
const nameOf = (id) => (isCustomAccent(id) ? `Custom colour ${id.toUpperCase()}` : `${ACCENTS.find((a) => a.id === id)?.label} theme`);

/** Custom colour: a hue line to drag, a hex field and the system colour chooser. */
function CustomColour({ value, onPreview, onCommit }) {
  const current = value || DEFAULT_CUSTOM;
  const [h, s, l] = hexToHsl(current);
  const [draft, setDraft] = useState(current.toUpperCase());
  useEffect(() => { setDraft(current.toUpperCase()); }, [current]);
  const draftOk = HEX_RE.test(draft.startsWith('#') ? draft : `#${draft}`);

  // Dragging the line changes only the hue, keeping the colour's strength and brightness.
  const fromHue = (hue) => normaliseBase(hslToHex(hue, Math.min(Math.max(s, 55), 82), Math.min(Math.max(l, 38), 52)));
  const commitDraft = () => {
    const hex = (draft.startsWith('#') ? draft : `#${draft}`).toLowerCase();
    if (HEX_RE.test(hex)) onCommit(hex); else setDraft(current.toUpperCase());
  };

  return (
    <div className={cn('rounded-xl border p-4 transition-colors', value ? 'border-brand-500 bg-brand-50/40 ring-2 ring-brand-500/15' : 'border-slate-200')}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[13px] font-semibold text-slate-800"><Pipette className="h-4 w-4 text-brand-500" />Custom colour</p>
          <p className="mt-0.5 text-[12px] text-slate-500">Drag along the line, type a hex code, or open the full colour chooser.</p>
        </div>
        {value && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white">In use</span>}
      </div>

      <input
        type="range" min="0" max="359" step="1" aria-label="Colour hue"
        value={Math.round(h)}
        onChange={(e) => onPreview(fromHue(Number(e.target.value)))}
        className="hue-slider w-full"
        style={{ '--thumb': current }}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="h-10 w-10 shrink-0 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,.3)] ring-1 ring-black/10" style={{ background: current, boxShadow: `0 6px 16px -6px ${current}` }} />
        <div className="relative w-36">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[13px] text-slate-400">#</span>
          <Input
            value={draft.replace('#', '')}
            onChange={(e) => setDraft(`#${e.target.value.replace(/[^0-9a-f]/gi, '').slice(0, 6)}`)}
            onBlur={commitDraft}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitDraft(); } }}
            aria-label="Hex colour code"
            className={cn('h-10 pl-7 font-mono uppercase tracking-wider', !draftOk && 'border-down-600 focus:border-down-600 focus:ring-down-600/15')}
          />
        </div>
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50">
          <Palette className="h-4 w-4 text-slate-500" />More shades
          <input type="color" value={current} onChange={(e) => onPreview(e.target.value)} className="sr-only" />
        </label>
        {!draftOk && <span className="text-[12px] text-down-700">Use 6 characters, e.g. 1E90FF</span>}
      </div>
    </div>
  );
}

export default function AppearanceCard() {
  const { profile, preview } = useAuth();
  const { theme, setTheme, accent, setAccent } = useTheme();
  const [saving, setSaving] = useState(null);
  const customValue = isCustomAccent(accent) ? accent : null;
  const lastCustom = useRef(customValue || (isCustomAccent(profile?.accentColor) ? profile.accentColor : DEFAULT_CUSTOM));
  if (customValue) lastCustom.current = customValue;

  // The last value saved to the profile, so a failed save can roll back to it.
  const saved = useRef(profile?.accentColor || DEFAULT_ACCENT);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const save = async (value) => {
    if (preview) { toast.success('Preview mode: applied on this browser only', { id: 'appearance' }); return; }
    setSaving(value);
    try {
      await updateMyAppearance(profile.id, { accentColor: value === DEFAULT_ACCENT ? null : value });
      saved.current = value;
      toast.success(value === DEFAULT_ACCENT ? 'Back to the General theme' : `${nameOf(value)} saved`, { id: 'appearance' });
    } catch (e) {
      setAccent(saved.current);
      toast.error(friendlyError(e), { id: 'appearance' });
    } finally { setSaving(null); }
  };

  /** Presets and typed hex codes: apply and save straight away. */
  const pick = (id) => {
    clearTimeout(timer.current);
    if (id === accent || saving) return;
    setAccent(id);
    save(id);
  };

  /** Dragging / colour chooser: apply live, save once the user pauses. */
  const previewCustom = (hex) => {
    setAccent(hex);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(hex.toLowerCase()), 700);
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
            {/* Custom tile: re-applies the user's last custom colour */}
            <button type="button" onClick={() => pick(lastCustom.current)} aria-pressed={Boolean(customValue)} title="Custom colour"
              className={cn('relative flex flex-col items-center gap-2 rounded-xl border px-2 py-3 transition-all',
                customValue ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20' : 'border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm')}>
              <span className="relative flex h-9 w-9 items-center justify-center rounded-full"
                style={{ background: 'conic-gradient(from 180deg, #f43f5e, #f97316, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #d946ef, #f43f5e)' }}>
                <span className="flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-white/80" style={{ background: lastCustom.current }}>
                  {saving && isCustomAccent(saving) ? <Loader2 className="h-3.5 w-3.5 animate-spin text-white" /> : customValue && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                </span>
              </span>
              <span className="text-[12px] font-semibold text-slate-700">Custom</span>
            </button>
          </div>

          <div className="mt-3">
            <CustomColour value={customValue} onPreview={previewCustom} onCommit={pick} />
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
