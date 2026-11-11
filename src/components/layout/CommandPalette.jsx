import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, CornerDownLeft, Building2, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useClients } from '../../hooks/useData';
import { cn } from '../../lib/utils';

export default function CommandPalette({ open, onClose, nav }) {
  const { can } = useAuth();
  const { data: clients } = useClients();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) { setQ(''); setIndex(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    const pages = nav
      .filter((n) => n.to && can(n.area) && (!s || n.label.toLowerCase().includes(s)))
      .map((n) => ({ key: n.to, label: n.label, hint: 'Page', icon: n.icon, to: n.to }));
    const cl = can('clients')
      ? clients
        .filter((c) => s && [c.name, c.contactName].some((v) => v?.toLowerCase().includes(s)))
        .slice(0, 6)
        .map((c) => ({ key: c.id, label: c.name, hint: c.contactName || 'Client', icon: Building2, to: `/clients/${c.id}` }))
      : [];
    return [...pages, ...cl];
  }, [q, nav, clients, can]);

  const go = (item) => { if (!item) return; navigate(item.to); onClose(); };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, items.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') go(items[index]);
    if (e.key === 'Escape') onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]">
          <motion.div className="absolute inset-0 bg-slate-950/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="relative w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-pop"
            initial={{ opacity: 0, scale: 0.985, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.99, y: -4 }}
            transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <div className="flex items-center gap-3 border-b border-slate-100 px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => { setQ(e.target.value); setIndex(0); }}
                onKeyDown={onKey}
                placeholder="Jump to a page or search clients…"
                className="h-12 flex-1 bg-transparent text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">ESC</kbd>
            </div>
            <div className="scrollbar-thin max-h-[360px] overflow-y-auto p-2">
              {items.length === 0 && <p className="px-3 py-10 text-center text-sm text-slate-500">No results for “{q}”</p>}
              {items.map((it, i) => (
                <button
                  key={it.key}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => go(it)}
                  className={cn('relative flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-[13px]', i === index ? 'text-slate-900' : 'text-slate-600')}
                >
                  {i === index && <motion.span layoutId="cmd-active" className="absolute inset-0 rounded-md bg-slate-100" transition={{ duration: 0.12 }} />}
                  <span className="relative flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500">
                    <it.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </span>
                  <span className="relative flex-1 truncate font-medium">{it.label}</span>
                  <span className="relative text-xs text-slate-400">{it.hint}</span>
                  {i === index && <ArrowRight className="relative h-4 w-4" />}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-4 border-t border-slate-100 bg-slate-50/70 px-4 py-2 text-[11px] text-slate-500">
              <span className="flex items-center gap-1"><kbd className="rounded border border-slate-200 bg-white px-1">↑</kbd><kbd className="rounded border border-slate-200 bg-white px-1">↓</kbd> navigate</span>
              <span className="flex items-center gap-1"><CornerDownLeft className="h-3 w-3" /> open</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
