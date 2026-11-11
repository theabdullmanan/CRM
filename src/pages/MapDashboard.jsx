import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import { useAgency } from '../hooks/useAgency';
import { sheetMeta } from '../lib/agency';
import { cn, num } from '../lib/utils';
import { Button, Card, EmptyState, PageHeader, PageLoader, SearchInput, Select, Tabs } from '../components/ui';
import { LiveStatus, SubAccountDrawer } from '../components/agency';

const CARTO_KEY = import.meta.env.VITE_CARTO_KEY;
const TILE_URL = `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png${CARTO_KEY ? `?key=${CARTO_KEY}` : ''}`;
const US_VIEW = [[39.5, -97.5], 4.5];
const ACTIVE = '#089981';
const INACTIVE = '#f23645';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default function MapDashboard() {
  const agency = useAgency();
  const { rows, owners } = agency;
  const [color, setColor] = useState('sheet');
  const [sheetSet, setSheetSet] = useState([]);
  const [csm, setCsm] = useState('');
  const [industry, setIndustry] = useState('');
  const [q, setQ] = useState('');
  const [full, setFull] = useState(false);
  const [openId, setOpenId] = useState(null);
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => (!sheetSet.length || sheetSet.includes(r.sheetStatus || '__none'))
      && (!csm || r.csm === csm) && (!industry || r.industryLabel === industry)
      && (!words.length || words.every((w) => r.search.includes(w))));
  }, [rows, sheetSet, csm, industry, q]);

  const opts = useMemo(() => ({
    csm: [...new Set(rows.map((r) => r.csm).filter(Boolean))].sort(),
    industry: [...new Set(rows.map((r) => r.industryLabel).filter(Boolean))].sort(),
    sheet: Object.entries(rows.reduce((m, r) => { const k = r.sheetStatus || '__none'; m[k] = (m[k] || 0) + 1; return m; }, {}))
      .sort((a, b) => (a[0] === '__none') - (b[0] === '__none') || b[1] - a[1]),
  }), [rows]);

  // Create the map once the container exists.
  useEffect(() => {
    if (agency.status !== 'ready' || !el.current || map.current) return undefined;
    map.current = L.map(el.current, { minZoom: 3, maxBounds: [[12, -180], [73, -55]], maxBoundsViscosity: 0.9, zoomSnap: 0.5 }).setView(...US_VIEW);
    L.tileLayer(TILE_URL, {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map.current);
    layer.current = L.featureGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, [agency.status]);

  // Draw pins: one per location; sub-accounts sharing a point are grouped into one popup.
  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();
    const groups = {};
    list.filter((r) => r.hasGeo).forEach((r) => { const k = `${r.lat.toFixed(4)},${r.lng.toFixed(4)}`; (groups[k] ||= []).push(r); });
    Object.values(groups).forEach((g) => {
      const fill = color === 'activity' ? (g[0].isActive ? ACTIVE : INACTIVE) : sheetMeta(g[0].sheetStatus).pin;
      const html = `<div class="crm-pop"><div class="crm-pop-zip">${esc(g[0].mapZip || '')}${g[0].mapPlace ? ` · ${esc(g[0].mapPlace)}` : ''}</div>${
        g.map((r) => `<div class="crm-pop-acct"><a href="#" data-loc="${esc(r.locationId)}">${esc(r.name)}</a>${
          (r.users.length ? r.users : [{}]).map((u) => (u.name || u.email
            ? `<div class="crm-pop-user"><b>${esc(u.name || '—')}</b>${u.email ? `<a href="mailto:${esc(u.email)}">${esc(u.email)}</a>` : ''}</div>`
            : '<div class="crm-pop-user muted">No user on this account</div>')).join('')
        }${r.industryLabel ? `<span class="crm-pop-tag">${esc(r.industryLabel)}</span>` : ''}</div>`).join('')
      }</div>`;
      L.circleMarker([g[0].lat, g[0].lng], { radius: g.length > 1 ? 8 : 6, color: '#fff', weight: 1.5, fillColor: fill, fillOpacity: 0.95 })
        .bindPopup(html, { maxWidth: 300 })
        .on('popupopen', (e) => {
          e.popup.getElement()?.querySelectorAll('[data-loc]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); setOpenId(a.dataset.loc); }));
        })
        .addTo(layer.current);
    });
  }, [list, color, agency.status]);

  useEffect(() => { const t = setTimeout(() => map.current?.invalidateSize(), 80); return () => clearTimeout(t); }, [full]);

  if (agency.status === 'idle' || agency.status === 'loading') return <PageLoader />;
  if (agency.status !== 'ready') {
    return <><PageHeader title="Map" /><Card><EmptyState icon={AlertTriangle} title="Live data isn't available" message={agency.error} /></Card></>;
  }

  const onMap = list.filter((r) => r.hasGeo).length;
  const legend = color === 'activity'
    ? [['Active', ACTIVE], ['Inactive', INACTIVE]]
    : opts.sheet.map(([k]) => [sheetMeta(k === '__none' ? '' : k).label, sheetMeta(k === '__none' ? '' : k).pin]);

  return (
    <>
      <PageHeader
        title="Users map"
        subtitle={`${num(onMap)} sub-accounts on the map${list.length - onMap ? ` · ${num(list.length - onMap)} without a zip location` : ''}. One pin per sub-account, at the first zip in its onboarding form.`}
        actions={<LiveStatus agency={agency} />}
      />
      <div className={cn(full && 'fixed inset-0 z-50 flex flex-col bg-[#f7f7f8] p-3')}>
        <Card className={cn('overflow-hidden', full && 'flex flex-1 flex-col')}>
          <div className="space-y-3 border-b border-slate-100 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Tabs size="sm" value={color} onChange={setColor} tabs={[{ value: 'sheet', label: 'Sheet status' }, { value: 'activity', label: 'Activity' }]} />
              <SearchInput value={q} onChange={setQ} placeholder="Search accounts, users, cities…" className="h-8 sm:w-64" />
              <Select value={csm} onChange={(e) => setCsm(e.target.value)} className="h-8 w-auto max-w-[170px] py-1"><option value="">All CSMs</option>{opts.csm.map((o) => <option key={o}>{o}</option>)}</Select>
              <Select value={industry} onChange={(e) => setIndustry(e.target.value)} className="h-8 w-auto max-w-[170px] py-1"><option value="">All industries</option>{opts.industry.map((o) => <option key={o}>{o}</option>)}</Select>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => { setSheetSet([]); setCsm(''); setIndustry(''); setQ(''); map.current?.setView(...US_VIEW); }}>Show all</Button>
                <Button size="sm" variant="secondary" icon={full ? Minimize2 : Maximize2} onClick={() => setFull((f) => !f)}>{full ? 'Exit full screen' : 'Full screen'}</Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {opts.sheet.map(([k, n]) => {
                const m = sheetMeta(k === '__none' ? '' : k);
                const on = sheetSet.includes(k);
                return (
                  <button key={k} onClick={() => setSheetSet((s) => (on ? s.filter((x) => x !== k) : [...s, k]))}
                    className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] transition-colors', on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300')}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.pin }} />{m.label}<span className={cn('font-mono', on ? 'text-white/70' : 'text-slate-400')}>{num(n)}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div ref={el} className={cn('relative z-0 w-full', full ? 'flex-1' : 'h-[calc(100vh-20rem)] min-h-[480px]')} />
          <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 px-4 py-2.5 text-[11.5px] text-slate-500">
            {legend.map(([l, c]) => <span key={l} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: c }} />{l}</span>)}
            <span className="ml-auto">Click a pin for users · click an account name for full details</span>
          </div>
        </Card>
      </div>
      <SubAccountDrawer row={rows.find((r) => r.locationId === openId)} owners={owners} onClose={() => setOpenId(null)} />
    </>
  );
}
