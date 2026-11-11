import { Clock, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button, Card } from '../../components/ui';

export default function PendingApproval() {
  const { profile, user, logout } = useAuth();
  const disabled = profile && profile.role !== 'pending' && !profile.active;
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
          <Clock className="h-6 w-6 text-amber-500" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">{disabled ? 'Account disabled' : 'Waiting for approval'}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {disabled
            ? 'Your account has been deactivated. Contact an administrator if you think this is a mistake.'
            : <>Signed in as <b>{profile?.email || user?.email}</b>. An admin needs to assign your role and department. This page updates automatically once you're approved.</>}
        </p>
        <Button variant="secondary" icon={LogOut} className="mt-6" onClick={logout}>Sign out</Button>
      </Card>
    </div>
  );
}
