import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Search, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { SheetPill } from './agency';

/**
 * Multi-select sibling of GhlPicker.jsx (that one is strictly single-value, so it can't be
 * reused directly here) — same search/matching logic, reimplemented rather than extracted so
 * GhlPicker itself stays untouched. Links several GHL sub-accounts (System B) to one CRM client.
 * `value` = array of locationIds, `onChange` receives the full new array.
 */
export function GhlMultiPicker({ rows, value = [], onChange, disabled }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef(null);
  const selected = value.map((id) => rows.find((r) => r.locationId === id)).filter(Boolean);

  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const matches = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = rows.filter((r) => !value.includes(r.locationId) && (!words.length || words.every((w) => r.search.includes(w))));
    return [...list].sort((a, b) => (b.isActive - a.isActive) || a.name.localeCompare(b.name)).slice(0, 40);
  }, [rows, q, value]);

  const add = (r) => { onChange([...value, r.locationId]); setOpen(false); setQ(''); };
  const remove = (id) => onChange(value.filter((v) => v !== id));

  return (
    <div ref={box} className="space-y-2">
      {selected.length > 0 && (
        <ul className="space-y-1.5">
          {selected.map((r) => (
            <li key={r.locationId} className="flex items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-2.5">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-slate-900">{r.name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  <SheetPill status={r.sheetStatus} />
                  {[r.city, r.state].filter(Boolean).join(', ')}
                </p>
              </div>
              <button type="button" disabled={disabled} onClick={() => remove(r.locationId)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Unlink">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          disabled={disabled}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => Math.min(i + 1, matches.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
            if (e.key === 'Enter' && matches[hi]) { e.preventDefault(); add(matches[hi]); }
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={selected.length ? 'Link another sub-account…' : `Search ${rows.length} sub-accounts by business, owner, CSM or city…`}
          className="block h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-[3px] focus:ring-brand-500/15"
        />
        {open && (
          <div className="scrollbar-thin absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-pop">
            {matches.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-500">No sub-account matches "{q}"</p>}
            {matches.map((r, i) => (
              <button
                type="button" key={r.locationId}
                onMouseEnter={() => setHi(i)} onClick={() => add(r)}
                className={cn('flex w-full items-center gap-3 px-3 py-2 text-left', i === hi ? 'bg-slate-100' : 'hover:bg-slate-50')}
              >
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', r.isActive ? 'bg-up' : 'bg-slate-300')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-slate-900">{r.name}</span>
                  <span className="block truncate text-[11.5px] text-slate-500">
                    {[[r.city, r.state].filter(Boolean).join(', '), r.csm && `CSM ${r.csm}`, `${r.zipCount} zips`].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
