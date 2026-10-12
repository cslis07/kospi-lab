'use client';

/** 경제지표 히스토리 라인 차트 — Recharts. ⛔ 페이지에서 직접 import 금지, MacroChartLazy 로 지연 로딩. */
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { MacroPoint } from '@/lib/macroData';

function fmtDate(d: string, monthly: boolean) {
  // 'YYYY-MM-DD' → 월간은 'YY.MM', 일간은 'MM/DD'
  const [y, m, day] = d.split('-');
  return monthly ? `${y.slice(2)}.${m}` : `${m}/${day}`;
}

export default function MacroChart({
  data, decimals, monthly, unit,
}: { data: MacroPoint[]; decimals: number; monthly: boolean; unit: string }) {
  const rows = data.map((p) => ({ ...p, label: fmtDate(p.date, monthly) }));
  const tick = Math.max(1, Math.ceil(rows.length / 6));
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            interval={tick - 1} minTickGap={8} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={48}
            domain={['auto', 'auto']} tickFormatter={(v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: decimals })} />
          <Tooltip
            contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }}
            labelStyle={{ color: 'var(--text)' }}
            formatter={(v) => [`${Number(v).toLocaleString('en-US', { maximumFractionDigits: decimals })} ${unit}`, '']} />
          <Line type="monotone" dataKey="value" stroke="#1c6cff" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
