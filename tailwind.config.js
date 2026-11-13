/** @type {import('tailwindcss').Config} */
import defaultColors from 'tailwindcss/colors';

// ---------------------------------------------------------------------------
// Light / dark theme
//
// Every colour scale used in the app is defined as a CSS variable, so switching
// the `dark` class on <html> re-skins the whole UI without per-page changes.
// Areas that are always dark by design (sidebar, login brand panel, hero banners)
// add the `theme-fixed` class to keep their light-theme values.
// ---------------------------------------------------------------------------

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
};

// Cool neutral scale (replaces Tailwind's slate everywhere).
const NEUTRAL_LIGHT = {
  50: '#f8f9fc', 100: '#f1f3f8', 200: '#e3e6ef', 300: '#cfd4e1', 400: '#9aa2b6',
  500: '#6b7386', 600: '#4d5466', 700: '#373d4d', 800: '#232836', 900: '#151925', 950: '#0a0d16',
};
// Dark theme: surfaces become deep navy, text becomes light.
const NEUTRAL_DARK = {
  50: '#171b28', 100: '#1d2232', 200: '#2a3045', 300: '#3a4158', 400: '#717a93',
  500: '#9098ae', 600: '#abb2c4', 700: '#c7ccd9', 800: '#dde1ea', 900: '#eef0f5', 950: '#f8f9fc',
};

// Indigo accent.
const BRAND_LIGHT = {
  50: '#eef0ff', 100: '#e0e4ff', 200: '#c7cdfe', 300: '#a4abfc', 400: '#8186f8',
  500: '#6366f1', 600: '#5046e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81', 950: '#1e1b4b',
};
const BRAND_DARK = {
  50: '#1c1b42', 100: '#25245c', 200: '#322f7f', 300: '#4540c0', 400: '#6366f1',
  500: '#6366f1', 600: '#7f83f7', 700: '#a4abfc', 800: '#c7cdfe', 900: '#e0e4ff', 950: '#eef0ff',
};

// Gains / losses.
const UP_LIGHT = { DEFAULT: '#10b981', 50: '#ecfdf5', 100: '#d1fae5', 600: '#059669', 700: '#047857' };
const UP_DARK = { DEFAULT: '#10b981', 50: '#06281f', 100: '#0a3d2f', 600: '#34d399', 700: '#6ee7b7' };
const DOWN_LIGHT = { DEFAULT: '#f43f5e', 50: '#fff1f3', 100: '#ffe0e5', 600: '#e11d48', 700: '#be123c' };
const DOWN_DARK = { DEFAULT: '#f43f5e', 50: '#33101a', 100: '#4c1424', 600: '#fb7185', 700: '#fda4af' };

// Tailwind palettes used for badges, tiles and tints. In dark mode the pale and
// deep ends swap (50 ↔ 950 … 300 ↔ 700); the vivid middle (400–600) stays.
const PALETTES = ['amber', 'emerald', 'sky', 'violet', 'rose', 'red', 'orange', 'teal', 'blue', 'fuchsia', 'purple', 'pink', 'cyan', 'green', 'indigo', 'yellow', 'lime'];
const SWAP = { 50: '950', 100: '900', 200: '800', 300: '700', 700: '300', 800: '200', 900: '100', 950: '50' };

const SURFACE_LIGHT = '#ffffff';
const SURFACE_DARK = '#141824';

function varsFor(mode) {
  const dark = mode === 'dark';
  const v = {};
  const put = (name, map) => Object.entries(map).forEach(([k, hex]) => { v[`--${name}-${k}`] = hexToRgb(hex); });
  put('n', dark ? NEUTRAL_DARK : NEUTRAL_LIGHT);
  put('b', dark ? BRAND_DARK : BRAND_LIGHT);
  put('up', dark ? UP_DARK : UP_LIGHT);
  put('down', dark ? DOWN_DARK : DOWN_LIGHT);
  PALETTES.forEach((p) => SHADES.forEach((s) => {
    v[`--${p}-${s}`] = hexToRgb(defaultColors[p][dark && SWAP[s] ? SWAP[s] : s]);
  }));
  v['--surface'] = hexToRgb(dark ? SURFACE_DARK : SURFACE_LIGHT);
  return v;
}

const ref = (name, keys) => Object.fromEntries(keys.map((k) => [k, `rgb(var(--${name}-${k}) / <alpha-value>)`]));

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        slate: ref('n', SHADES),
        brand: ref('b', SHADES),
        up: ref('up', ['DEFAULT', '50', '100', '600', '700']),
        down: ref('down', ['DEFAULT', '50', '100', '600', '700']),
        ...Object.fromEntries(PALETTES.map((p) => [p, ref(p, SHADES)])),
      },
      // `bg-white` is the card / panel surface: white in light mode, deep navy in dark.
      // (Text, borders and rings that say "white" stay white.)
      backgroundColor: { white: 'rgb(var(--surface) / <alpha-value>)' },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.03)',
        lift: '0 12px 32px -12px rgba(16,24,40,.18), 0 2px 6px -2px rgba(16,24,40,.06)',
        pop: '0 24px 64px -16px rgba(16,24,40,.32), 0 0 0 1px rgba(16,24,40,.06)',
        glow: '0 8px 24px -8px rgba(99,102,241,.55)',
      },
      letterSpacing: { tightest: '-0.03em' },
    },
  },
  plugins: [
    ({ addBase }) => addBase({
      ':root': { ...varsFor('light'), colorScheme: 'light' },
      '.dark': { ...varsFor('dark'), colorScheme: 'dark' },
      // Always-dark areas keep the light-theme colour values.
      '.dark .theme-fixed': { ...varsFor('light'), colorScheme: 'dark' },
    }),
  ],
};
