import { useCallback, useEffect, useState } from 'react';

// Light / dark theme. The choice is remembered per browser; the first visit follows
// the device setting. index.html applies it before React loads, so there's no flash.
const KEY = 'theme';

function initialTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* storage blocked */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function useTheme() {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => { applyTheme(theme); }, [theme]);

  const set = useCallback((next) => {
    try { localStorage.setItem(KEY, next); } catch { /* storage blocked */ }
    setTheme(next);
  }, []);

  return { theme, setTheme: set, toggle: () => set(theme === 'dark' ? 'light' : 'dark') };
}
