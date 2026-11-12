import { useMemo, useState } from 'react';
import { Download, Mail, Phone, Users } from 'lucide-react';
import { useAgency } from '../hooks/useAgency';
import { cn, downloadCsv } from '../lib/utils';
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, PageLoader, SearchInput, Select, Table, Td, Th } from '../components/ui';
import { LiveStatus, SheetPill, SubAccountDrawer } from '../components/agency';

const PAGE = 100;
const uniq = (list) => [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b));

/**
 * Clients = the people on your GoHighLevel sub-accounts (live from n8n),
 * not clients typed in by hand. Click anyone to open their sub-account.
 */
export default function Clients() {
  const agency = useAgency();
  const { rows, owners } = agency;
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [csm, setCsm] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState(null); // user key

  // One entry per user per sub-account.
  const people = useMemo(() => rows.flatMap((r) => r.users.map((u, i) => ({
    ...u,
    key: `${r.locationId}:${u.id || u.email || i}`,
    sub: r,
    search: [u.name, u.email, u.phone, r.name, r.csm, r.city, r.state].join(' ').toLowerCase(),
  }))).sort((a, b) => (a.name || '').localeCompare(b.name || '')), [rows]);

  const csms = useMemo(() => uniq(rows.map((r) => r.csm)), [rows]);

  const list = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return people.filter((p) => {
      if (status === 'active' && !p.sub.isActive) return false;
      if (status === 'inactive' && p.sub.isActive) return false;
      if (csm && p.sub.csm !== csm) return false;
      return words.every((w) => p.search.includes(w));
    });
  }, [people, search, status, csm]);

  const current = people.find((p) => p.key === selected);

  if (agency.status === 'idle' || agency.status === 'loading') return <PageLoader />;
  if (agency.status !== 'ready') {
    return (
      <>
        <PageHeader title="Clients" subtitle="Users of your GoHighLevel sub-accounts." actions={<LiveStatus agency={agency} />} />
        <Card><EmptyState icon={Users} title="GHL data isn't available" message={agency.error || 'Try Refresh in a moment.'} /></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${people.length.toLocaleString()} users across ${rows.length.toLocaleString()} GoHighLevel sub-accounts`}
        actions={(
          <>
            <LiveStatus agency={agency} />
            <Button variant="secondary" icon={Download} onClick={() => downloadCsv('ghl-users.csv', list.map((p) => ({
              name: p.name || '', email: p.email || '', phone: p.phone || '',
              subAccount: p.sub.name, locationId: p.sub.locationId, csm: p.sub.csm || '',
              city: p.sub.city || '', state: p.sub.state || '', status: p.sub.isActive ? 'Active' : 'Inactive',
            })))}>Export</Button>
          </>
        )}
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setShown(PAGE); }} placeholder="Search name, email, phone, sub-account, CSM…" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setShown(PAGE); }} className="w-auto">
            <option value="all">All sub-accounts</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
          <Select value={csm} onChange={(e) => { setCsm(e.target.value); setShown(PAGE); }} className="w-auto">
            <option value="">All CSMs</option>
            {csms.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <span className="ml-auto text-xs text-slate-500">{list.length.toLocaleString()} shown</span>
        </div>

        {list.length === 0 ? (
          <EmptyState icon={Users} title="No users found" message={people.length ? 'Try a different search or filter.' : 'Your GHL sub-accounts have no users yet.'} />
        ) : (
          <>
            <Table>
              <thead>
                <tr><Th>User</Th><Th>Phone</Th><Th>Sub-account</Th><Th>CSM</Th><Th>Status</Th><Th>Sheet</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.slice(0, shown).map((p) => (
                  <tr key={p.key} onClick={() => setSelected(p.key)}
                    className={cn('cursor-pointer hover:bg-slate-50', selected === p.key && 'bg-slate-50')}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={p.name || p.email} size="sm" />
                        <div className="min-w-0">
                          <p className="max-w-[240px] truncate font-medium text-slate-900">{p.name || '—'}</p>
                          <p className="flex max-w-[240px] items-center gap-1 truncate text-xs text-slate-500"><Mail className="h-3 w-3 shrink-0" />{p.email || '—'}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-slate-600">{p.phone ? <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{p.phone}</span> : '—'}</Td>
                    <Td>
                      <p className="max-w-[260px] truncate text-slate-800" title={p.sub.name}>{p.sub.name}</p>
                      <p className="text-xs text-slate-500">{[p.sub.city, p.sub.state].filter(Boolean).join(', ') || '—'}</p>
                    </Td>
                    <Td className="text-slate-600">{p.sub.csm || <span className="text-slate-400">—</span>}</Td>
                    <Td>{p.sub.isActive ? <Badge color="emerald" dot>Active</Badge> : <Badge color="red" dot>Inactive</Badge>}</Td>
                    <Td><SheetPill status={p.sub.sheetStatus} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {list.length > shown && (
              <div className="flex justify-center border-t border-slate-100 p-4">
                <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + PAGE)}>
                  Show more ({(list.length - shown).toLocaleString()} left)
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      <SubAccountDrawer row={current?.sub} owners={owners} onClose={() => setSelected(null)} />
    </>
  );
}
