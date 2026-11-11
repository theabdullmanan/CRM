import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { Bell, CheckCheck } from 'lucide-react';
import { db } from '../lib/firebase';
import { useNotifications } from '../hooks/useData';
import { Button, Card, EmptyState, PageHeader, PageLoader } from '../components/ui';
import { NotificationItem, markAllRead } from '../components/layout/NotificationBell';

export default function Notifications() {
  const { data, loading } = useNotifications(200);
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={`${data.filter((n) => !n.read).length} unread`}
        actions={<Button variant="secondary" icon={CheckCheck} onClick={() => markAllRead(data)}>Mark all read</Button>}
      />
      <Card>
        {loading ? <PageLoader /> : data.length === 0 ? <EmptyState icon={Bell} title="No notifications" /> : (
          <div className="divide-y divide-slate-100">
            {data.map((n) => (
              <NotificationItem key={n.id} n={n} onClick={() => {
                if (!n.read && db) updateDoc(doc(db, 'notifications', n.id), { read: true });
                if (n.link) navigate(n.link);
              }} />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
