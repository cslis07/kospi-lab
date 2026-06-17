'use client';

import { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';

const fmt  = (n: number) => n.toLocaleString('ko-KR');
const fmtW = (n: number) =>
  n >= 100000000 ? `${(n/100000000).toFixed(2)}억원` :
  n >= 10000     ? `${(n/10000).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}만원` :
  `${n.toLocaleString()}원`;

type Preset = { label: string; rate: number; desc: string };
const PRESETS: Preset[] = [
  { label: 'CMA/예금',   rate: 3.5,  desc: '원금보장' },
  { label: 'S&P500',     rate: 10.5, desc: '장기 역사 수익률' },
  { label: 'NASDAQ100',  rate: 14,   desc: '장기 역사 수익률' },
  { label: '균형포트',   rate: 7,    desc: '채권+주식 혼합' },
];

export default function SimulatePage() {
  const [initial,  setInitial]  = useState(10000000);   // 초기 투자금
  const [monthly,  setMonthly]  = useState(500000);     // 월 적립액
  const [rate,     setRate]     = useState(10.5);        // 연 수익률 %
  const [years,    setYears]    = useState(20);          // 투자 기간
  const [preset,   setPreset]   = useState<string>('S&P500');

  const applyPreset = (p: Preset) => {
    setPreset(p.label);
    setRate(p.rate);
  };

  /* FV = initial*(1+r)^n + monthly * [(1+r)^n - 1] / r  (월 복리) */
  const data = useMemo(() => {
    const r = rate / 100 / 12; // 월 이율
    const rows = [];
    for (let y = 0; y <= years; y++) {
      const n = y * 12;
      const fv = initial * Math.pow(1 + r, n) + (r > 0
        ? monthly * (Math.pow(1 + r, n) - 1) / r
        : monthly * n);
      const principal = initial + monthly * n;
      rows.push({
        year:      `${y}년`,
        fv:        Math.round(fv),
        principal: Math.round(principal),
        profit:    Math.round(fv - principal),
      });
    }
    return rows;
  }, [initial, monthly, rate, years]);

  const final = data[data.length - 1];

  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string;
  }) => {
    if (!active || !payload) return null;
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 text-xs shadow-xl">
        <p className="font-semibold text-[var(--text)] mb-1">{label}</p>
        {payload.map((p) => (
          <p key={p.name} style={{ color: p.color }}>{p.name}: {fmtW(p.value)}</p>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto pb-12">
      <h1 className="text-xl font-bold text-[var(--text)] mb-1">수익 시뮬레이션</h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        복리 계산식 FV = PV·(1+r)ⁿ + PMT·[(1+r)ⁿ−1]/r
      </p>

      <div className="space-y-4">
        {/* 입력 */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--text)]">투자 조건 설정</h2>

          {/* 프리셋 */}
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-2">수익률 프리셋</p>
            <div className="grid grid-cols-4 gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.label} onClick={() => applyPreset(p)}
                  className={`py-2 rounded-xl border text-xs font-medium transition-all ${
                    preset === p.label
                      ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}>
                  <div>{p.label}</div>
                  <div className="opacity-60">{p.rate}%</div>
                </button>
              ))}
            </div>
          </div>

          {/* 슬라이더들 */}
          {[
            { label: '초기 투자금',  value: initial,  min: 0,      max: 100000000, step: 1000000,  set: setInitial },
            { label: '월 적립액',    value: monthly,  min: 0,      max: 5000000,   step: 50000,   set: setMonthly },
            { label: `연 수익률: ${rate}%`, value: rate*10, min: 0, max: 300,      step: 5,       set: (v: number) => { setRate(v/10); setPreset('직접입력'); } },
            { label: `투자 기간: ${years}년`, value: years, min: 1, max: 40,       step: 1,       set: setYears },
          ].map(({ label, value, min, max, step, set }) => (
            <div key={label} className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-xs text-[var(--text-muted)]">{label}</span>
                {label.startsWith('초기') && <span className="text-xs font-semibold text-[var(--text)]">{fmtW(value)}</span>}
                {label.startsWith('월')   && <span className="text-xs font-semibold text-[var(--text)]">{fmtW(value)}</span>}
              </div>
              <input type="range" min={min} max={max} step={step} value={value}
                onChange={(e) => set(+e.target.value)}
                className="w-full accent-sky-500" />
            </div>
          ))}
        </div>

        {/* 결과 카드 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-center">
            <p className="text-xs text-[var(--text-muted)] mb-1">예상 자산</p>
            <p className="text-lg font-bold text-sky-400">{fmtW(final?.fv ?? 0)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-center">
            <p className="text-xs text-[var(--text-muted)] mb-1">투자 원금</p>
            <p className="text-lg font-bold text-[var(--text)]">{fmtW(final?.principal ?? 0)}</p>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
            <p className="text-xs text-emerald-400/70 mb-1">수익</p>
            <p className="text-lg font-bold text-emerald-400">{fmtW(final?.profit ?? 0)}</p>
          </div>
        </div>

        {/* 수익률 */}
        {final && final.principal > 0 && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-[var(--text-muted)]">총 수익률</p>
              <p className="text-2xl font-bold text-emerald-400">
                +{((final.profit / final.principal) * 100).toFixed(1)}%
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-[var(--text-muted)]">월 {fmtW(monthly)} × {years*12}개월</p>
              <p className="text-sm font-semibold text-[var(--text)]">연 {rate}% 복리</p>
            </div>
          </div>
        )}

        {/* 차트 */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-4">자산 성장 그래프</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fvGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="prGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6b7280" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6b7280" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval={Math.ceil(years / 5) - 1} />
              <YAxis tickFormatter={(v) => v >= 100000000 ? `${(v/100000000).toFixed(0)}억` : `${(v/10000).toFixed(0)}만`}
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={50} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="fv"        name="예상 자산" stroke="#3b82f6" fill="url(#fvGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="principal" name="투자 원금" stroke="#6b7280" fill="url(#prGrad)" strokeWidth={1.5} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* 연도별 표 */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-3">연도별 자산 추이</h2>
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
                  <th className="text-left px-3 py-2 text-[var(--text-muted)] font-medium">기간</th>
                  <th className="text-right px-3 py-2 text-[var(--text-muted)] font-medium">원금</th>
                  <th className="text-right px-3 py-2 text-[var(--text-muted)] font-medium">수익</th>
                  <th className="text-right px-3 py-2 text-[var(--text-muted)] font-medium">예상자산</th>
                </tr>
              </thead>
              <tbody>
                {data.filter((_, i) => i % Math.max(1, Math.floor(years / 10)) === 0 || i === data.length - 1).map((row, i) => (
                  <tr key={row.year} className={i % 2 === 1 ? 'bg-[var(--bg)]/30' : ''}>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{row.year}</td>
                    <td className="px-3 py-2 text-right text-[var(--text)]">{fmtW(row.principal)}</td>
                    <td className="px-3 py-2 text-right text-emerald-400">+{fmtW(row.profit)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-sky-400">{fmtW(row.fv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
