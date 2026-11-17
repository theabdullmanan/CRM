import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link2, Minus, Plus, RotateCcw, Save, SlidersHorizontal, UserMinus, UserPlus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useUsers } from '../../hooks/useData';
import { fmtDateTime, friendlyError } from '../../lib/utils';
import { SENDING_DEPARTMENT } from '../../lib/leaderboard';
import {
  addAdjustment, addSender, linkUnmatchedName, saveLeaderboardSettings, setSenderActive, updateSender,
} from '../../services/leaderboardService';
import { Badge, Button, Card, CardHeader, Field, Input, Select } from '../ui';

// Square +/- buttons for the adjustment amount (plain buttons so their size stays exact).
const stepBtn = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-[0_1px_2px_rgba(16,24,40,.05)] transition-colors hover:bg-slate-50 hover:border-slate-300 active:translate-y-px';

const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));
const isSunday = (key) => new Date(`${key}T12:00:00Z`).getUTCDay() === 0;

function Section({ title, subtitle, children }) {
  return (
    <div className="space-y-3 border-t border-slate-100 px-5 py-5 first:border-t-0">
      <div>
        <p className="text-[13.5px] font-semibold text-slate-900">{title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/** Admin / manager settings for the leaderboard. Rendered only for them; rules enforce it too. */
export default function SettingsPanel({ lb }) {
  const { profile } = useAuth();
  const { data: users } = useUsers();
  const [busy, setBusy] = useState('');
  const run = async (key, fn, ok) => {
    setBusy(key);
    try { await fn(); if (ok) toast.success(ok); } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(''); }
  };

  // ---- defaults
  const [defaults, setDefaults] = useState({ defaultTarget: lb.settings.defaultTarget, idleMinutes: lb.settings.idleMinutes });
  useEffect(() => setDefaults({ defaultTarget: lb.settings.defaultTarget, idleMinutes: lb.settings.idleMinutes }), [lb.settings.defaultTarget, lb.settings.idleMinutes]);
  const defaultsValid = Number(defaults.defaultTarget) >= 1 && Number(defaults.idleMinutes) >= 5;

  // ---- senders
  const active = lb.senders.filter((s) => s.active !== false).sort(byName);
  const hidden = lb.senders.filter((s) => s.active === false).sort(byName);
  const senderIds = new Set(lb.senders.map((s) => s.id));
  const candidates = useMemo(() => users
    .filter((u) => u.active && !senderIds.has(u.id))
    .sort((a, b) => Number(b.department === SENDING_DEPARTMENT) - Number(a.department === SENDING_DEPARTMENT) || byName(a, b)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [users, lb.senders]);
  const [newSender, setNewSender] = useState({ userId: '', matchName: '' });

  // ---- unmatched
  const [links, setLinks] = useState({});

  // ---- adjustments
  const [adj, setAdj] = useState({ senderId: '', delta: '', reason: '', day: lb.win.todayKey });
  useEffect(() => setAdj((a) => ({ ...a, day: lb.win.todayKey })), [lb.win.todayKey]);
  const delta = Number(adj.delta);
  const adjError = !adj.senderId ? 'Pick a sender'
    : !Number.isInteger(delta) || delta === 0 ? 'Enter a whole number, e.g. 2 or -1'
      : adj.reason.trim().length < 3 ? 'Add a reason'
        : !adj.day || adj.day > lb.win.todayKey ? 'Pick a business day up to today'
          : isSunday(adj.day) ? "Sunday isn't a business day (Sunday leads count for Saturday)" : '';

  return (
    <Card className="mb-6">
      <CardHeader title="Leaderboard settings" subtitle="Admins and managers only. Senders can only view the board." />

      <Section title="Targets & alerts" subtitle="The daily target applies to everyone without their own target. Week and month targets scale with business days.">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Default daily target (leads)"><Input type="number" min={1} value={defaults.defaultTarget} onChange={(e) => setDefaults({ ...defaults, defaultTarget: e.target.value })} /></Field>
          <Field label="Gone quiet after (minutes)" hint="Amber after this, red after twice this."><Input type="number" min={5} value={defaults.idleMinutes} onChange={(e) => setDefaults({ ...defaults, idleMinutes: e.target.value })} /></Field>
          <Button icon={Save} disabled={!defaultsValid} loading={busy === 'defaults'} onClick={() => run('defaults', () => saveLeaderboardSettings(defaults, profile), 'Settings saved')}>Save</Button>
        </div>
      </Section>

      <Section title={`Senders on the board (${active.length})`} subtitle="The GHL name must match the sender name n8n sends (case and spaces don't matter). Leave the target empty to use the default.">
        {active.length > 0 && (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {active.map((s) => (
              <div key={s.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium text-slate-900">{s.name}</p>
                  {s.aliases?.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{s.aliases.map((a) => <Badge key={a}>{a}</Badge>)}</div>}
                </div>
                <Input defaultValue={s.matchName || ''} placeholder="Name in GHL" aria-label="Name in GHL"
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.matchName) run(`m-${s.id}`, () => updateSender(s, { matchName: v }, profile), 'GHL name saved'); }} />
                <Input type="number" min={1} defaultValue={s.target ?? ''} placeholder={`${lb.settings.defaultTarget} (default)`} aria-label="Daily target"
                  onBlur={(e) => {
                    const v = e.target.value === '' ? null : Number(e.target.value);
                    if (v !== (s.target ?? null) && (v === null || v >= 1)) run(`t-${s.id}`, () => updateSender(s, { target: v }, profile), 'Target saved');
                  }} />
                <Button size="sm" variant="ghost" icon={UserMinus} loading={busy === `r-${s.id}`}
                  onClick={() => run(`r-${s.id}`, () => setSenderActive(s, false, profile), `${s.name} hidden from the board`)}>Remove</Button>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Add a sender">
            <Select value={newSender.userId} onChange={(e) => { const u = users.find((x) => x.id === e.target.value); setNewSender({ userId: e.target.value, matchName: u?.name || '' }); }}>
              <option value="">Choose a CRM user…</option>
              {candidates.map((u) => <option key={u.id} value={u.id}>{u.name}{u.department ? ` · ${u.department}` : ''}</option>)}
            </Select>
          </Field>
          <Field label="Their name in GHL"><Input value={newSender.matchName} onChange={(e) => setNewSender({ ...newSender, matchName: e.target.value })} placeholder="Exactly as n8n sends it" /></Field>
          <Button icon={UserPlus} disabled={!newSender.userId || !newSender.matchName.trim()} loading={busy === 'add'}
            onClick={() => run('add', async () => { await addSender(users.find((u) => u.id === newSender.userId), newSender.matchName, profile); setNewSender({ userId: '', matchName: '' }); }, 'Sender added')}>Add</Button>
        </div>
        {hidden.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Hidden (history kept):</span>
            {hidden.map((s) => (
              <Button key={s.id} size="xs" variant="subtle" icon={RotateCcw} loading={busy === `r-${s.id}`}
                onClick={() => run(`r-${s.id}`, () => setSenderActive(s, true, profile), `${s.name} is back on the board`)}>{s.name}</Button>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Unmatched senders (${lb.unmatched.length})`} subtitle="Names n8n sent that don't match anyone yet. Their leads are kept. Link them to a CRM user to count them.">
        {lb.unmatched.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-4 py-4 text-center text-[13px] text-slate-500">Every sender name in this period is linked.</p>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {lb.unmatched.map((u) => (
              <div key={u.key} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                <div>
                  <p className="text-[13.5px] font-medium text-slate-900">{u.name || u.key}</p>
                  <p className="text-xs text-slate-500">{u.count} lead{u.count === 1 ? '' : 's'} in this period</p>
                </div>
                <Select value={links[u.key] || ''} onChange={(e) => setLinks({ ...links, [u.key]: e.target.value })}>
                  <option value="">Link to…</option>
                  <optgroup label="Senders on the board">{lb.senders.map((s) => <option key={s.id} value={`s:${s.id}`}>{s.name}</option>)}</optgroup>
                  <optgroup label="Other CRM users">{candidates.map((x) => <option key={x.id} value={`u:${x.id}`}>{x.name}</option>)}</optgroup>
                </Select>
                <Button size="sm" icon={Link2} disabled={!links[u.key]} loading={busy === `l-${u.key}`}
                  onClick={() => run(`l-${u.key}`, () => {
                    const [kind, id] = links[u.key].split(':');
                    const sender = kind === 's' ? lb.senders.find((s) => s.id === id) : null;
                    const user = sender ? { id: sender.id, name: sender.name } : users.find((x) => x.id === id);
                    return linkUnmatchedName(u.name || u.key, user, sender, profile);
                  }, 'Linked')}>Link</Button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Adjust a count" subtitle="For corrections only. Every adjustment is logged with who made it and why, and can't be edited or deleted.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_10rem_10rem_1.4fr_auto] lg:items-end">
          <Field label="Sender">
            <Select value={adj.senderId} onChange={(e) => setAdj({ ...adj, senderId: e.target.value })}>
              <option value="">Choose…</option>
              {active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Change">
            <div className="flex items-center gap-1.5">
              <button type="button" aria-label="Decrease" className={stepBtn}
                onClick={(e) => { e.preventDefault(); setAdj((a) => ({ ...a, delta: String((Number(a.delta) || 0) - 1) })); }}><Minus className="h-4 w-4" /></button>
              <Input type="number" step={1} inputMode="numeric" value={adj.delta} onChange={(e) => setAdj({ ...adj, delta: e.target.value })}
                className="h-9 min-w-[3.5rem] flex-1 px-1 py-0 text-center font-semibold tabular-nums" placeholder="0" aria-label="Change amount" />
              <button type="button" aria-label="Increase" className={stepBtn}
                onClick={(e) => { e.preventDefault(); setAdj((a) => ({ ...a, delta: String((Number(a.delta) || 0) + 1) })); }}><Plus className="h-4 w-4" /></button>
            </div>
          </Field>
          <Field label="Business day"><Input type="date" value={adj.day} max={lb.win.todayKey} onChange={(e) => setAdj({ ...adj, day: e.target.value })} /></Field>
          <Field label="Reason"><Input value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} placeholder="e.g. Lead sent from a second GHL account" /></Field>
          <Button icon={SlidersHorizontal} disabled={Boolean(adjError)} loading={busy === 'adj'} title={adjError}
            onClick={() => run('adj', async () => {
              await addAdjustment({ sender: active.find((s) => s.id === adj.senderId), delta, reason: adj.reason, day: adj.day }, profile);
              setAdj({ senderId: '', delta: '', reason: '', day: lb.win.todayKey });
            }, 'Adjustment saved')}>Apply</Button>
        </div>
        {adjError && (adj.senderId || adj.delta || adj.reason) && <p className="text-xs text-slate-500">{adjError}</p>}
        {lb.adjustments.length > 0 && (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {lb.adjustments.slice(0, 15).map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]">
                <Badge color={a.delta > 0 ? 'emerald' : 'red'}>{a.delta > 0 ? `+${a.delta}` : a.delta}</Badge>
                <span className="font-medium text-slate-900">{a.senderName}</span>
                <span className="text-slate-500">{a.day}</span>
                <span className="min-w-0 flex-1 truncate text-slate-600">“{a.reason}”</span>
                <span className="text-xs text-slate-400">{a.createdByName} · {fmtDateTime(a.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </Card>
  );
}
