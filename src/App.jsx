import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/layout/Layout';
import { PageLoader } from './components/ui';
import { canViewCsmFeatures } from './lib/csmClients';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import PendingApproval from './pages/auth/PendingApproval';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Clients = lazy(() => import('./pages/Clients'));
const ClientDetail = lazy(() => import('./pages/ClientDetail'));
const ZipSubmit = lazy(() => import('./pages/ZipSubmit'));
const ZipQueue = lazy(() => import('./pages/ZipQueue'));
const Revenue = lazy(() => import('./pages/Revenue'));
const MapDashboard = lazy(() => import('./pages/MapDashboard'));
const SubAccounts = lazy(() => import('./pages/SubAccounts')); 
const ZipLookup = lazy(() => import('./pages/ZipLookup'));
const AddUser = lazy(() => import('./pages/AddUser'));
const Account = lazy(() => import('./pages/Account'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Team = lazy(() => import('./pages/Team'));
const Settings = lazy(() => import('./pages/Settings'));
const Notifications = lazy(() => import('./pages/Notifications'));
const SuperAdmin = lazy(() => import('./pages/SuperAdmin'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const LeaderboardTv = lazy(() => import('./pages/LeaderboardTv'));
const CsmLeaderboard = lazy(() => import('./pages/CsmLeaderboard'));
const MyClients = lazy(() => import('./pages/MyClients'));

function FullScreenLoader() {
  return <div className="flex min-h-screen items-center justify-center"><PageLoader /></div>;
}

function RequireAuth({ children }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile?.active || profile.role === 'pending') return <PendingApproval />;
  return children;
}

// `check` is for access rules that don't fit the role-based `can(area)` map — e.g. the CSM
// features, which gate on department rather than role. Existing callers (area only) are
// unaffected; `check` just gives Guard a second way to decide.
function Guard({ area, check, children }) {
  const auth = useAuth();
  const ok = check ? check(auth) : auth.can(area);
  return ok ? children : <Navigate to="/" replace />;
}

function PublicOnly({ children }) {
  const { user, loading, preview } = useAuth();
  if (preview) return children; // let the login/register screens be viewed in preview mode
  if (loading) return <FullScreenLoader />;
  return user ? <Navigate to="/" replace /> : children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      {/* TV screen: outside RequireAuth so the disabled "display" account can reach it; the page checks access itself */}
      <Route path="/leaderboard/tv" element={<Suspense fallback={<FullScreenLoader />}><LeaderboardTv /></Suspense>} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route
          path="*"
          element={
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route index element={<Dashboard />} />
                <Route path="clients" element={<Guard area="clients"><Clients /></Guard>} />
                <Route path="clients/:id" element={<Guard area="clients"><ClientDetail /></Guard>} />
                <Route path="sub-accounts" element={<Guard area="agency"><SubAccounts /></Guard>} />
                <Route path="zip-lookup" element={<Guard area="agency"><ZipLookup /></Guard>} />
                <Route path="zip-codes" element={<Guard area="zipSubmit"><ZipSubmit /></Guard>} />
                <Route path="zip-queue" element={<Guard area="zipQueue"><ZipQueue /></Guard>} />
                <Route path="revenue" element={<Guard area="revenue"><Revenue /></Guard>} />
                <Route path="map" element={<Guard area="map"><MapDashboard /></Guard>} />
                <Route path="tasks" element={<Guard area="tasks"><Tasks /></Guard>} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="team" element={<Guard area="team"><Team /></Guard>} />
                <Route path="team/add" element={<Guard area="team"><AddUser /></Guard>} />
                <Route path="account" element={<Account />} />
                <Route path="settings" element={<Guard area="settings"><Settings /></Guard>} />
                <Route path="super-admin" element={<Guard area="superAdmin"><SuperAdmin /></Guard>} />
                <Route path="leaderboard" element={<Guard area="leaderboard"><Leaderboard /></Guard>} />
                <Route path="csm-leaderboard" element={<Guard check={({ profile }) => canViewCsmFeatures(profile)}><CsmLeaderboard /></Guard>} />
                <Route path="my-clients" element={<Guard check={({ profile }) => canViewCsmFeatures(profile)}><MyClients /></Guard>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
