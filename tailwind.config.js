/** @type {import('tailwindcss').Config} */

// Neutral graphite scale. It replaces Tailwind's blue-tinted slate everywhere,
// so the whole UI reads as one quiet, premium palette.
const graphite = {
  50: '#fafafa', 100: '#f4f4f5', 200: '#e6e6e9', 300: '#d4d4d8', 400: '#a1a1aa',
  500: '#71717a', 600: '#52525b', 700: '#3f3f46', 800: '#27272a', 900: '#18181b', 950: '#0b0b0d',
};

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        slate: graphite,
        // One restrained accent, used for links, focus and selection only.
        brand: {
          50: '#eff4ff', 100: '#dce7fe', 200: '#c0d4fd', 300: '#94b6fb', 400: '#6290f7',
          500: '#3d6ef2', 600: '#2856e0', 700: '#2045c2', 800: '#1f3b9c', 900: '#1e357b',
        },
        // Market colours: gains / losses.
        up: { DEFAULT: '#089981', 50: '#e8f6f3', 100: '#c9ebe4', 600: '#07856f', 700: '#066b5a' },
        down: { DEFAULT: '#f23645', 50: '#feeef0', 100: '#fcd5d9', 600: '#d92b3a', 700: '#b3202d' },
      },
      boxShadow: {
        card: '0 1px 0 rgba(12,12,14,.03)',
        lift: '0 8px 24px -12px rgba(12,12,14,.18)',
        pop: '0 16px 48px -12px rgba(12,12,14,.28), 0 0 0 1px rgba(12,12,14,.06)',
      },
      letterSpacing: { tightest: '-0.03em' },
    },
  },
  plugins: [],
};
