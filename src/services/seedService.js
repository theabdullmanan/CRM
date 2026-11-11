// Demo data so the CRM can be explored before real data is entered. Admin only.
import { collection, doc, serverTimestamp, Timestamp, writeBatch, setDoc } from 'firebase/firestore';
import { addDays, subDays } from 'date-fns';
import { db } from '../lib/firebase';
import { dayKey } from '../lib/spend';

const CLIENTS = [
  ['Summit Roofing Co.', 'Dana Price', 350, 'active', ['Denver Metro', 'Boulder']],
  ['BrightPath Solar', 'Marcus Lee', 400, 'active', ['Phoenix East', 'Phoenix West', 'Tucson']],
  ['Evergreen HVAC', 'Priya Shah', 180, 'active', ['Portland']],
  ['Coastal Pest Control', 'Tom Reyes', 95, 'active', ['San Diego North', 'San Diego South']],
  ['Lakeside Windows', 'Jen Walsh', 65, 'active', ['Chicago']],
  ['Prime Plumbing Pros', 'Omar Haddad', 220, 'active', ['Dallas', 'Fort Worth']],
  ['NorthStar Insulation', 'Kelly Grant', 140, 'paused', ['Minneapolis']],
  ['Golden Gate Gutters', 'Ava Chen', 120, 'onboarding', ['SF Bay']],
];

const DEPARTMENTS = ['Management', 'Customer Success', 'Operations', 'Data', 'Finance', 'Sales'];

const rand = (min, max) => Math.round(min + Math.random() * (max - min));

export async function seedDemoData(profile, settings) {
  const now = new Date();
  const ops = [];
  const push = (ref, data) => ops.push([ref, data]);

  DEPARTMENTS.forEach((name) =>
    push(doc(db, 'departments', name.toLowerCase().replace(/\s+/g, '-')), { name, createdAt: serverTimestamp() }),
  );

  CLIENTS.forEach(([name, contact, rate, status, subs], ci) => {
    const clientRef = doc(collection(db, 'clients'));
    const startedDaysAgo = rand(45, 160);
    push(clientRef, {
      name, contactName: contact, email: `${contact.split(' ')[0].toLowerCase()}@example.com`, phone: '',
      status, dailyRate: rate, csmId: profile.id, csmName: profile.name, setupFeePaid: true,
      notes: 'Demo client', createdAt: Timestamp.fromDate(subDays(now, startedDaysAgo)), demo: true,
    });

    // Setup fee (excluded from spend) + daily payments
    const start = subDays(now, startedDaysAgo);
    push(doc(collection(db, 'payments')), {
      clientId: clientRef.id, clientName: name, amount: settings.setupFee || 300, type: 'setup_fee',
      note: 'Initial setup fee', date: Timestamp.fromDate(start), day: dayKey(start), demo: true,
      createdBy: profile.id, createdByName: profile.name, createdAt: serverTimestamp(),
    });
    if (status !== 'onboarding') {
      const activeUntil = status === 'paused' ? 20 : 0;
      for (let i = Math.min(startedDaysAgo, 120); i >= activeUntil; i -= 1) {
        if (Math.random() < 0.08) continue; // occasional missed day
        const d = subDays(now, i);
        d.setHours(12, 0, 0, 0);
        const amount = Math.max(65, Math.min(400, rate + rand(-15, 15)));
        push(doc(db, 'payments', `demo_${clientRef.id}_${dayKey(d)}`), {
          clientId: clientRef.id, clientName: name, amount, type: 'daily', note: 'Demo',
          date: Timestamp.fromDate(d), day: dayKey(d), demo: true,
          createdBy: profile.id, createdByName: profile.name, createdAt: serverTimestamp(),
        });
      }
    }

    subs.forEach((subName, si) => {
      push(doc(collection(db, 'subAccounts')), {
        clientId: clientRef.id, clientName: name, name: subName, accountRef: `SA-${1000 + ci * 10 + si}`,
        market: subName, status: 'active', notes: '', deliveredZipCount: 0, deliveredContacts: 0,
        createdAt: serverTimestamp(), demo: true,
      });
    });
  });

  const taskSeeds = [
    ['Onboard Golden Gate Gutters', 2, 'high'],
    ['Review flagged zips for BrightPath', -1, 'medium'],
    ['Monthly spend review with Sergio', 5, 'medium'],
    ['Clean up old Google Sheet data', -3, 'low'],
  ];
  taskSeeds.forEach(([title, inDays, priority]) =>
    push(doc(collection(db, 'tasks')), {
      title, description: 'Demo task', assigneeId: profile.id, assigneeName: profile.name, priority,
      status: 'todo', dueDate: Timestamp.fromDate(addDays(now, inDays)), createdBy: profile.id,
      createdByName: profile.name, createdAt: serverTimestamp(), overdueNotified: false, demo: true,
    }),
  );

  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(db);
    ops.slice(i, i + 450).forEach(([ref, data]) => batch.set(ref, data));
    await batch.commit();
  }
  await setDoc(doc(db, 'settings', 'app'), { ...settings, demoSeededAt: serverTimestamp() }, { merge: true });
  return ops.length;
}
