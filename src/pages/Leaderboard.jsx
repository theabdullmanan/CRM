import { useState } from 'react';
import { Monitor, Settings2, Target, Trophy, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useMinuteTick } from '../hooks/useBusinessDayWindow';
import { centralClock } from '../lib/businessDay';
import { canManageLeaderboard, LEAD_TAG, RANGES } from '../lib/leaderboard';
import SettingsPanel from '../components/leaderboard/SettingsPanel';
import TeamPerformance from '../components/leaderboard/TeamPerformance';
import { Button, Card, PageHeader, StatCard, Tabs } from '../components/ui';

const fmtStart = (d) => d.toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function Leaderboard() {
  const { role } = useAuth();
  const manager = canManageLeaderboard(role);
  const [range, setRange] = useState('today');
  const [showSettings, setShowSettings] = useState(false);
  const lb = useLeaderboard(range);
  const now = useMinuteTick();
  const { rows, span, settings } = lb;

  const hit = rows.filter((r) => r.hit).length;
  const rangeText = range === 'today'
    ? `Business day since ${fmtStart(span.start)} CT · resets ${fmtStart(span.end)} CT`
    : `Since ${fmtStart(span.start)} CT · ${span.days} business day${span.days === 1 ? '' : 's'} · target ${settings.defaultTarget} × ${span.days}`;

  return (
    <>
      <PageHeader
        icon={Trophy}
        title="Leaderboard"
        subtitle={`Leads tagged "${LEAD_TAG}" that each sender has sent to clients, live. All times in Central time.`}
        actions={(
          <>
            <Tabs tabs={RANGES} value={range} onChange={setRange} />
            <Button variant="secondary" icon={Monitor} onClick={() => window.open('/leaderboard/tv', '_blank', 'noopener')}>TV mode</Button>
            {manager && <Button variant={showSettings ? 'primary' : 'secondary'} icon={Settings2} onClick={() => setShowSettings((v) => !v)}>Settings</Button>}
          </>
        )}
      />

      {manager && showSettings && <SettingsPanel lb={lb} />}

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Leads sent" value={lb.loading ? 0 : (lb.overall ?? '—')} icon={Trophy} tone="brand"
          sub={lb.overall === null && !lb.loading
            ? `No ${range === 'today' ? "today's" : range === 'week' ? 'weekly' : 'monthly'} lead numbers from n8n yet`
            : `All "${LEAD_TAG}" leads · ${range === 'today' ? `as of ${centralClock(new Date(now))} CT` : range === 'week' && lb.fallback ? 'last 7 days' : `${span.days} business days`}`} />
        <StatCard label="Hit their target" value={lb.loading ? 0 : hit} icon={Target} tone="emerald" sub={`of ${rows.length} sender${rows.length === 1 ? '' : 's'}`} />
        <StatCard label="Senders on the board" value={lb.loading ? 0 : rows.length} icon={Users} tone="violet"
          sub={lb.unmatched.length ? `${lb.unmatched.length} shown without a Settings link` : 'Ranked by leads sent'} />
      </div>

      <p className="mb-4 text-xs text-slate-500">
        {rangeText}
        {lb.source === 'dashboard' && (
          <> · Counts from n8n's agency data{lb.dataUpdatedAt ? `, updated ${new Date(lb.dataUpdatedAt).toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })} CT` : ''}, credited to each client's sender
            {lb.fallback && range === 'week' && ' (last 7 days, from the status sheet)'}
            {lb.fallback && range === 'today' && ' (from the status sheet)'}
            {range === 'month' && !lb.available && ' (GHL monthly counts not available yet)'}</>
        )}
      </p>

      {lb.error && (
        <Card className="mb-4 p-4 text-[13px] text-down-700">
          The leaderboard couldn't load ({lb.error.code || 'error'}). If it was just set up, the new Firestore rules may not be published yet.
        </Card>
      )}

      {/* The ranked list lives in one place only — Team performance below — so it's never
          shown twice with potentially different numbers. The podium view is still on the
          dedicated TV page (/leaderboard/tv) for the wall display. */}
      <TeamPerformance range={range} senders={lb.senders || []} adjustments={lb.adjustments || []} />
    </>
  );
}
