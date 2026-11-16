import { useEffect, useState } from 'react';
import { leaderboardWindows } from '../lib/businessDay';

/**
 * Today / This Week / This Month windows in Central time.
 * Recomputes by itself the moment the next business day starts (Mon–Fri 8 AM, Sat 9 AM),
 * which changes the start keys and makes every listener re-subscribe. No refresh needed (TV screens).
 */
export function useBusinessDayWindow() {
  const [win, setWin] = useState(() => leaderboardWindows());

  useEffect(() => {
    const end = win.today.end.getTime();
    const check = () => { if (Date.now() >= end) setWin(leaderboardWindows()); };
    // Exact timer for the reset, plus a 30 s safety check: timers drift or pause on sleeping screens.
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

/** Current time, updated on every minute boundary (refreshes "12 min ago" labels without a reload). */
export function useMinuteTick() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer;
    const tick = () => {
      setNow(Date.now());
      timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
    };
    timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
    return () => clearTimeout(timer);
  }, []);
  return now;
}
