import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Check, Search, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { SheetPill } from './agency';

/**
 * Searchable picker over the live GoHighLevel sub-accounts (n8n data).
 * `rows` = agency rows, `value` = selected locationId.
 */
export function GhlPicker({ rows, value, onChange, disabled }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef(null);
  const selected = rows.find((r) => r.locationId === value);

  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const matches = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = words.length ? rows.filter((r) => words.every((w) => r.search.includes(w))) : rows;
    return [...list].sort((a, b) => (b.isActive - a.isActive) || a.name.localeCompare(b.name)).slice(0, 40);
  }, [rows, q]);

  const pick = (r) => { onChange(r.locationId); setOpen(false); setQ(''); };

  if (selected) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-2.5">
        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium text-slate-900">{selected.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <SheetPill status={selected.sheetStatus} />
            {[selected.city, selected.state].filter(Boolean).join(', ')}
            {selected.csm && <span>· CSM {selected.csm}</span>}
            <span>· {selected.zipCount} zips in use</span>
          </p>
        </div>
        <button type="button" disabled={disabled} onClick={() => onChange('')} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Change"><X className="h-4 w-4" /></button>
      </div>
    );
  }

  return (
    <div ref={box} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={q}
        disabled={disabled}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => Math.min(i + 1, matches.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
          if (e.key === 'Enter' && matches[hi]) { e.preventDefault(); pick(matches[hi]); }
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={`Search ${rows.length} sub-accounts by business, owner, CSM or city…`}
        className="block h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-[3px] focus:ring-brand-500/15"
      />
      {open && (
        <div className="scrollbar-thin absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-pop">
          {matches.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-500">No sub-account matches “{q}”</p>}
          {matches.map((r, i) => (
            <button
              type="button" key={r.locationId}
              onMouseEnter={() => setHi(i)} onClick={() => pick(r)}
              className={cn('flex w-full items-center gap-3 px-3 py-2 text-left', i === hi ? 'bg-slate-100' : 'hover:bg-slate-50')}
            >
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', r.isActive ? 'bg-up' : 'bg-slate-300')} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-slate-900">{r.name}</span>
                <span className="block truncate text-[11.5px] text-slate-500">
                  {[[r.city, r.state].filter(Boolean).join(', '), r.csm && `CSM ${r.csm}`, `${r.zipCount} zips`].filter(Boolean).join(' · ')}
                </span>
              </span>
              {value === r.locationId && <Check className="h-4 w-4 text-slate-900" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
