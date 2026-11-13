import { useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { Crown, Trash2, UserCheck, UserX, ShieldCheck, Users, UserPlus } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useDepartments, useUsers } from '../hooks/useData';
import { ASSIGNABLE_ROLES, ROLES, isAdminRole, roleGroupsFor } from '../lib/constants';
import { fmtDate, friendlyError } from '../lib/utils';
import { notifyUsers, logActivity } from '../services/notifications';
import { deleteUserAccount } from '../services/userService';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, PageHeader, PageLoader, SearchInput, Select, Table, Td, Th, useConfirm } from '../components/ui';

function PendingRow({ u, departments, onDelete }) {
  const { profile, isSuperAdmin } = useAuth();
  const [role, setRole] = useState('csm');
  const [dept, setDept] = useState('');
  const [busy, setBusy] = useState(false);
  const approve = async () => {
    setBusy(true);
    try {
      await updateDoc(doc(db, 'users', u.id), { role, department: dept, active: true, approvedBy: profile.name, approvedAt: serverTimestamp() });
      await notifyUsers([u.id], { title: 'Your CRM access is ready', body: `Role: ${ROLES[role].label}${dept ? ` · ${dept}` : ''}`, link: '/', type: 'success' });
      logActivity(profile, 'user.approve', { name: u.name, role });
      toast.success(`${u.name} approved`);
    } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-4">
      <Avatar name={u.name} userId={u.id} />
      <div className="min-w-[180px] flex-1">
        <p className="font-medium text-slate-900">{u.name}</p>
        <p className="text-xs text-slate-500">{u.email} · signed up {fmtDate(u.createdAt)}</p>
      </div>
      <Select value={role} onChange={(e) => setRole(e.target.value)} className="sm:w-44">
        {(isSuperAdmin ? ['superadmin', ...ASSIGNABLE_ROLES] : ASSIGNABLE_ROLES).map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}
      </Select>
      <Select value={dept} onChange={(e) => setDept(e.target.value)} className="sm:w-52">
        <option value="">No department</option>
        {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
      </Select>
      <Button icon={UserCheck} loading={busy} onClick={approve}>Approve</Button>
      <Button variant="ghost" icon={Trash2} onClick={() => onDelete(u)} title="Delete this sign-up">Delete</Button>
    </div>
  );
}

export default function Team() {
  const { profile, isSuperAdmin } = useAuth();
  const { data: users, loading } = useUsers();
  const { data: departments } = useDepartments();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const pending = users.filter((u) => u.role === 'pending' && !u.active);
  const members = users.filter((u) => !(u.role === 'pending' && !u.active))
    .filter((u) => !search || [u.name, u.email, u.department, u.role].some((v) => v?.toLowerCase().includes(search.toLowerCase())));
  const adminCount = users.filter((u) => isAdminRole(u.role) && u.active).length;

  const update = async (u, patch) => {
    if (u.id === profile.id && (patch.role && patch.role !== 'admin' || patch.active === false) && adminCount <= 1) {
      return toast.error('You are the only admin. Promote someone else first.');
    }
    try {
      await updateDoc(doc(db, 'users', u.id), patch);
      toast.success('Saved');
    } catch (e) { toast.error(friendlyError(e)); }
  };

  const remove = async (u) => {
    const ok = await confirm({
      title: `Delete ${u.name}'s account?`,
      message: `${u.name} (${u.email}) loses all access to the CRM immediately and is removed from the team list. This can't be undone. Their tasks and records stay, still showing their name.`,
      confirmLabel: 'Delete account',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteUserAccount(u, profile);
      toast.success(`${u.name}'s account was deleted`);
    } catch (e) { toast.error(friendlyError(e)); }
  };

  return (
    <>
      <PageHeader title="Users & roles" subtitle="Add people, set each person's role (what they can access) and department, and approve self sign-ups." actions={<><SearchInput value={search} onChange={setSearch} placeholder="Search people…" /><Link to="/team/add"><Button icon={UserPlus}>Add user</Button></Link></>} />

      {pending.length > 0 && (
        <Card className="mb-6 border-amber-200">
          <CardHeader title={`Waiting for approval (${pending.length})`} subtitle="New accounts can't see anything until you approve them." />
          <div className="divide-y divide-slate-100">{pending.map((u) => <PendingRow key={u.id} u={u} departments={departments} onDelete={remove} />)}</div>
        </Card>
      )}

      <Card>
        <CardHeader title="Team members" subtitle={`${members.length} people`} />
        {loading ? <PageLoader /> : members.length === 0 ? <EmptyState icon={Users} title="No team members" /> : (
          <Table>
            <thead><tr><Th>Person</Th><Th>Role</Th><Th>Department</Th><Th>Status</Th><Th>Joined</Th><Th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((u) => (
                <tr key={u.id} className={u.active ? '' : 'opacity-60'}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} userId={u.id} size="sm" />
                      <div>
                        <p className="font-medium text-slate-900">{u.name} {u.id === profile.id && <span className="text-xs text-slate-400">(you)</span>}</p>
                        <p className="text-xs text-slate-500">{u.email}{u.jobTitle ? ` · ${u.jobTitle}` : ''}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    {u.role === 'superadmin' ? (
                      <span title="Super admins are managed from the Super Admin dashboard"><Badge color={ROLES.superadmin.color}><Crown className="h-3 w-3" />{ROLES.superadmin.label}</Badge></span>
                    ) : (
                      <Select value={u.role} onChange={(e) => update(u, { role: e.target.value })} className="h-8 w-44 py-1">
                        {roleGroupsFor(isSuperAdmin).map(([g, roles]) => <optgroup key={g} label={g}>{roles.map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}</optgroup>)}
                      </Select>
                    )}
                  </Td>
                  <Td>
                    <Select value={u.department || ''} onChange={(e) => update(u, { department: e.target.value })} className="h-8 w-44 py-1">
                      <option value="">—</option>
                      {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                      {u.department && !departments.some((d) => d.name === u.department) && <option value={u.department}>{u.department}</option>}
                    </Select>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {u.active ? <Badge color="emerald">Active</Badge> : <Badge>Disabled</Badge>}
                      {u.active && u.mustChangePassword && <Badge color="amber" className="whitespace-nowrap">Temp password</Badge>}
                    </div>
                  </Td>
                  <Td className="text-slate-500">{fmtDate(u.createdAt)}</Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {u.role === 'superadmin'
                        ? (isSuperAdmin && <Link to="/super-admin" className="text-xs font-medium text-slate-500 hover:text-slate-900">Manage</Link>)
                        : u.active
                        ? <Button size="xs" variant="ghost" icon={UserX} onClick={() => update(u, { active: false })}>Disable</Button>
                        : <Button size="xs" variant="subtle" icon={UserCheck} onClick={() => update(u, { active: true })}>Enable</Button>}
                      {u.id !== profile.id && u.role !== 'superadmin' && (
                        <button type="button" title="Delete account" onClick={() => remove(u)} className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="What each role can do" />
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {ASSIGNABLE_ROLES.map((r) => (
            <div key={r} className="rounded-lg border border-slate-200 p-3">
              <Badge color={ROLES[r].color}><ShieldCheck className="h-3 w-3" />{ROLES[r].label}</Badge>
              <p className="mt-2 text-sm text-slate-600">{ROLES[r].description}</p>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
