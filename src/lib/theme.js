import { useSyncExternalStore } from 'react';
import { DEFAULT_ACCENT, isAccent, isCustomAccent } from './accents';
import { customAccentCss } from './colorScale';

// Appearance: light/dark mode and the accent colour.
// - Light/dark is remembered per browser (first visit follows the device setting).
// - The accent is saved on the user's profile; it's cached here so the page can paint in
//   the right colours before the profile loads. index.html applies both before React starts.
const THEME_KEY = 'theme';
const ACCENT_KEY = 'accent';
const ACCENT_CSS_KEY = 'accentCss';

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, v) => { try { if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, v); } catch { /* storage blocked */ } };

function initialTheme() {
  const saved = read(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function initialAccent() {
  const saved = read(ACCENT_KEY);
  return isAccent(saved) ? (isCustomAccent(saved) ? saved.toLowerCase() : saved) : DEFAULT_ACCENT;
}

let state = { theme: initialTheme(), accent: initialAccent() };
const listeners = new Set();

// A custom colour (#rrggbb) is applied as its own small stylesheet of accent variables.
function applyCustomCss(css) {
  let tag = document.getElementById('custom-accent');
  if (!css) { tag?.remove(); return; }
  if (!tag) { tag = document.createElement('style'); tag.id = 'custom-accent'; document.head.appendChild(tag); }
  if (tag.textContent !== css) tag.textContent = css;
}

function apply() {
  const el = document.documentElement;
  el.classList.toggle('dark', state.theme === 'dark');
  if (isCustomAccent(state.accent)) {
    const css = customAccentCss(state.accent);
    applyCustomCss(css);
    write(ACCENT_CSS_KEY, css); // lets index.html paint the custom colour before React loads
    el.setAttribute('data-accent', 'custom');
    return;
  }
  applyCustomCss(null);
  write(ACCENT_CSS_KEY, null);
  if (state.accent === DEFAULT_ACCENT) el.removeAttribute('data-accent');
  else el.setAttribute('data-accent', state.accent);
}
apply();

function update(patch) {
  state = { ...state, ...patch };
  apply();
  listeners.forEach((l) => l());
}

export function setTheme(theme) {
  write(THEME_KEY, theme);
  update({ theme });
}

/** Applies an accent locally: a preset id or a custom '#rrggbb'. null/undefined/'general' = default theme. */
export function setAccent(accent) {
  const next = isAccent(accent) ? (isCustomAccent(accent) ? accent.toLowerCase() : accent) : DEFAULT_ACCENT;
  if (next === state.accent) return;
  write(ACCENT_KEY, next === DEFAULT_ACCENT ? null : next);
  update({ accent: next });
}

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const snapshot = () => state;

export function useTheme() {
  const s = useSyncExternalStore(subscribe, snapshot);
  return {
    theme: s.theme,
    accent: s.accent,
    setTheme,
    setAccent,
    toggle: () => setTheme(s.theme === 'dark' ? 'light' : 'dark'),
  };
}
