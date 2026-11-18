import { useEffect, useState } from 'react';
import { centralMidnightWindow } from '../lib/centralMidnight';

/**
 * Today's Central midnight-to-midnight window. Recomputes itself the instant the next Central
 * midnight arrives, so the CSM Leaderboard rolls over to a new day with no refresh needed.
 * Same self-resetting pattern as useBusinessDayWindow — exact timer plus a 30s safety poll,
 * since timers drift or pause on sleeping screens.
 */
export function useCentralMidnightReset() {
  const [win, setWin] = useState(() => centralMidnightWindow());

  useEffect(() => {
    const end = win.end.getTime();
    const check = () => { if (Date.now() >= end) setWin(centralMidnightWindow()); };
    const timer = setTimeout(check, Math.min(Math.max(end - Date.now() + 500, 1000), 2 ** 31 - 1));
    const poll = setInterval(check, 30000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', check);
    };
  }, [win]);

  return win;
}
