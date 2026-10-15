'use client';

/** Nowflation 허브 차트 — Recharts. ⛔ 페이지에서 직접 import 금지, InflationChartLazy 로 지연 로딩. */
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { CompareRow, ForecastRow } from '@/lib/inflation';

const BLUE = '#1c6cff';
const AMBER = '#f59e0b';

function fmtX(m: string) { const [y, mm] = m.split('-'); return `${y.slice(2)}.${mm}`; }

interface TP { active?: boolean; payload?: { name: string; value: number; color: string; dataKey: string }[]; label?: string }
function TipBox({ active, payload, label }: TP) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.dataKey !== 'band' && typeof p.value === 'number');
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-2.5 text-[11px] shadow-xl tabular-nums">
      <p className="font-semibold text-[var(--text)] mb-1">{label}</p>
      {rows.map((p) => (
        <p key={p.dataKey}><span style={{ color: p.color }}>■ </span><span className="text-[var(--text-muted)]">{p.name} </span><b className="text-[var(--text)]">{p.value.toFixed(2)}%</b></p>
      ))}
    </div>
  );
}

export default function InflationChart({ kind, rows, height = 260 }: {
  kind: 'compare' | 'forecast';
  rows: CompareRow[] | ForecastRow[];
  height?: number;
}) {
  if (!rows.length) {
    return <div style={{ height }} className="grid place-items-center text-[12px] text-[var(--text-muted)]">표시할 데이터가 없습니다.</div>;
  }
  const tick = Math.max(1, Math.ceil(rows.length / 7));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows as unknown as Record<string, number | string | number[] | null>[]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="month" tickFormatter={fmtX} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval={tick - 1} minTickGap={8} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={40} domain={['auto', 'auto']}
            tickFormatter={(v) => `${Number(v).toFixed(1)}`} />
          <Tooltip content={<TipBox />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {kind === 'compare' ? (
            <>
              <Line type="monotone" dataKey="nowcast" name="나우캐스트(게이지)" stroke={BLUE} strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="official" name="공식 CPI" stroke={AMBER} strokeWidth={2} dot={{ r: 2 }} connectNulls />
            </>
          ) : (
            <>
              <Area type="monotone" dataKey="band" name="예측 범위" stroke="none" fill={BLUE} fillOpacity={0.12} connectNulls />
              <Line type="monotone" dataKey="actual" name="실측" stroke={BLUE} strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="central" name="모델 예측" stroke={BLUE} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
              <Line type="monotone" dataKey="official" name="공식 투영" stroke={AMBER} strokeWidth={1.5} strokeDasharray="2 3" dot={false} connectNulls />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
