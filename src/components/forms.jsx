import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';
import { CLIENT_STATUS } from '../lib/constants';
import { friendlyError } from '../lib/utils';
import { saveClient, saveSubAccount } from '../services/clientService';
import { useAuth } from '../contexts/AuthContext';
import { useActiveUsers } from '../hooks/useData';

export function ClientFormModal({ open, onClose, client, onSaved }) {
  const { profile, settings } = useAuth();
  const { data: users } = useActiveUsers();
  const csms = users.filter((u) => ['csm', 'manager', 'admin', 'superadmin'].includes(u.role));
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(client || {
        name: '', contactName: '', email: '', phone: '', status: 'onboarding',
        dailyRate: '', csmId: profile.role === 'csm' ? profile.id : '', setupFeePaid: false, notes: '',
      });
    }
  }, [open, client, profile]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const rate = Number(form.dailyRate) || 0;
    if (rate && (rate < settings.dailyMin || rate > settings.dailyMax)) {
      toast(`Heads up: daily rate is outside the usual $${settings.dailyMin}–$${settings.dailyMax} range.`, { icon: '⚠️' });
    }
    setBusy(true);
    try {
      const csm = csms.find((u) => u.id === form.csmId);
      const id = await saveClient({ ...form, csmName: csm?.name || '' }, profile, client?.id);
      toast.success(client ? 'Client updated' : 'Client created');
      onSaved?.(id);
      onClose();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={client ? 'Edit client' : 'New client'}
      size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="client-form" type="submit" loading={busy}>Save client</Button></>}
    >
      <form id="client-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name" className="sm:col-span-2"><Input required value={form.name || ''} onChange={set('name')} /></Field>
        <Field label="Primary contact"><Input value={form.contactName || ''} onChange={set('contactName')} /></Field>
        <Field label="Email"><Input type="email" value={form.email || ''} onChange={set('email')} /></Field>
        <Field label="Phone"><Input value={form.phone || ''} onChange={set('phone')} /></Field>
        <Field label="Status">
          <Select value={form.status || 'active'} onChange={set('status')}>
            {Object.entries(CLIENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>
        <Field label="Daily rate (USD)" hint={`Typical range $${settings.dailyMin}–$${settings.dailyMax}. Used for auto daily charges.`}>
          <Input type="number" min="0" step="1" value={form.dailyRate ?? ''} onChange={set('dailyRate')} />
        </Field>
        <Field label="Account manager (CSM)">
          <Select value={form.csmId || ''} onChange={set('csmId')}>
            <option value="">Unassigned</option>
            {csms.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={Boolean(form.setupFeePaid)} onChange={set('setupFeePaid')} />
          ${settings.setupFee} setup fee paid <span className="text-slate-400">(tracked here only — never counted as spend)</span>
        </label>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={form.notes || ''} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  );
}

export function SubAccountFormModal({ open, onClose, client, subAccount }) {
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setForm(subAccount || { name: '', accountRef: '', market: '', status: 'active', notes: '' });
  }, [open, subAccount]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await saveSubAccount(form, client, subAccount?.id);
      toast.success(subAccount ? 'Sub-account updated' : 'Sub-account added');
      onClose();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={subAccount ? 'Edit sub-account' : 'Add sub-account'}
      subtitle={`Each sub-account keeps its own zip codes — no more shared sheet rows. Client: ${client?.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="sub-form" type="submit" loading={busy}>Save</Button></>}
    >
      <form id="sub-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Sub-account name" className="sm:col-span-2"><Input required value={form.name || ''} onChange={set('name')} placeholder="e.g. Phoenix East" /></Field>
        <Field label="Account ID / reference"><Input value={form.accountRef || ''} onChange={set('accountRef')} /></Field>
        <Field label="Market / region"><Input value={form.market || ''} onChange={set('market')} /></Field>
        <Field label="Status">
          <Select value={form.status || 'active'} onChange={set('status')}>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="closed">Closed</option>
          </Select>
        </Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={form.notes || ''} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  );
}
