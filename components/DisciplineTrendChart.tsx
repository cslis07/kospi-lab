'use client';

/**
 * 규율 점수 일별 추이(막대) — Recharts. ⛔ 직접 import 금지, DisciplineTrendLazy 로만 불러온다.
 */
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts';
import type { DisciplineDay } from '@/lib/discipline';

const scoreColor = (s: number) => (s >= 80 ? '#16a34a' : s >= 60 ? '#f0a500' : '#ff4433');

export default function DisciplineTrendChart({ days }: { days: DisciplineDay[] }) {
  const data = days.map((d) => ({ ...d, label: d.day.slice(5).replace('-', '/') }));
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 5, right: 6, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={20} />
        <YAxis domain={[0, 100]} ticks={[0, 50, 80, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
        <ReferenceLine y={80} stroke="var(--faint)" strokeDasharray="2 2" />
        <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const d = payload[0].payload as (typeof data)[0];
          return (
            <div className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-xs space-y-0.5">
              <p className="text-gray-400">{d.day.replace(/-/g, '.')} · 매매 {d.n}건</p>
              <p className="font-semibold" style={{ color: scoreColor(d.score) }}>규율 {d.score}점</p>
              <p className="text-gray-300">손절 주문 {d.stops}/{d.n} · 추세 순응 {d.trendKnown ? `${d.aligned}/${d.trendKnown}` : '—'}</p>
              <p className="text-gray-300">복수 {d.revenge} · 3분 미만 손실 {d.lossScalps}</p>
            </div>
          );
        }} />
        <Bar dataKey="score" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {data.map((d) => <Cell key={d.day} fill={scoreColor(d.score)} fillOpacity={0.8} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
