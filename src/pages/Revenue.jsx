import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
  DollarSign, CalendarDays, TrendingUp, Infinity as InfinityIcon, Plus, Upload, Zap, Download, ArrowUpDown, Crown, Users, Receipt, CandlestickChart, LineChart,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useClients, usePayments } from '../hooks/useData';
import { computeSpend, dailySeries, pctChange, toCandles, withChange } from '../lib/spend';
import { downloadCsv, friendlyError, money } from '../lib/utils';
import { Badge, Button, Card, CardHeader, Delta, EmptyState, Field, Input, MiniSpark, Modal, PageHeader, PageLoader, SearchInput, StatCard, Table, Tabs, Td, Th } from '../components/ui';
import { CandleChart, PriceChart, RankBars } from '../components/charts';
import PaymentModal from '../components/PaymentModal';
import { importPayments, logDailyCharges } from '../services/paymentService';

const COLS = [
  ['clientName', 'Client'],
  ['today', 'Today'],
  ['week', '7 days'],
  ['d30', '30 days'],
  ['lifetime', 'Lifetime'],
  ['avgDaily', 'Avg / day'],
  ['chg', '7d chg'],
];

export default function Revenue() {
  const { profile, settings } = useAuth();
  const { data: payments, loading } = usePayments();
  const { data: clients } = useClients();
  const [range, setRange] = useState('90');
  const [kind, setKind] = useState('line');
  const [sort, setSort] = useState({ key: 'd30', dir: -1 });
  const [search, setSearch] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [dailyDate, setDailyDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const spend = useMemo(() => computeSpend(payments), [payments]);
  const series = useMemo(() => withChange(dailySeries(spend.byDay, Number(range))), [spend.byDay, range]);
  const candles = useMemo(() => toCandles(series, range === '30' ? 3 : 7), [series, range]);
  const spark = useMemo(() => dailySeries(spend.byDay, 30).map((d) => d.spend), [spend.byDay]);
  const t = spend.totals;
  const lastDay = series[series.length - 1];
  const windowChange = series.length ? pctChange(lastDay.spend, series[0].spend) : null;
  const values = series.map((d) => d.spend);
  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);

  const payingClients = spend.clients.filter((c) => c.d30 > 0);
  const avgMonthly = payingClients.length ? spend.totals.d30 / payingClients.length : 0;
  const highValue = (c) => c.d30 >= settings.highValueMonthly;

  const rows = spend.clients
    .map((c) => ({ ...c, chg: pctChange(c.week, c.prevWeek) ?? 0, spark: dailySeries(c.byDay, 14).map((d) => d.spend) }))
    .filter((c) => !search || c.clientName?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const av = a[sort.key]; const bv = b[sort.key];
      return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * sort.dir;
    });
  const top = useMemo(() => [...spend.clients].sort((a, b) => b.d30 - a.d30).slice(0, 10).filter((c) => c.d30 > 0), [spend.clients]);

  const activeWithRate = clients.filter((c) => c.status === 'active' && Number(c.dailyRate) > 0);

  const onImport = (file) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async ({ data }) => {
        try {
          const { imported, errors } = await importPayments(data, clients, profile);
          toast.success(`${imported} payments imported`);
          if (errors.length) toast.error(`${errors.length} rows skipped: ${errors.slice(0, 3).join('; ')}`, { duration: 8000 });
        } catch (e) { toast.error(friendlyError(e)); }
      },
    });
  };

  const runDaily = async () => {
    setBusy(true);
    try {
      const n = await logDailyCharges(clients, new Date(`${dailyDate}T12:00:00`), profile);
      toast.success(`Logged daily charges for ${n} clients`);
      setDailyOpen(false);
    } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(false); }
  };

  if (loading) return <PageLoader />;

  return (
    <>
      <PageHeader
        title="Revenue & client spend"
        subtitle={`Real-time recurring spend. The one-time $${settings.setupFee} setup fee is excluded from every figure.`}
        actions={
          <>
            <Button variant="secondary" icon={Upload} onClick={() => fileRef.current?.click()}>Import CSV</Button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { if (e.target.files[0]) onImport(e.target.files[0]); e.target.value = ''; }} />
            <Button variant="secondary" icon={Zap} onClick={() => setDailyOpen(true)}>Log daily charges</Button>
            <Button icon={Plus} onClick={() => setPayOpen(true)}>Record payment</Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today" value={money(t.today)} icon={DollarSign} tone="emerald" delta={pctChange(t.today, t.yesterday)} deltaLabel="vs yesterday" spark={spark.slice(-14)} />
        <StatCard label="Last 7 days" value={money(t.week)} icon={CalendarDays} tone="sky" delta={pctChange(t.week, t.prevWeek)} deltaLabel="vs prior 7d" spark={spark.slice(-7)} />
        <StatCard label="Last 30 days" value={money(t.d30)} icon={TrendingUp} tone="brand" delta={pctChange(t.d30, t.prevD30)} deltaLabel="vs prior 30d" spark={spark} />
        <StatCard label="Lifetime" value={money(t.lifetime)} icon={InfinityIcon} tone="violet" sub="Recurring spend only" />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Avg monthly spend per paying client" value={money(avgMonthly)} sub={`Previous estimate: $500–$1,000 · based on ${payingClients.length} clients with spend in the last 30 days`} icon={Users} tone="amber" />
        <StatCard label="High-value clients" value={spend.clients.filter(highValue).length} sub={`30-day spend ≥ ${money(settings.highValueMonthly)}`} icon={Crown} tone="violet" />
        <StatCard label="Setup fees collected" value={money(spend.totals.setupFees)} sub="Tracked separately — not revenue" icon={Receipt} tone="sky" />
      </div>

      {payments.length === 0 ? (
        <Card className="mt-6">
          <EmptyState icon={DollarSign} title="No payments yet" message="Record payments, import a CSV (date, client, amount, type), or log daily charges from each client's daily rate." />
        </Card>
      ) : (
        <>
          <div className="mt-6 grid gap-6 xl:grid-cols-5">
            <Card className="overflow-hidden xl:col-span-3">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
                <div>
                  <p className="eyebrow">Daily spend · all clients</p>
                  <div className="mt-1.5 flex items-baseline gap-3">
                    <span className="font-mono text-[26px] font-semibold tracking-tight text-slate-900 tabular-nums">{money(lastDay?.spend || 0)}</span>
                    <Delta value={windowChange} />
                    <span className="text-xs text-slate-500">over {range} days</span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-slate-500 tabular-nums">
                    Period total {money(values.reduce((a, b) => a + b, 0))}
                    <span className="mx-2 text-slate-300">|</span>High {money(Math.max(...values))}
                    <span className="mx-2 text-slate-300">|</span>Low {money(Math.min(...values))}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Tabs size="sm" value={kind} onChange={setKind} tabs={[{ value: 'line', label: 'Line', icon: LineChart }, { value: 'candle', label: 'Candles', icon: CandlestickChart }]} />
                  <Tabs size="sm" value={range} onChange={setRange} tabs={[{ value: '30', label: '1M' }, { value: '90', label: '3M' }, { value: '180', label: '6M' }]} />
                </div>
              </div>
              <div className="px-2 pb-2 pt-1">
                {kind === 'line' ? <PriceChart data={series} height={330} /> : <CandleChart candles={candles} height={330} />}
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-slate-100 px-5 py-2.5 text-[11px] text-slate-500">
                {kind === 'line' ? (
                  <>
                    <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-up" />Spend (green when the period closed higher)</span>
                    <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-slate-400" />7-day average</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-1.5 rounded-sm bg-up/60" /><span className="h-2.5 w-1.5 rounded-sm bg-down/60" />Daily volume, up / down vs prior day</span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-1.5 rounded-sm bg-up" />Closed higher</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-1.5 rounded-sm bg-down" />Closed lower</span>
                    <span>Each candle = {range === '30' ? '3' : '7'} days · wick = highest / lowest day</span>
                  </>
                )}
              </div>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader title="Top clients" subtitle="30-day spend · green = up vs prior 30 days" />
              <div className="px-2 py-4"><RankBars rows={top} height={390} /></div>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader
              title="Spend by client"
              subtitle="Daily · weekly · 30-day · lifetime, recurring payments only"
              actions={
                <>
                  <SearchInput value={search} onChange={setSearch} placeholder="Search client…" className="h-8 sm:w-48" />
                  <Button size="sm" variant="secondary" icon={Download} onClick={() => downloadCsv(`client-spend-${format(new Date(), 'yyyy-MM-dd')}.csv`, rows.map((c) => ({
                    client: c.clientName, today: c.today, last7Days: c.week, last30Days: c.d30, lifetime: c.lifetime, avgDaily: c.avgDaily.toFixed(2), activeDays: c.activeDays, highValue: highValue(c) ? 'yes' : 'no',
                  })))}>Export</Button>
                </>
              }
            />
            <Table>
              <thead>
                <tr>
                  {COLS.map(([k, l]) => (
                    <Th key={k} className={k === 'clientName' ? '' : 'text-right'}>
                      <button className="inline-flex items-center gap-1 uppercase hover:text-slate-800" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : -1 }))}>
                        {l}<ArrowUpDown className={`h-3 w-3 ${sort.key === k ? 'text-brand-600' : 'opacity-40'}`} />
                      </button>
                    </Th>
                  ))}
                  <Th>Tier</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((c) => (
                  <tr key={c.clientId} className="hover:bg-slate-50">
                    <Td>
                      <Link to={`/clients/${c.clientId}`} className="font-medium text-slate-900 hover:text-brand-600">{c.clientName}</Link>
                      {clientMap[c.clientId]?.dailyRate ? <p className="text-xs text-slate-500">Rate {money(clientMap[c.clientId].dailyRate)}/day</p> : null}
                    </Td>
                    <Td className="text-right font-mono text-[12.5px] tabular-nums">{money(c.today)}</Td>
                    <Td className="text-right font-mono text-[12.5px] tabular-nums">{money(c.week)}</Td>
                    <Td className="text-right font-semibold tabular-nums text-slate-900">{money(c.d30)}</Td>
                    <Td className="text-right font-mono text-[12.5px] tabular-nums">{money(c.lifetime)}</Td>
                    <Td className="text-right font-mono text-[12.5px] tabular-nums text-slate-500">{money(c.avgDaily)}</Td>
                    <Td className="text-right"><div className="flex items-center justify-end gap-3"><MiniSpark data={c.spark} width={64} height={22} /><Delta value={c.chg} chip={false} className="w-16 justify-end" /></div></Td>
                    <Td>{highValue(c) ? <Badge color="violet"><Crown className="h-3 w-3" />High value</Badge> : c.d30 > 0 ? <Badge color="emerald">Active</Badge> : <Badge>No recent spend</Badge>}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold text-slate-900">
                  <Td>Total</Td>
                  <Td className="text-right font-mono text-[12.5px] tabular-nums">{money(spend.totals.today)}</Td>
                  <Td className="text-right font-mono text-[12.5px] tabular-nums">{money(spend.totals.week)}</Td>
                  <Td className="text-right font-mono text-[12.5px] tabular-nums">{money(spend.totals.d30)}</Td>
                  <Td className="text-right font-mono text-[12.5px] tabular-nums">{money(spend.totals.lifetime)}</Td>
                  <Td /><Td className="text-right"><Delta value={pctChange(t.week, t.prevWeek)} chip={false} /></Td><Td />
                </tr>
              </tfoot>
            </Table>
          </Card>
        </>
      )}

      <PaymentModal open={payOpen} onClose={() => setPayOpen(false)} clients={clients} />

      <Modal open={dailyOpen} onClose={() => setDailyOpen(false)} title="Log daily charges"
        subtitle="Creates one daily-spend payment per active client using its daily rate. Safe to re-run — a day is never counted twice."
        footer={<><Button variant="secondary" onClick={() => setDailyOpen(false)}>Cancel</Button><Button icon={Zap} loading={busy} onClick={runDaily} disabled={!activeWithRate.length}>Log {activeWithRate.length} charges</Button></>}>
        <Field label="Date"><Input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} /></Field>
        <div className="mt-4 max-h-56 space-y-1 overflow-y-auto">
          {activeWithRate.map((c) => (
            <div key={c.id} className="flex justify-between rounded-md bg-slate-50 px-3 py-1.5 text-sm"><span>{c.name}</span><span className="font-medium tabular-nums">{money(c.dailyRate)}</span></div>
          ))}
          {!activeWithRate.length && <p className="text-sm text-slate-500">No active clients have a daily rate set.</p>}
        </div>
        <p className="mt-3 text-right text-sm font-semibold">Total {money(activeWithRate.reduce((s, c) => s + Number(c.dailyRate), 0))}</p>
      </Modal>
    </>
  );
}
