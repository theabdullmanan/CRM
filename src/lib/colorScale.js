// Builds a full accent scale (50–950, light and dark) from any single colour the user picks.
// The result is injected as CSS variables, exactly like the built-in presets.

export const HEX_RE = /^#[0-9a-f]{6}$/i;

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const toHex = (n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
export const rgbToHex = ([r, g, b]) => `#${toHex(r)}${toHex(g)}${toHex(b)}`;

export function hexToHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

export function hslToHex(h, s, l) {
  const S = s / 100; const L = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

/** Mix colour `a` toward `b` by `t` (0 = a, 1 = b). */
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// WCAG relative luminance and contrast ratio against white.
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrastWithWhite = (hex) => 1.05 / (luminance(hex) + 0.05);

/**
 * Keeps the base colour usable as a button background with white text: neon colours are
 * toned down and light ones darkened until white text is readable; very dark ones are lifted.
 */
export function normaliseBase(hex) {
  const [h, s0, l0] = hexToHsl(hex);
  const s = Math.min(s0, 88);
  let l = clamp(l0, 28, 100);
  let out = hslToHex(h, s, l);
  while (contrastWithWhite(out) < 3.4 && l > 20) { l -= 2; out = hslToHex(h, s, l); }
  return out;
}

const WHITE = [255, 255, 255];
const INK = [10, 12, 24]; // deep navy, matches the dark theme

/** Light-theme scale: 500 is the chosen colour; lighter steps blend with white, darker with ink. */
export function buildScale(hex) {
  const base = hexToRgb(normaliseBase(hex));
  const steps = {
    50: mix(WHITE, base, 0.07), 100: mix(WHITE, base, 0.14), 200: mix(WHITE, base, 0.28), 300: mix(WHITE, base, 0.48),
    400: mix(WHITE, base, 0.74), 500: base, 600: mix(base, INK, 0.14), 700: mix(base, INK, 0.3),
    800: mix(base, INK, 0.46), 900: mix(base, INK, 0.6), 950: mix(base, INK, 0.76),
  };
  return Object.fromEntries(Object.entries(steps).map(([k, v]) => [k, v.map(Math.round)]));
}

// Same mapping the presets use in dark mode: deep tints for backgrounds, light shades for text.
const DARK_MAP = { 50: '950', 100: '900', 200: '800', 300: '700', 400: '500', 500: '500', 600: '400', 700: '300', 800: '200', 900: '100', 950: '50' };

function vars(scale, dark) {
  return Object.keys(scale).map((k) => `--b-${k}: ${scale[dark ? DARK_MAP[k] : k].join(' ')};`).join('');
}

/** CSS rules for a custom accent, mirroring the preset rules in tailwind.config.js. */
export function customAccentCss(hex) {
  const scale = buildScale(hex);
  const light = vars(scale, false);
  const dark = vars(scale, true);
  // `html` raises specificity so these win over the default colours whatever order the styles load in.
  return `html[data-accent="custom"]{${light}}html.dark[data-accent="custom"]{${dark}}html.dark[data-accent="custom"] .theme-fixed{${light}}`;
}
