'use client';

/**
 * 에쿼티 커브(자산 곡선) + 최대낙폭(MDD) — 참고: TraderSync·Edgewonk.
 * 청산 손익을 시간순으로 누적한 곡선과, 그 아래 '수면 아래(underwater)' 낙폭 띠를 함께 보여준다.
 * 색은 한국 관행(이익=빨강 · 손실=파랑), 낙폭 띠는 경고 빨강. Recharts 는 지연 로딩으로만 불러온다(EquityCurveLazy).
 */
import { useId, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { equityCurve, type TradeValue } from '@/lib/journalAnalytics';

const UP = '#ff4433';     // 이익(상승) — 한국 관행
const DOWN = '#1c6cff';   // 손실(하락)

const tick = (v: string) => v.slice(5).replace('-', '/'); // 'YYYY-MM-DD' → 'MM/DD'

export default function EquityCurve({ trades, unit, fmt }: {
  trades: TradeValue[];
  unit: string;
  fmt: (n: number) => string;
}) {
  const gid = useId().replace(/:/g, '');
  const eq = useMemo(() => equityCurve(trades), [trades]);
  const data = useMemo(() => eq.points.map((p, i) => ({ ...p, i, under: -p.drawdown })), [eq.points]);
  const lineColor = eq.finalCum >= 0 ? UP : DOWN;

  if (data.length < 2) {
    return (
      <div className="fin-card p-4 sm:p-5 mb-3">
        <Head finalCum={eq.finalCum} mdd={eq.maxDrawdown} n={eq.tradeCount} unit={unit} fmt={fmt} />
        <p className="text-[12px] text-[var(--text-muted)] text-center py-6">
          청산 거래가 2건 이상 쌓이면 자산 곡선이 그려집니다.
        </p>
      </div>
    );
  }

  return (
    <div className="fin-card p-4 sm:p-5 mb-3">
      <Head finalCum={eq.finalCum} mdd={eq.maxDrawdown} n={eq.tradeCount} unit={unit} fmt={fmt} />

      <ResponsiveContainer width="100%" height={150}>
        <AreaChart data={data} margin={{ top: 5, right: 6, left: 2, bottom: 0 }}>
          <defs>
            <linearGradient id={`eq${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={lineColor} stopOpacity={0.24} />
              <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="date" tickFormatter={tick} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
          <YAxis tickFormatter={(v) => fmt(Number(v))} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={52} />
          <ReferenceLine y={0} stroke="var(--faint)" strokeDasharray="2 2" />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as (typeof data)[0];
            return (
              <div className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-xs space-y-0.5">
                <p className="text-gray-400">{p.date.replace(/-/g, '.')}</p>
                <p className="text-white font-semibold">누적 {fmt(p.cum)}</p>
                <p style={{ color: p.value >= 0 ? UP : DOWN }}>이 거래 {p.value >= 0 ? '+' : ''}{fmt(p.value)}</p>
                {p.drawdown > 0 && <p style={{ color: UP }}>낙폭 −{fmt(p.drawdown)}</p>}
              </div>
            );
          }} />
          <Area type="monotone" dataKey="cum" stroke={lineColor} strokeWidth={1.8} fill={`url(#eq${gid})`} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>

      {/* 수면 아래(underwater) — 누적 최고 대비 낙폭을 음(−)으로 그려 MDD를 눈으로 본다 */}
      {eq.maxDrawdown > 0 && (
        <>
          <p className="text-[10px] text-[var(--text-muted)] mt-1 mb-0.5">최고점 대비 낙폭(underwater)</p>
          <ResponsiveContainer width="100%" height={44}>
            <AreaChart data={data} margin={{ top: 2, right: 6, left: 2, bottom: 0 }}>
              <XAxis dataKey="date" hide /><YAxis hide domain={[(dataMin: number) => Math.min(dataMin, -1), 0]} />
              <Area type="monotone" dataKey="under" stroke={UP} strokeWidth={1} fill={UP} fillOpacity={0.16} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}

function Head({ finalCum, mdd, n, unit, fmt }: {
  finalCum: number; mdd: number; n: number; unit: string; fmt: (n: number) => string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <h2 className="text-sm font-bold text-[var(--text)]">자산 곡선 <span className="text-[10px] font-normal text-[var(--text-muted)]">누적 손익 · 최대낙폭</span></h2>
      <div className="flex items-center gap-3 text-right">
        <div>
          <p className="text-[9px] text-[var(--text-muted)]">최종 누적</p>
          <p className="text-[14px] font-extrabold tabular-nums leading-tight" style={{ color: finalCum > 0 ? UP : finalCum < 0 ? DOWN : 'var(--faint)' }}>
            {finalCum > 0 ? '+' : ''}{fmt(finalCum)}<span className="text-[9px] font-normal text-[var(--faint)] ml-0.5">{unit}</span>
          </p>
        </div>
        <div>
          <p className="text-[9px] text-[var(--text-muted)]">최대낙폭(MDD)</p>
          <p className="text-[14px] font-extrabold tabular-nums leading-tight" style={{ color: mdd > 0 ? UP : 'var(--faint)' }}>
            −{fmt(mdd)}<span className="text-[9px] font-normal text-[var(--faint)] ml-0.5">{unit}</span>
          </p>
        </div>
        <div>
          <p className="text-[9px] text-[var(--text-muted)]">거래</p>
          <p className="text-[14px] font-extrabold tabular-nums leading-tight text-[var(--text)]">{n}건</p>
        </div>
      </div>
    </div>
  );
}
