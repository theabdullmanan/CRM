import { useId } from 'react';
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { money } from '../lib/utils';

// Market palette (TradingView-style): gains / losses / neutral ink.
export const UP = '#089981';
export const DOWN = '#f23645';
const INK = 'rgb(var(--n-400))';
const GRID = 'rgb(var(--n-100))';
const tick = { fontSize: 10.5, fill: INK, fontFamily: '"JetBrains Mono", ui-monospace, monospace' };

export const compact = (v) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
  return `$${Math.round(n)}`;
};

const pct = (cur, prev) => (prev ? ((cur - prev) / prev) * 100 : null);

function Change({ cur, prev }) {
  const p = pct(cur, prev);
  if (p == null) return <span className="text-slate-400">—</span>;
  const up = cur >= prev;
  return (
    <span style={{ color: up ? '#2ec4a7' : '#ff6b77' }}>
      {up ? '▲ +' : '▼ −'}{money(Math.abs(cur - prev))} ({Math.abs(p).toFixed(1)}%)
    </span>
  );
}

/** Dark, terminal-style tooltip shared by every market chart. */
function Tip({ title, rows }) {
  return (
    <div className="theme-fixed min-w-[180px] rounded-md border border-white/10 bg-[#111114]/95 px-3 py-2.5 font-mono text-[11px] leading-5 text-slate-300 shadow-pop backdrop-blur">
      <p className="mb-1 font-sans text-[11px] font-medium text-slate-400">{title}</p>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-6">
          <span className="text-slate-500">{k}</span>
          <span className="text-right text-slate-100">{v}</span>
        </div>
      ))}
    </div>
  );
}

/** The price-tag that sits on the right axis at the last value, like a live ticker. */
function LastTag({ viewBox, value, color }) {
  if (!viewBox) return null;
  const x = viewBox.x + viewBox.width + 4;
  const y = viewBox.y;
  const text = compact(value);
  const w = text.length * 6.6 + 12;
  return (
    <g>
      <rect x={x} y={y - 9} width={w} height={18} rx={3} fill={color} />
      <text x={x + w / 2} y={y + 3.5} textAnchor="middle" fill="#fff" fontSize={10.5} fontWeight={600} fontFamily={tick.fontFamily}>{text}</text>
    </g>
  );
}

/**
 * Line + volume chart. The line is green when the window closed higher than it
 * opened and red when lower. Volume bars below are coloured per day versus the day before.
 */
export function PriceChart({ data, height = 300, volume = true, showMA = true }) {
  const id = useId().replace(/:/g, '');
  if (!data.length) return null;
  const first = data[0].spend;
  const last = data[data.length - 1].spend;
  const color = last >= first ? UP : DOWN;
  const sync = `sync-${id}`;
  const volH = volume ? Math.round(height * 0.24) : 0;

  const tooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <Tip
        title={d.label}
        rows={[
          ['Spend', money(d.spend)],
          ['vs prev day', <Change key="c" cur={d.spend} prev={d.prev} />],
          ...(showMA ? [['7d avg', money(d.ma7)]] : []),
        ]}
      />
    );
  };

  return (
    <div>
      <div style={{ height: height - volH }}>
        <ResponsiveContainer>
          <ComposedChart data={data} syncId={sync} margin={{ top: 12, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id={`pf${id}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.16} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" hide={volume} tick={tick} tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis orientation="right" tick={tick} tickLine={false} axisLine={false} tickFormatter={compact} width={60} domain={['auto', 'auto']} />
            <Tooltip content={tooltip} cursor={{ stroke: '#71717a', strokeWidth: 1, strokeDasharray: '3 3' }} isAnimationActive={false} />
            <Area
              type="linear" dataKey="spend" stroke={color} strokeWidth={1.75} fill={`url(#pf${id})`}
              activeDot={{ r: 4, fill: color, stroke: 'rgb(var(--surface))', strokeWidth: 2 }} animationDuration={900}
            />
            {showMA && <Line type="monotone" dataKey="ma7" stroke="#a1a1aa" strokeWidth={1.25} strokeDasharray="4 3" dot={false} activeDot={false} animationDuration={900} />}
            <ReferenceLine y={last} stroke={color} strokeDasharray="2 3" strokeOpacity={0.7} label={<LastTag value={last} color={color} />} ifOverflow="extendDomain" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {volume && (
        <div style={{ height: volH }} className="border-t border-slate-100">
          <ResponsiveContainer>
            <BarChart data={data} syncId={sync} margin={{ top: 6, right: 8, left: 8, bottom: 0 }} barCategoryGap={1}>
              <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis orientation="right" width={60} tick={false} axisLine={false} tickLine={false} />
              <Tooltip content={tooltip} cursor={{ fill: 'rgba(113,113,122,.08)' }} isAnimationActive={false} />
              <Bar dataKey="spend" radius={[1.5, 1.5, 0, 0]} animationDuration={700}>
                {data.map((d) => <Cell key={d.day} fill={d.up ? UP : DOWN} fillOpacity={0.55} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/** Custom candle drawn inside the [low, high] range bar Recharts lays out for us. */
function Candle({ x, y, width, height, payload }) {
  if (!payload) return null;
  const { open, close, high, low, up } = payload;
  const color = up ? UP : DOWN;
  const span = high - low;
  const toY = (v) => (span ? y + ((high - v) / span) * height : y);
  const bodyTop = toY(Math.max(open, close));
  const bodyH = Math.max(1.5, Math.abs(toY(open) - toY(close)));
  const bw = Math.max(3, Math.min(width * 0.72, 16));
  const cx = x + width / 2;
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + Math.max(height, 1)} stroke={color} strokeWidth={1} />
      <rect x={cx - bw / 2} y={bodyTop} width={bw} height={bodyH} fill={color} rx={1} />
    </g>
  );
}

/** OHLC candlestick chart over spend buckets (see toCandles). */
export function CandleChart({ candles, height = 300 }) {
  if (!candles.length) return null;
  const last = candles[candles.length - 1];
  const color = last.up ? UP : DOWN;
  return (
    <div style={{ height }} className="animate-fade">
      <ResponsiveContainer>
        <ComposedChart data={candles} margin={{ top: 12, right: 8, left: 8, bottom: 0 }} barCategoryGap="18%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="short" tick={tick} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis orientation="right" tick={tick} tickLine={false} axisLine={false} tickFormatter={compact} width={60} domain={['auto', 'auto']} />
          <Tooltip
            isAnimationActive={false}
            cursor={{ fill: 'rgba(113,113,122,.07)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <Tip
                  title={d.label}
                  rows={[
                    ['Open', money(d.open)],
                    ['High', money(d.high)],
                    ['Low', money(d.low)],
                    ['Close', money(d.close)],
                    ['Change', <Change key="c" cur={d.close} prev={d.open} />],
                    ['Period total', money(d.total)],
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="range" shape={<Candle />} isAnimationActive={false} />
          <ReferenceLine y={last.close} stroke={color} strokeDasharray="2 3" strokeOpacity={0.7} label={<LastTag value={last.close} color={color} />} ifOverflow="extendDomain" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal ranking bars: neutral ink, with change vs the previous period in the tooltip. */
export function RankBars({ rows, height = 300 }) {
  return (
    <div style={{ height }} className="animate-fade">
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 0 }} barCategoryGap={7}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" tick={tick} tickLine={false} axisLine={false} tickFormatter={compact} />
          <YAxis type="category" dataKey="clientName" tick={{ ...tick, fill: 'rgb(var(--n-600))', fontFamily: 'Inter, sans-serif', fontSize: 11.5 }} tickLine={false} axisLine={false} width={150} interval={0} />
          <Tooltip
            isAnimationActive={false}
            cursor={{ fill: 'rgba(113,113,122,.07)' }}
            content={({ active, payload }) => (active && payload?.length ? (
              <Tip
                title={payload[0].payload.clientName}
                rows={[['30-day spend', money(payload[0].payload.d30)], ['vs prior 30d', <Change key="c" cur={payload[0].payload.d30} prev={payload[0].payload.prevD30} />]]}
              />
            ) : null)}
          />
          <Bar dataKey="d30" radius={[0, 3, 3, 0]} maxBarSize={14} isAnimationActive={false}>
            {rows.map((r) => <Cell key={r.clientId} fill={r.d30 >= (r.prevD30 || 0) ? UP : DOWN} fillOpacity={0.85} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
