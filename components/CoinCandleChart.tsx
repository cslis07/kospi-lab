'use client';

import { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

export interface ChartCandle {
  ts: number; o: number; h: number; l: number; c: number; v: number;
  ema20: number; ema60: number;
}

interface Level { price: number; label: string; color: string; dash?: boolean }

interface Props {
  candles: ChartCandle[];
  supports: number[];
  resistances: number[];
  fib?: { r382: number; r50: number; r618: number } | null;
  entry?: number; stop?: number; target1?: number; target2?: number;
  direction: 'long' | 'short' | 'wait';
  digits: number;
  xAxis?: 'time' | 'date';   // 코인=시간(기본), 주식 일봉=날짜
}

/* 캔들 커스텀 shape — dataKey=[low,high] 범위 막대의 픽셀 좌표로 몸통 재계산 */
interface CandleShapeProps {
  x?: number; y?: number; width?: number; height?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any;
}
function CandleShape({ x = 0, y = 0, width = 0, height = 0, payload }: CandleShapeProps) {
  if (!payload) return null;
  const { o, h, l, c } = payload as ChartCandle;
  const span = h - l;
  if (span <= 0 || height <= 0) return null;
  const up = c >= o;
  const color = up ? '#10b981' : '#ef4444';
  const bodyTopPrice = Math.max(o, c);
  const bodyBotPrice = Math.min(o, c);
  const pxPerPrice = height / span;
  const bodyY = y + (h - bodyTopPrice) * pxPerPrice;
  const bodyH = Math.max(1, (bodyTopPrice - bodyBotPrice) * pxPerPrice);
  const cx = x + width / 2;
  const bodyW = Math.max(2, width * 0.62);
  return (
    <g>
      <line x1={cx} y1={y} x2={cx} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={cx - bodyW / 2} y={bodyY} width={bodyW} height={bodyH} fill={color} />
    </g>
  );
}

function fmt(n: number, d: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function hhmm(ts: number) {
  const kst = new Date(ts + 9 * 3600_000);
  return `${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
}
function mmdd(ts: number) {
  const kst = new Date(ts + 9 * 3600_000);
  return `${String(kst.getUTCMonth() + 1).padStart(2, '0')}/${String(kst.getUTCDate()).padStart(2, '0')}`;
}

export default function CoinCandleChart({
  candles, supports, resistances, fib, entry, stop, target1, target2, direction, digits, xAxis = 'time',
}: Props) {
  const xfmt = xAxis === 'date' ? mmdd : hhmm;
  const data = useMemo(
    () => candles.map((c) => ({ ...c, range: [c.l, c.h] as [number, number] })),
    [candles],
  );

  const { yMin, yMax } = useMemo(() => {
    if (!candles.length) return { yMin: 0, yMax: 1 };
    let lo = Math.min(...candles.map((c) => c.l));
    let hi = Math.max(...candles.map((c) => c.h));
    // 진입/손절/익절 레벨도 뷰에 포함
    [entry, stop, target1, target2].forEach((v) => {
      if (v && v > 0) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    });
    const pad = (hi - lo) * 0.04;
    return { yMin: lo - pad, yMax: hi + pad };
  }, [candles, entry, stop, target1, target2]);

  const levels: Level[] = useMemo(() => {
    const out: Level[] = [];
    resistances.slice(0, 2).forEach((p) => out.push({ price: p, label: `저항 ${fmt(p, digits)}`, color: '#f87171', dash: true }));
    supports.slice(0, 2).forEach((p) => out.push({ price: p, label: `지지 ${fmt(p, digits)}`, color: '#34d399', dash: true }));
    if (fib) {
      out.push({ price: fib.r382, label: 'fib 38.2%', color: '#fbbf24' });
      out.push({ price: fib.r618, label: 'fib 61.8%', color: '#fbbf24' });
    }
    return out.filter((l) => l.price >= yMin && l.price <= yMax);
  }, [supports, resistances, fib, digits, yMin, yMax]);

  const yFmt = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v >= 1 ? v.toFixed(1) : v.toFixed(3));

  if (!candles.length) {
    return <div className="h-72 flex items-center justify-center text-xs text-[var(--text-muted)] animate-pulse">차트 로딩 중…</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 6, right: 62, left: 6, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="ts" tickFormatter={xfmt}
          tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
          tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={40}
        />
        <YAxis
          domain={[yMin, yMax]} tickFormatter={yFmt} orientation="right"
          tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
          tickLine={false} axisLine={false} width={52}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as ChartCandle;
            const up = d.c >= d.o;
            return (
              <div className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-[11px] space-y-0.5">
                <p className="text-gray-400 mb-1">{xfmt(d.ts)}</p>
                <p className={up ? 'text-emerald-400' : 'text-red-400'}>종가 ${fmt(d.c, digits)}</p>
                <p className="text-gray-400">시 ${fmt(d.o, digits)} · 고 ${fmt(d.h, digits)} · 저 ${fmt(d.l, digits)}</p>
                <p className="text-purple-400">EMA20 ${fmt(d.ema20, digits)}</p>
                <p className="text-sky-400">EMA60 ${fmt(d.ema60, digits)}</p>
              </div>
            );
          }}
        />
        {/* 캔들 */}
        <Bar dataKey="range" shape={<CandleShape />} isAnimationActive={false} />
        {/* EMA 오버레이 */}
        <Line type="monotone" dataKey="ema20" stroke="#a855f7" strokeWidth={1.2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="ema60" stroke="#38bdf8" strokeWidth={1.2} dot={false} isAnimationActive={false} />
        {/* 지지·저항·피보나치 레벨 */}
        {levels.map((l, i) => (
          <ReferenceLine key={`lv${i}`} y={l.price} stroke={l.color} strokeWidth={1}
            strokeDasharray={l.dash ? '4 3' : '2 2'} strokeOpacity={0.55}
            label={{ value: l.label, position: 'insideLeft', fontSize: 8, fill: l.color }} />
        ))}
        {/* 진입·손절·익절 */}
        {direction !== 'wait' && entry ? (
          <ReferenceLine y={entry} stroke="#e5e7eb" strokeWidth={1}
            label={{ value: '진입', position: 'left', fontSize: 8, fill: '#e5e7eb' }} />
        ) : null}
        {direction !== 'wait' && stop ? (
          <ReferenceLine y={stop} stroke="#ef4444" strokeWidth={1.2}
            label={{ value: '손절', position: 'left', fontSize: 8, fill: '#ef4444' }} />
        ) : null}
        {direction !== 'wait' && target1 ? (
          <ReferenceLine y={target1} stroke="#10b981" strokeWidth={1} strokeDasharray="3 3"
            label={{ value: 'T1', position: 'left', fontSize: 8, fill: '#10b981' }} />
        ) : null}
        {direction !== 'wait' && target2 ? (
          <ReferenceLine y={target2} stroke="#10b981" strokeWidth={1} strokeDasharray="3 3"
            label={{ value: 'T2', position: 'left', fontSize: 8, fill: '#10b981' }} />
        ) : null}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
