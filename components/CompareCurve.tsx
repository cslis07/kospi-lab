'use client';

/** 내 수익률%곡선 vs 지수 정규화%곡선 — Recharts. ⛔ 직접 import 금지, CompareCurveLazy 로 지연 로딩. */
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import type { CmpRow } from '@/lib/journalAnalytics';

const MINE = '#1c6cff';
const IDX = '#f59e0b';
function fmtX(d: string) { const p = d.split('-'); return `${p[1]}.${p[2]}`; }

interface TP { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }
function Tip({ active, payload, label }: TP) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-2.5 text-[11px] shadow-xl tabular-nums">
      <p className="font-semibold text-[var(--text)] mb-1">{label}</p>
      {payload.filter((p) => typeof p.value === 'number').map((p) => (
        <p key={p.name}><span style={{ color: p.color }}>■ </span><span className="text-[var(--text-muted)]">{p.name} </span><b className="text-[var(--text)]">{p.value >= 0 ? '+' : ''}{p.value.toFixed(1)}%</b></p>
      ))}
    </div>
  );
}

export default function CompareCurve({ rows, indexLabel }: { rows: CmpRow[]; indexLabel: string }) {
  if (rows.length < 2) return <div style={{ height: 200 }} className="grid place-items-center text-[12px] text-[var(--text-muted)]">표시할 데이터가 충분하지 않습니다.</div>;
  const tick = Math.max(1, Math.ceil(rows.length / 6));
  return (
    <div style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tickFormatter={fmtX} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval={tick - 1} minTickGap={10} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={42} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Tooltip content={<Tip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="mine" name="내 수익률" stroke={MINE} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="index" name={indexLabel} stroke={IDX} strokeWidth={1.8} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
