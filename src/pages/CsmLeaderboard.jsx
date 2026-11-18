import { useState } from 'react';
import toast from 'react-hot-toast';
import { RefreshCw, Trophy } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useClients, useActiveUsers } from '../hooks/useData';
import { useCsmLeaderboard } from '../hooks/useCsmLeaderboard';
import { CSM_DEPARTMENT, isCsmDepartment } from '../lib/csmClients';
import { recalculateCsmDailyTotal } from '../services/csmDailyTotals';
import { centralClock } from '../lib/businessDay';
import { useMinuteTick } from '../hooks/useBusinessDayWindow';
import { friendlyError, money } from '../lib/utils';
import { Avatar, Button, Card, EmptyState, PageHeader, PageLoader } from '../components/ui';

// Same gold / silver / bronze palette as the Senders Leaderboard's podium (components/leaderboard/Board.jsx),
// reused here for visual consistency — that component itself isn't imported or touched.
const MEDALS = [
  { place: '1st', ring: 'ring-amber-400/70', chip: 'bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950', row: 'bg-amber-50/70' },
  { place: '2nd', ring: 'ring-slate-300/70', chip: 'bg-gradient-to-b from-slate-200 to-slate-400 text-slate-900', row: 'bg-slate-50' },
  { place: '3rd', ring: 'ring-orange-400/60', chip: 'bg-gradient-to-b from-orange-300 to-orange-500 text-orange-950', row: 'bg-orange-50/60' },
];

function Medal({ rank }) {
  const m = MEDALS[rank - 1];
  if (!m) return <span className="flex h-8 w-8 items-center justify-center text-sm font-semibold text-slate-400">#{rank}</span>;
  return (
    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ring-2 ${m.ring} ${m.chip}`}>
      {rank}
    </span>
  );
}

export default function CsmLeaderboard() {
  const { isAdmin } = useAuth();
  const { data: clients, loading: clientsLoading } = useClients();
  const { data: users, loading: usersLoading } = useActiveUsers();
  const csmUsers = users.filter(isCsmDepartment);
  const lb = useCsmLeaderboard(csmUsers);
  const now = useMinuteTick();
  const [recalculating, setRecalculating] = useState(false);

  const recalc = async () => {
    setRecalculating(true);
    try {
      await recalculateCsmDailyTotal(lb.dayKey, clients);
      toast.success('Recalculated from today’s payments');
    } catch (e) { toast.error(friendlyError(e)); } finally { setRecalculating(false); }
  };

  if (clientsLoading || usersLoading) return <PageLoader />;

  const total = lb.rows.reduce((s, r) => s + r.total, 0);

  return (
    <>
      <PageHeader
        icon={Trophy}
        title="CSM Leaderboard"
        subtitle={`Today's collections per CSM · resets at midnight Central time · as of ${centralClock(new Date(now))} CT`}
        actions={isAdmin && (
          <Button variant="secondary" icon={RefreshCw} loading={recalculating} onClick={recalc}>
            Recalculate today
          </Button>
        )}
      />

      {lb.status === 'error' ? (
        <Card className="p-6 text-[13px] text-down-700">
          The leaderboard couldn't load. If this was just set up, the new Firestore rules may not be published yet.
        </Card>
      ) : csmUsers.length === 0 ? (
        <EmptyState icon={Trophy} title="No one in the CSM department yet" message={`Set a user's department to "${CSM_DEPARTMENT}" in Users & roles to put them on this board.`} />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <p className="eyebrow">Collected today · all CSMs</p>
            <span className="font-mono text-[15px] font-semibold tabular-nums text-slate-900">{money(total)}</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {lb.rows.map((r, i) => {
              const rank = i + 1;
              const medal = MEDALS[rank - 1];
              return (
                <li key={r.id} className={`flex items-center gap-4 px-5 py-3.5 ${medal ? medal.row : ''}`}>
                  <Medal rank={rank} />
                  <Avatar name={r.name} userId={r.id} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-slate-900">{r.name}</span>
                  <span className={`font-mono text-[14px] font-semibold tabular-nums ${r.total > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                    {money(r.total)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
