import { useState } from 'react';
import { Monitor, Settings2, Target, Trophy, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useMinuteTick } from '../hooks/useBusinessDayWindow';
import { centralClock } from '../lib/businessDay';
import { canManageLeaderboard, RANGES } from '../lib/leaderboard';
import { Podium, RankList } from '../components/leaderboard/Board';
import SettingsPanel from '../components/leaderboard/SettingsPanel';
import { Button, Card, EmptyState, PageHeader, PageLoader, StatCard, Tabs } from '../components/ui';

const fmtStart = (d) => d.toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const EMPTY_TEXT = { today: 'No leads sent yet today', week: 'No leads sent yet this week', month: 'No leads sent yet this month' };

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
        subtitle="Leads each sender has sent to clients, live. All times in Central time."
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
        <StatCard label="Leads sent" value={lb.loading ? 0 : lb.total} icon={Trophy} tone="brand" sub={range === 'today' ? `as of ${centralClock(new Date(now))} CT` : `${span.days} business days`} />
        <StatCard label="Hit their target" value={lb.loading ? 0 : hit} icon={Target} tone="emerald" sub={`of ${rows.length} sender${rows.length === 1 ? '' : 's'}`} />
        <StatCard label="Senders on the board" value={lb.loading ? 0 : rows.length} icon={Users} tone="violet"
          sub={manager && lb.unmatched.length ? `${lb.unmatched.length} unmatched name${lb.unmatched.length === 1 ? '' : 's'} in Settings` : 'Ranked by leads sent'} />
      </div>

      <p className="mb-4 text-xs text-slate-500">{rangeText}</p>

      {lb.error && (
        <Card className="mb-4 p-4 text-[13px] text-down-700">
          The leaderboard couldn't load ({lb.error.code || 'error'}). If it was just set up, the new Firestore rules may not be published yet.
        </Card>
      )}

      {lb.loading ? <PageLoader /> : rows.length === 0 ? (
        <Card>
          <EmptyState icon={Trophy} title="No senders on the leaderboard yet"
            message={manager ? 'Open Settings to add senders and link their GHL names.' : 'An admin will add senders soon.'} />
        </Card>
      ) : (
        <div className="space-y-5">
          {lb.total === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-center text-[13px] text-slate-500">{EMPTY_TEXT[range]}</div>
          )}
          <Podium rows={rows} now={now} idleMinutes={settings.idleMinutes} span={span} range={range} />
          <RankList rows={rows} now={now} idleMinutes={settings.idleMinutes} span={span} range={range} />
        </div>
      )}
    </>
  );
}
