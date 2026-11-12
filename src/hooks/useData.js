// Shared, named subscriptions used across pages.
import { collection, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { previewDb as P } from '../lib/preview';
import { useCollection } from './useFirestore';
import { useAuth } from '../contexts/AuthContext';

const byName = (a, b) => (a.name || '').localeCompare(b.name || '');

/** Applies a { field, op, value } filter to preview rows. */
const matches = (row, f) => {
  if (!f) return true;
  if (f.op === 'in') return f.value.includes(row[f.field]);
  return row[f.field] === f.value;
};

export function useUsers() {
  const { profile } = useAuth();
  const res = useCollection(() => (profile?.active ? collection(db, 'users') : null), [profile?.active], () => P.users);
  return { ...res, data: [...res.data].sort(byName) };
}

export function useActiveUsers() {
  const res = useUsers();
  return { ...res, data: res.data.filter((u) => u.active && u.role !== 'pending') };
}

export function useDepartments() {
  const res = useCollection(() => collection(db, 'departments'), [], () => P.departments);
  return { ...res, data: [...res.data].sort(byName) };
}

export function useClients() {
  const res = useCollection(() => collection(db, 'clients'), [], () => P.clients);
  return { ...res, data: [...res.data].sort(byName) };
}

export function useSubAccounts(clientId) {
  const res = useCollection(
    () => (clientId ? query(collection(db, 'subAccounts'), where('clientId', '==', clientId)) : collection(db, 'subAccounts')),
    [clientId],
    () => P.subAccounts.filter((s) => !clientId || s.clientId === clientId),
  );
  return { ...res, data: [...res.data].sort(byName) };
}

export function usePayments(clientId) {
  const { can } = useAuth();
  const allowed = can('revenue');
  return useCollection(() => {
    if (!allowed) return null;
    const base = collection(db, 'payments');
    return clientId ? query(base, where('clientId', '==', clientId)) : query(base, orderBy('date', 'desc'));
  }, [clientId, allowed], () => (allowed ? P.payments.filter((p) => !clientId || p.clientId === clientId) : []));
}

export function useZipSubmissions(filter) {
  // filter: { field, op, value }; undefined = all submissions; null = don't subscribe
  const key = filter ? `${filter.field}${filter.op}${JSON.stringify(filter.value)}` : String(filter);
  const res = useCollection(() => {
    if (filter === null) return null;
    const base = collection(db, 'zipSubmissions');
    return filter ? query(base, where(filter.field, filter.op, filter.value)) : base;
  }, [key], () => (filter === null ? [] : P.zipSubmissions.filter((z) => matches(z, filter))));
  const sorted = [...res.data].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  return { ...res, data: sorted };
}

export function useDataRequests() {
  const res = useCollection(() => collection(db, 'dataRequests'), [], () => P.dataRequests);
  const sorted = [...res.data].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  return { ...res, data: sorted };
}

export function useTasks(scope) {
  // scope: 'all' | 'mine' | 'created'
  const { user } = useAuth();
  const res = useCollection(() => {
    if (!user || !scope) return null;
    const base = collection(db, 'tasks');
    if (scope === 'mine') return query(base, where('assigneeId', '==', user.uid));
    if (scope === 'created') return query(base, where('createdBy', '==', user.uid));
    return base;
  }, [scope, user?.uid], () => {
    if (!scope) return [];
    if (scope === 'mine') return P.tasks.filter((t) => t.assigneeId === user?.uid);
    if (scope === 'created') return P.tasks.filter((t) => t.createdBy === user?.uid);
    return P.tasks;
  });
  return res;
}

export function useNotifications(max = 50) {
  const { user } = useAuth();
  // Filter only by userId and sort here, so this query never depends on a composite index
  // being deployed (a missing index made notifications flash and then disappear).
  const res = useCollection(
    () => (user ? query(collection(db, 'notifications'), where('userId', '==', user.uid)) : null),
    [user?.uid],
    () => P.notifications,
  );
  const sorted = [...res.data]
    .sort((a, b) => (b.createdAt?.seconds ?? 9e15) - (a.createdAt?.seconds ?? 9e15))
    .slice(0, max);
  return { ...res, data: sorted };
}

/**
 * Zip-workflow tasks (shared "pool" tasks) relevant to the signed-in user, live.
 * Admins see every run; everyone else sees tasks shared with them plus runs they started.
 */
export function useWorkflowTasks() {
  const { user, isAdmin, can } = useAuth();
  const enabled = Boolean(user) && can('workflow');
  const mine = useCollection(() => {
    if (!enabled) return null;
    const base = collection(db, 'tasks');
    return isAdmin ? query(base, where('kind', '==', 'zip_workflow')) : query(base, where('assigneeIds', 'array-contains', user.uid));
  }, [enabled, isAdmin, user?.uid], () => (enabled ? P.tasks.filter((t) => t.kind === 'zip_workflow' && (isAdmin || t.assigneeIds?.includes(user?.uid))) : []));
  const started = useCollection(
    () => (enabled && !isAdmin ? query(collection(db, 'tasks'), where('requestedBy', '==', user.uid)) : null),
    [enabled, isAdmin, user?.uid],
    () => (enabled && !isAdmin ? P.tasks.filter((t) => t.kind === 'zip_workflow' && t.requestedBy === user?.uid) : []),
  );
  const byId = new Map();
  [...mine.data, ...started.data].forEach((t) => byId.set(t.id, t));
  return { data: [...byId.values()], loading: mine.loading || started.loading };
}
