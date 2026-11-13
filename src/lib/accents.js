// Accent colour presets a user can pick for their own dashboard (My account → Appearance).
// `palette` is the Tailwind colour family used for that accent; `general` is the default
// indigo theme everyone gets until they choose something else.
// Plain data only: tailwind.config.js imports this file too.
export const DEFAULT_ACCENT = 'general';

export const ACCENTS = [
  { id: 'general', label: 'General', palette: null, swatch: ['#6366f1', '#4338ca'] },
  { id: 'violet', label: 'Violet', palette: 'violet', swatch: ['#8b5cf6', '#6d28d9'] },
  { id: 'blue', label: 'Ocean', palette: 'blue', swatch: ['#3b82f6', '#1d4ed8'] },
  { id: 'teal', label: 'Teal', palette: 'teal', swatch: ['#14b8a6', '#0f766e'] },
  { id: 'emerald', label: 'Emerald', palette: 'emerald', swatch: ['#10b981', '#047857'] },
  { id: 'rose', label: 'Rose', palette: 'rose', swatch: ['#f43f5e', '#be123c'] },
  { id: 'orange', label: 'Sunset', palette: 'orange', swatch: ['#f97316', '#c2410c'] },
  { id: 'fuchsia', label: 'Fuchsia', palette: 'fuchsia', swatch: ['#d946ef', '#a21caf'] },
  { id: 'graphite', label: 'Graphite', palette: 'slate', swatch: ['#64748b', '#334155'] },
];

export const isAccent = (id) => ACCENTS.some((a) => a.id === id);
