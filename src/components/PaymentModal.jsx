import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { Button, Field, Input, Modal, Select } from './ui';
import { PAYMENT_TYPES } from '../lib/constants';
import { friendlyError } from '../lib/utils';
import { addPayment } from '../services/paymentService';
import { useAuth } from '../contexts/AuthContext';
import { useSubAccounts } from '../hooks/useData';

export default function PaymentModal({ open, onClose, clients, defaultClientId }) {
  const { profile, settings } = useAuth();
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const { data: subs } = useSubAccounts(form.clientId || null);

  useEffect(() => {
    if (open) {
      const c = clients.find((x) => x.id === defaultClientId);
      setForm({
        clientId: defaultClientId || '',
        subAccountId: '',
        amount: c?.dailyRate || '',
        date: format(new Date(), 'yyyy-MM-dd'),
        type: 'daily',
        note: '',
      });
    }
  }, [open, defaultClientId, clients]);

  const set = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === 'type' && v === 'setup_fee') next.amount = settings.setupFee;
      if (k === 'clientId') {
        next.subAccountId = '';
        const c = clients.find((x) => x.id === v);
        if (f.type === 'daily' && c?.dailyRate) next.amount = c.dailyRate;
      }
      return next;
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    const client = clients.find((c) => c.id === form.clientId);
    if (!client) return toast.error('Choose a client');
    setBusy(true);
    try {
      await addPayment({
        client,
        subAccount: subs.find((s) => s.id === form.subAccountId),
        amount: form.amount,
        date: new Date(`${form.date}T12:00:00`),
        type: form.type,
        note: form.note,
      }, profile);
      toast.success('Payment recorded');
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
      title="Record payment"
      subtitle="Daily spend counts toward revenue. Setup fees are stored but excluded from every spend figure."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="pay-form" type="submit" loading={busy}>Save payment</Button></>}
    >
      <form id="pay-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Client" className="sm:col-span-2">
          <Select required value={form.clientId || ''} onChange={set('clientId')}>
            <option value="">Select a client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Sub-account (optional)" className="sm:col-span-2">
          <Select value={form.subAccountId || ''} onChange={set('subAccountId')} disabled={!subs.length}>
            <option value="">Whole client</option>
            {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={form.type || 'daily'} onChange={set('type')}>
            {Object.entries(PAYMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>
        <Field label="Amount (USD)" hint={form.type === 'adjustment' ? 'Use a negative number for refunds.' : undefined}>
          <Input type="number" step="0.01" required value={form.amount ?? ''} onChange={set('amount')} />
        </Field>
        <Field label="Date"><Input type="date" required value={form.date || ''} onChange={set('date')} /></Field>
        <Field label="Note"><Input value={form.note || ''} onChange={set('note')} /></Field>
      </form>
    </Modal>
  );
}
