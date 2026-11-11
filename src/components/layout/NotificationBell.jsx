import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { Bell, CheckCheck, AlertTriangle, CheckCircle2, Database, MapPin, ListTodo, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { db } from '../../lib/firebase';
import { useNotifications } from '../../hooks/useData';
import { cn, fromNow, toDate } from '../../lib/utils';

export const NOTIF_ICON = {
  warning: [AlertTriangle, 'text-amber-500 bg-amber-50'],
  overdue: [AlertTriangle, 'text-down-600 bg-down-50'],
  success: [CheckCircle2, 'text-up-600 bg-up-50'],
  data: [Database, 'text-sky-500 bg-sky-50'],
  zip: [MapPin, 'text-slate-700 bg-slate-100'],
  task: [ListTodo, 'text-violet-500 bg-violet-50'],
  info: [Info, 'text-slate-500 bg-slate-100'],
};

export async function markAllRead(items) {
  const unread = items.filter((n) => !n.read);
  if (!unread.length || !db) return;
  const batch = writeBatch(db);
  unread.forEach((n) => batch.update(doc(db, 'notifications', n.id), { read: true }));
  await batch.commit();
}

export function NotificationItem({ n, onClick }) {
  const [Icon, tone] = NOTIF_ICON[n.type] || NOTIF_ICON.info;
  return (
    <button onClick={onClick} className={cn('group flex w-full gap-3 px-4 py-3 text-left transition-colors duration-200 hover:bg-slate-50', !n.read && 'bg-slate-50/80')}>
      <div className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md', tone)}><Icon className="h-3.5 w-3.5" strokeWidth={2} /></div>
      <div className="min-w-0 flex-1">
        <p className={cn('text-[13px]', n.read ? 'text-slate-700' : 'font-semibold text-slate-900')}>{n.title}</p>
        {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{n.body}</p>}
        <p className="mt-1 text-[11px] text-slate-400">{fromNow(n.createdAt)}</p>
      </div>
      {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
    </button>
  );
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data } = useNotifications(30);
  const navigate = useNavigate();
  const ref = useRef(null);
  const seen = useRef(null);
  const unread = data.filter((n) => !n.read).length;

  // Toast new notifications that arrive while the app is open.
  useEffect(() => {
    if (!data.length) return;
    if (seen.current) {
      data
        .filter((n) => !n.read && !seen.current.has(n.id) && toDate(n.createdAt) > new Date(Date.now() - 60_000))
        .slice(0, 3)
        .forEach((n) => toast(n.title, { icon: '🔔' }));
    }
    seen.current = new Set(data.map((n) => n.id));
  }, [data]);

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.read && db) updateDoc(doc(db, 'notifications', n.id), { read: true }).catch(() => {});
    if (n.link) navigate(n.link);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800" aria-label="Notifications">
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-down px-1 font-mono text-[9.5px] font-semibold text-white ring-2 ring-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
          className="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] origin-top-right overflow-hidden rounded-xl bg-white shadow-pop"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-[13px] font-semibold text-slate-900">Notifications</p>
            <button onClick={() => markAllRead(data)} className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </div>
          <div className="scrollbar-thin max-h-[26rem] divide-y divide-slate-100 overflow-y-auto">
            {data.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">You're all caught up.</p>
            ) : (
              data.map((n) => <NotificationItem key={n.id} n={n} onClick={() => openItem(n)} />)
            )}
          </div>
          <button onClick={() => { setOpen(false); navigate('/notifications'); }} className="block w-full border-t border-slate-100 py-2.5 text-center text-sm font-medium text-slate-600 hover:bg-slate-50">
            View all
          </button>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
