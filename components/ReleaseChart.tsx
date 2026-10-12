'use client';

/** 지표 발표 결과값 추이 — Recharts. ⛔ 페이지에서 직접 import 금지, ReleaseChartLazy 로 지연 로딩. */
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toNum } from '@/lib/releaseReaction';

export interface ChartRow { date: string; actual: string | null; forecast: string | null; previous: string | null }

function fmtX(d: string) { const [y, m] = d.split('-'); return `${y.slice(2)}.${m}`; }

interface TP { active?: boolean; payload?: { payload: { date: string; a: string; f: string; p: string } }[] }
function CustomTooltip({ active, payload }: TP) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-2.5 text-[11px] shadow-xl tabular-nums">
      <p className="font-semibold text-[var(--text)] mb-1">{d.date}</p>
      <p><span className="text-[var(--text-muted)]">결과 </span><b className="text-[var(--text)]">{d.a || '-'}</b></p>
      <p><span className="text-[var(--text-muted)]">예측 </span><span className="text-[var(--text)]">{d.f || '-'}</span></p>
      <p><span className="text-[var(--text-muted)]">이전 </span><span className="text-[var(--text)]">{d.p || '-'}</span></p>
    </div>
  );
}

export default function ReleaseChart({ rows }: { rows: ChartRow[] }) {
  // 과거→최신, 결과값 숫자화한 것만
  const data = [...rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ date: r.date, v: toNum(r.actual), a: r.actual ?? '', f: r.forecast ?? '', p: r.previous ?? '' }))
    .filter((r) => r.v != null);
  if (data.length < 2) {
    return <div className="h-[240px] grid place-items-center text-[12px] text-[var(--text-muted)]">표시할 결과값이 충분하지 않습니다.</div>;
  }
  const tick = Math.max(1, Math.ceil(data.length / 7));
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="relGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1c6cff" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#1c6cff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tickFormatter={fmtX} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval={tick - 1} minTickGap={10} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={44} domain={['auto', 'auto']}
            tickFormatter={(v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 })} />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="v" stroke="#1c6cff" strokeWidth={2} fill="url(#relGrad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
