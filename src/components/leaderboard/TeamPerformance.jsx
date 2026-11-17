import { useMemo, useState } from 'react';
import { Crown, Medal, Search, UsersRound } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAgency } from '../../hooks/useAgency';
import { useUsers } from '../../hooks/useData';
import { clientLeads, senderKeys } from '../../hooks/useLeaderboard';
import { senderKeyOf } from '../../lib/leaderboard';
import { ROLES, ROLE_GROUPS } from '../../lib/constants';
import { Avatar, Badge, Card, CardHeader, EmptyState, Input, Select, Tabs } from '../ui';

/*
 * Team performance: leads per person for the selected range, from n8n's dashboard/latest.
 * "Sender" credits each client's leads to its `sender`; "Client Success Manager" to its `csm`.
 * Names are matched to CRM users (leaderboard GHL names first, then full name, then a unique
 * first name) so the list can be filtered by role. CRM users with no clients show with 0.
 */

const GROUP_BY = [
  { value: 'sender', label: 'Sender' },
  { value: 'csm', label: 'Client Success Manager' },
];
const NOT_IN_CRM = '__none__';
const UNASSIGNED_LABEL = { sender: 'No sender listed', csm: 'No CSM listed' };

// Gold / silver / bronze for the top three (only people with at least one lead get a medal).
const PODIUM = [
  { label: '1st', icon: Crown, chip: 'bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 shadow-[0_0_12px_rgba(245,158,11,.45)]', row: 'bg-gradient-to-r from-amber-400/15 via-amber-300/5 to-transparent border-l-4 border-l-amber-400', text: 'text-amber-600 dark:text-amber-400' },
  { label: '2nd', icon: Medal, chip: 'bg-gradient-to-b from-slate-200 to-slate-400 text-slate-900 shadow-[0_0_10px_rgba(148,163,184,.4)]', row: 'bg-gradient-to-r from-slate-300/20 via-slate-200/5 to-transparent border-l-4 border-l-slate-400', text: 'text-slate-500 dark:text-slate-300' },
  { label: '3rd', icon: Medal, chip: 'bg-gradient-to-b from-orange-300 to-orange-500 text-orange-950 shadow-[0_0_10px_rgba(249,115,22,.4)]', row: 'bg-gradient-to-r from-orange-400/15 via-orange-300/5 to-transparent border-l-4 border-l-orange-400', text: 'text-orange-600 dark:text-orange-400' },
];
const RANGE_TEXT = { today: 'today', week: 'this week', month: 'this month' };

export default function TeamPerformance({ range, senders = [], adjustments = [] }) {
  const agency = useAgency();
  const { data: users } = useUsers();
  const [groupBy, setGroupBy] = useState('sender');
  const [role, setRole] = useState('all');
  const [q, setQ] = useState('');

  const { people, unassigned, available, fallback } = useMemo(() => {
    // Name key -> CRM user.
    const byKey = new Map();
    const firstCount = new Map();
    users.forEach((u) => {
      const first = senderKeyOf(String(u.name || '').split(/\s+/)[0]);
      firstCount.set(first, (firstCount.get(first) || 0) + 1);
    });
    users.forEach((u) => {
      byKey.set(senderKeyOf(u.name), u);
      const first = senderKeyOf(String(u.name || '').split(/\s+/)[0]);
      if (firstCount.get(first) === 1 && !byKey.has(first)) byKey.set(first, u);
    });
    const userById = new Map(users.map((u) => [u.id, u]));
    senders.forEach((s) => {
      const u = userById.get(s.userId || s.id);
      if (u) senderKeys(s).forEach((k) => byKey.set(k, u));
    });

    // Leads per person from the client rows. Clients with no sender/CSM listed are kept
    // separate (not part of the ranked list — see `unassignedRow` below), so they reconcile
    // the total with the "Leads sent" card above without ever shifting anyone's real rank.
    const map = new Map();
    const unassignedRow = { clients: 0, leads: 0 };
    let anyNumber = false;
    let usedFallback = false;
    (agency.rows || []).forEach((r) => {
      const raw = String(r[groupBy] || '').trim();
      const { n, fallback: fb } = clientLeads(r, range);
      if (n !== null) anyNumber = true;
      if (fb) usedFallback = true;
      if (!raw) { unassignedRow.clients += 1; unassignedRow.leads += n || 0; return; }
      const user = byKey.get(senderKeyOf(raw));
      const id = user ? `u:${user.id}` : `n:${senderKeyOf(raw)}`;
      const p = map.get(id) || { id, name: user?.name || raw, aliases: new Set(), user, clients: 0, leads: 0 };
      p.aliases.add(raw);
      p.clients += 1;
      p.leads += n || 0;
      map.set(id, p);
    });

    // Admin corrections from Leaderboard → Settings apply to a specific linked sender, so
    // they're only meaningful for the Sender grouping (a correction isn't tied to a CSM).
    let adjAvailable = false;
    if (groupBy === 'sender') {
      const adjBySenderId = new Map();
      adjustments.forEach((a) => {
        if (!a.senderId) return;
        adjBySenderId.set(a.senderId, (adjBySenderId.get(a.senderId) || 0) + (Number(a.delta) || 0));
      });
      adjBySenderId.forEach((delta, uid) => {
        adjAvailable = true;
        const id = `u:${uid}`;
        const p = map.get(id) || { id, name: userById.get(uid)?.name || 'Unknown sender', aliases: new Set(), user: userById.get(uid), clients: 0, leads: 0 };
        p.leads += delta;
        map.set(id, p);
      });
    }
    map.forEach((p) => { p.leads = Math.max(0, p.leads); });

    // Everyone else in the CRM shows too (with 0), so a role filter lists the whole team.
    users.filter((u) => u.active && u.role !== 'pending' && u.role !== 'display').forEach((u) => {
      if (!map.has(`u:${u.id}`)) map.set(`u:${u.id}`, { id: `u:${u.id}`, name: u.name, aliases: new Set(), user: u, clients: 0, leads: 0 });
    });

    const list = [...map.values()]
      .sort((a, b) => b.leads - a.leads || b.clients - a.clients || String(a.name).localeCompare(String(b.name)));
    return {
      people: list,
      unassigned: unassignedRow.clients > 0 ? { ...unassignedRow, label: UNASSIGNED_LABEL[groupBy] } : null,
      available: anyNumber || adjAvailable,
      fallback: usedFallback,
    };
  }, [agency.rows, users, senders, adjustments, groupBy, range]);

  const shown = people.filter((p) => {
    if (role === NOT_IN_CRM ? p.user : role !== 'all' && p.user?.role !== role) return false;
    const s = q.trim().toLowerCase();
    return !s || [p.name, ...p.aliases, p.user?.email].join(' ').toLowerCase().includes(s);
  });
  // The reconciliation row only applies to the unfiltered view — once a role or search
  // narrows the list, "Total" should reflect just what's shown, not the whole company.
  const showUnassigned = unassigned && role === 'all' && !q.trim();
  const total = shown.reduce((s, p) => s + p.leads, 0) + (showUnassigned ? unassigned.leads : 0);
  const clients = shown.reduce((s, p) => s + p.clients, 0) + (showUnassigned ? unassigned.clients : 0);
  const loading = agency.status === 'idle' || agency.status === 'loading';

  return (
    <Card>
      <CardHeader
        title="Team performance"
        subtitle={`Leads ${RANGE_TEXT[range]}${fallback && range === 'week' ? ' (last 7 days)' : ''}, by ${groupBy === 'csm' ? 'the client success manager of each client' : 'the sender of each client'}. Total matches the "Leads sent" card above${groupBy === 'csm' ? ' minus manual corrections, which apply to senders only' : ''}.`}
        actions={<Tabs size="sm" tabs={GROUP_BY} value={groupBy} onChange={setGroupBy} />}
      />

      <div className="grid gap-3 border-b border-slate-100 px-5 py-4 sm:grid-cols-[14rem_1fr]">
        <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role">
          <option value="all">All roles</option>
          {ROLE_GROUPS.map(([group, roles]) => (
            <optgroup key={group} label={group}>
              {roles.map((r) => <option key={r} value={r}>{ROLES[r]?.label || r}</option>)}
            </optgroup>
          ))}
          <option value={NOT_IN_CRM}>Not in CRM</option>
        </Select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a person…" className="pl-9" />
        </div>
      </div>

      {loading ? (
        <p className="px-5 py-8 text-center text-[13px] text-slate-500">Loading team data…</p>
      ) : !available ? (
        <EmptyState icon={UsersRound} title="No lead numbers for this period yet"
          message={`n8n hasn't saved lead counts for ${RANGE_TEXT[range]}. They appear here as soon as it does.`} />
      ) : shown.length === 0 ? (
        <EmptyState icon={UsersRound} title="Nobody matches this filter" message="Try another role or clear the search." />
      ) : (
        <div className="divide-y divide-slate-100">
          <div className="grid grid-cols-[2.5rem_1fr_4rem_4.5rem] items-center gap-3 bg-slate-50/80 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500 sm:grid-cols-[2.5rem_1fr_9rem_5rem_5rem]">
            <span>#</span><span>Person</span><span className="hidden sm:block">Role</span>
            <span className="text-right">Clients</span><span className="text-right">Leads</span>
          </div>
          {shown.map((p, i) => {
            const medal = i < 3 && p.leads > 0 ? PODIUM[i] : null;
            const MedalIcon = medal?.icon;
            return (
            <div key={p.id} className={cn('grid grid-cols-[2.5rem_1fr_4rem_4.5rem] items-center gap-3 px-5 sm:grid-cols-[2.5rem_1fr_9rem_5rem_5rem]', medal ? cn('py-3.5', medal.row) : 'py-3')}>
              {medal ? (
                <span className={cn('flex h-9 w-9 flex-col items-center justify-center rounded-full', medal.chip)} title={`${medal.label} place`}>
                  <MedalIcon className="h-4 w-4" strokeWidth={2.4} />
                  <span className="-mt-0.5 text-[9px] font-extrabold leading-none">{medal.label}</span>
                </span>
              ) : (
                <span className="pl-2 text-sm font-bold tabular-nums text-slate-500">{i + 1}</span>
              )}
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={p.name} userId={p.user?.id} size={medal ? 'md' : 'sm'} />
                <div className="min-w-0">
                  <p className={cn('truncate text-slate-900', medal ? 'text-[15px] font-extrabold' : 'text-[13.5px] font-semibold')}>
                    {p.name}
                    {medal && <span className={cn('ml-2 text-[11px] font-bold uppercase tracking-wider', medal.text)}>{medal.label} place</span>}
                  </p>
                  {p.user && [...p.aliases].some((a) => a !== p.name) && (
                    <p className="truncate text-xs text-slate-500">as “{[...p.aliases].join('”, “')}”</p>
                  )}
                </div>
              </div>
              <span className="hidden sm:block">
                {p.user ? <Badge color={ROLES[p.user.role]?.color || 'slate'}>{ROLES[p.user.role]?.label || p.user.role}</Badge> : <Badge>Not in CRM</Badge>}
              </span>
              <span className="text-right text-sm tabular-nums text-slate-600">{p.clients}</span>
              <span className={cn('text-right font-display font-extrabold tabular-nums', medal ? cn('text-2xl', medal.text) : 'text-lg text-slate-900')}>{p.leads}</span>
            </div>
            );
          })}
          {showUnassigned && (
            <div className="grid grid-cols-[2.5rem_1fr_4rem_4.5rem] items-center gap-3 px-5 py-3 text-slate-500 sm:grid-cols-[2.5rem_1fr_9rem_5rem_5rem]">
              <span />
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400"><UsersRound className="h-4 w-4" /></span>
                <p className="truncate text-[13.5px] font-medium italic">{unassigned.label}</p>
              </div>
              <span className="hidden sm:block"><Badge color="rose">Unassigned</Badge></span>
              <span className="text-right text-sm tabular-nums">{unassigned.clients}</span>
              <span className="text-right font-display text-lg font-bold tabular-nums">{unassigned.leads}</span>
            </div>
          )}
          <div className="grid grid-cols-[2.5rem_1fr_4rem_4.5rem] items-center gap-3 bg-slate-50/80 px-5 py-3 text-[13px] font-semibold text-slate-700 sm:grid-cols-[2.5rem_1fr_9rem_5rem_5rem]">
            <span /><span>Total ({shown.length} {shown.length === 1 ? 'person' : 'people'}{showUnassigned ? ' + unassigned' : ''})</span><span className="hidden sm:block" />
            <span className="text-right tabular-nums">{clients}</span>
            <span className="text-right font-display text-lg font-extrabold tabular-nums text-slate-900">{total}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
