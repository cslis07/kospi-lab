'use client';

/** 적립 시뮬 자산 성장 그래프 — Recharts. ⛔ 페이지에서 직접 import 금지, dynamic 으로 지연 로딩(recharts 를 첫 번들에서 뺀다). */
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';

const fmtW = (n: number) =>
  n >= 100000000 ? `${(n / 100000000).toFixed(2)}억원` :
  n >= 10000 ? `${(n / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}만원` :
  `${Math.round(n).toLocaleString()}원`;

export interface SimRow { year: string; fv: number; principal: number; profit: number }

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 text-xs shadow-xl">
      <p className="font-semibold text-[var(--text)] mb-1">{label}</p>
      {payload.map((p) => <p key={p.name} style={{ color: p.color }}>{p.name}: {fmtW(p.value)}</p>)}
    </div>
  );
}

export default function SimulateChart({ data, years }: { data: SimRow[]; years: number }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="fvGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00acfe" stopOpacity={0.3} /><stop offset="95%" stopColor="#00acfe" stopOpacity={0} /></linearGradient>
          <linearGradient id="prGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#5c6f8a" stopOpacity={0.3} /><stop offset="95%" stopColor="#5c6f8a" stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval={Math.ceil(years / 5) - 1} />
        <YAxis tickFormatter={(v) => v >= 100000000 ? `${(v / 100000000).toFixed(0)}억` : `${(v / 10000).toFixed(0)}만`} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={50} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Area type="monotone" dataKey="fv" name="예상 자산" stroke="#00acfe" fill="url(#fvGrad)" strokeWidth={2} />
        <Area type="monotone" dataKey="principal" name="투자 원금" stroke="#5c6f8a" fill="url(#prGrad)" strokeWidth={1.5} strokeDasharray="4 2" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
