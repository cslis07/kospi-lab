'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, isNaN(n) ? lo : n));

/* 통화 모드별 포맷 */
const fmtW = (n: number) =>
  n >= 100000000 ? `${(n/100000000).toFixed(2)}억원` :
  n >= 10000     ? `${(n/10000).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}만원` :
  `${Math.round(n).toLocaleString()}원`;
const fmtUsdt = (n: number) =>
  n >= 1000000 ? `${(n/1000000).toFixed(2)}M USDT` :
  n >= 1000    ? `${(n/1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}K USDT` :
  `${Math.round(n).toLocaleString('en-US')} USDT`;

/* 슬라이더 + 수기 입력 한 줄 */
function SimSlider({
  label, sliderValue, sliderMin, sliderMax, sliderStep, onSlider,
  numValue, numMin, numMax, numStep, unit, onNum, numW = 'w-20',
}: {
  label: string;
  sliderValue: number; sliderMin: number; sliderMax: number; sliderStep: number; onSlider: (v: number) => void;
  numValue: number; numMin: number; numMax: number; numStep: number; unit: string; onNum: (v: number) => void; numW?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs text-[var(--text-muted)]">{label}</span>
        <div className="flex items-center gap-1">
          <input type="number" value={numValue} min={numMin} max={numMax} step={numStep}
            onChange={(e) => onNum(clamp(+e.target.value, numMin, numMax))}
            className={`${numW} bg-white/5 border border-[var(--border)] rounded-md px-1.5 py-1 text-xs font-semibold text-right text-[var(--text)] outline-none focus:border-sky-500/50`} />
          <span className="text-xs text-[var(--text-muted)] w-12">{unit}</span>
        </div>
      </div>
      <input type="range" min={sliderMin} max={sliderMax} step={sliderStep} value={sliderValue}
        onChange={(e) => onSlider(+e.target.value)} className="w-full accent-sky-500" />
    </div>
  );
}

type Mode = 'krw' | 'usdt';
type Preset = { label: string; rate: number };

const KRW_PRESETS: Preset[] = [
  { label: 'CMA/예금',   rate: 3.5  },
  { label: 'S&P500',     rate: 10.5 },
  { label: 'NASDAQ100',  rate: 14   },
  { label: '균형포트',   rate: 7    },
];
const USDT_PRESETS: Preset[] = [
  { label: 'USDT 스테이킹', rate: 6  },
  { label: 'BTC 장기 DCA',  rate: 25 },
  { label: 'ETH 장기 DCA',  rate: 20 },
  { label: '고위험 알트',   rate: 40 },
];

/* 모드별 기본값·슬라이더 스케일 */
const MODE_CFG = {
  krw: {
    presets: KRW_PRESETS,
    initDefault: 10000000, monthDefault: 500000, rateDefault: 10.5, presetDefault: 'S&P500',
    fmt: fmtW,
    initUnit: '만원', initDiv: 10000, initSliderMax: 100000000, initSliderStep: 1000000, initNumMax: 10000,
    monthUnit: '만원', monthDiv: 10000, monthSliderMax: 5000000, monthSliderStep: 50000, monthNumMax: 500,
    rateSliderMax: 300, rateNumMax: 30,
    yFmt: (v: number) => v >= 100000000 ? `${(v/100000000).toFixed(0)}억` : `${(v/10000).toFixed(0)}만`,
  },
  usdt: {
    presets: USDT_PRESETS,
    initDefault: 1000, monthDefault: 100, rateDefault: 25, presetDefault: 'BTC 장기 DCA',
    fmt: fmtUsdt,
    initUnit: 'USDT', initDiv: 1, initSliderMax: 100000, initSliderStep: 100, initNumMax: 1000000,
    monthUnit: 'USDT', monthDiv: 1, monthSliderMax: 10000, monthSliderStep: 50, monthNumMax: 1000000,
    rateSliderMax: 1000, rateNumMax: 100,
    yFmt: (v: number) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : `${v}`,
  },
} as const;

export default function SimulatePage() {
  const [mode, setMode] = useState<Mode>('krw');
  const cfg = MODE_CFG[mode];

  const [initial,  setInitial]  = useState<number>(MODE_CFG.krw.initDefault);
  const [monthly,  setMonthly]  = useState<number>(MODE_CFG.krw.monthDefault);
  const [rate,     setRate]     = useState<number>(MODE_CFG.krw.rateDefault);
  const [years,    setYears]    = useState(20);
  const [preset,   setPreset]   = useState<string>(MODE_CFG.krw.presetDefault);

  // USDT→KRW 환산용 실시간 환율(업비트)
  const { data: market } = useSWR('/api/market', fetcher, { refreshInterval: 30000 });
  const usdtKrw: number | null = market?.usdtkrw?.value ?? market?.usdkrw?.value ?? null;

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    const c = MODE_CFG[m];
    setMode(m);
    setInitial(c.initDefault);
    setMonthly(c.monthDefault);
    setRate(c.rateDefault);
    setPreset(c.presetDefault);
  };

  const applyPreset = (p: Preset) => {
    setPreset(p.label);
    setRate(p.rate);
  };

  /* FV = initial*(1+r)^n + monthly * [(1+r)^n - 1] / r  (월 복리) */
  const data = useMemo(() => {
    const r = rate / 100 / 12;
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
  const fmt = cfg.fmt;
  const krwOf = (usdt: number) => (usdtKrw ? usdt * usdtKrw : null);

  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string;
  }) => {
    if (!active || !payload) return null;
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 text-xs shadow-xl">
        <p className="font-semibold text-[var(--text)] mb-1">{label}</p>
        {payload.map((p) => (
          <p key={p.name} style={{ color: p.color }}>{p.name}: {fmt(p.value)}</p>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto pb-12">
      <h1 className="text-xl font-bold text-[var(--text)] mb-1">수익 시뮬레이션</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        복리 계산식 FV = PV·(1+r)ⁿ + PMT·[(1+r)ⁿ−1]/r
      </p>

      {/* 통화 모드 토글 */}
      <div className="flex gap-1.5 mb-4">
        {([
          { key: 'krw',  label: '원화 · 주식·펀드', icon: '₩' },
          { key: 'usdt', label: 'USDT · 코인',      icon: '₮' },
        ] as { key: Mode; label: string; icon: string }[]).map((m) => (
          <button key={m.key} onClick={() => switchMode(m.key)}
            className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
              mode === m.key
                ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}>
            <span className="mr-1.5">{m.icon}</span>{m.label}
          </button>
        ))}
      </div>

      {mode === 'usdt' && (
        <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2 mb-4">
          <span>⚠</span>
          <span>코인 수익률은 보장되지 않으며 변동성이 매우 큽니다. 아래 프리셋은 참고용 가정치입니다.{usdtKrw ? ` 현재 1 USDT ≈ ₩${Math.round(usdtKrw).toLocaleString('ko-KR')}(업비트).` : ''}</span>
        </div>
      )}

      <div className="space-y-4">
        {/* 입력 */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--text)]">투자 조건 설정</h2>

          {/* 프리셋 */}
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-2">{mode === 'usdt' ? '코인 수익률 프리셋(가정)' : '수익률 프리셋'}</p>
            <div className="grid grid-cols-4 gap-1.5">
              {cfg.presets.map((p) => (
                <button key={p.label} onClick={() => applyPreset(p)}
                  className={`py-2 rounded-xl border text-xs font-medium transition-all ${
                    preset === p.label
                      ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}>
                  <div className="leading-tight">{p.label}</div>
                  <div className="opacity-60">{p.rate}%</div>
                </button>
              ))}
            </div>
          </div>

          {/* 슬라이더 + 수기 입력 */}
          <SimSlider label={mode === 'usdt' ? '초기 투자금 (USDT)' : '초기 투자금'}
            sliderValue={initial} sliderMin={0} sliderMax={cfg.initSliderMax} sliderStep={cfg.initSliderStep} onSlider={setInitial}
            numValue={Math.round(initial / cfg.initDiv)} numMin={0} numMax={cfg.initNumMax} numStep={1} unit={cfg.initUnit}
            onNum={(v) => setInitial(v * cfg.initDiv)} numW="w-24" />
          <SimSlider label={mode === 'usdt' ? '월 적립액 (USDT)' : '월 적립액'}
            sliderValue={monthly} sliderMin={0} sliderMax={cfg.monthSliderMax} sliderStep={cfg.monthSliderStep} onSlider={setMonthly}
            numValue={Math.round(monthly / cfg.monthDiv)} numMin={0} numMax={cfg.monthNumMax} numStep={1} unit={cfg.monthUnit}
            onNum={(v) => setMonthly(v * cfg.monthDiv)} numW="w-24" />
          <SimSlider label="연 수익률"
            sliderValue={rate * 10} sliderMin={0} sliderMax={cfg.rateSliderMax} sliderStep={5}
            onSlider={(v) => { setRate(v / 10); setPreset('직접입력'); }}
            numValue={rate} numMin={0} numMax={cfg.rateNumMax} numStep={0.5} unit="%"
            onNum={(v) => { setRate(v); setPreset('직접입력'); }} numW="w-16" />
          <SimSlider label="투자 기간"
            sliderValue={years} sliderMin={1} sliderMax={40} sliderStep={1} onSlider={setYears}
            numValue={years} numMin={1} numMax={40} numStep={1} unit="년"
            onNum={setYears} numW="w-14" />
        </div>

        {/* 결과 카드 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-center">
            <p className="text-xs text-[var(--text-muted)] mb-1">예상 자산</p>
            <p className="text-lg font-bold text-sky-400">{fmt(final?.fv ?? 0)}</p>
            {mode === 'usdt' && krwOf(final?.fv ?? 0) !== null && (
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">≈ {fmtW(krwOf(final!.fv)!)}</p>
            )}
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-center">
            <p className="text-xs text-[var(--text-muted)] mb-1">투자 원금</p>
            <p className="text-lg font-bold text-[var(--text)]">{fmt(final?.principal ?? 0)}</p>
            {mode === 'usdt' && krwOf(final?.principal ?? 0) !== null && (
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">≈ {fmtW(krwOf(final!.principal)!)}</p>
            )}
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
            <p className="text-xs text-emerald-400/70 mb-1">수익</p>
            <p className="text-lg font-bold text-emerald-400">{fmt(final?.profit ?? 0)}</p>
            {mode === 'usdt' && krwOf(final?.profit ?? 0) !== null && (
              <p className="text-[10px] text-emerald-400/60 mt-0.5">≈ {fmtW(krwOf(final!.profit)!)}</p>
            )}
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
              <p className="text-xs text-[var(--text-muted)]">월 {fmt(monthly)} × {years*12}개월</p>
              <p className="text-sm font-semibold text-[var(--text)]">연 {rate}% 복리</p>
            </div>
          </div>
        )}

        {/* 차트 */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-4">자산 성장 그래프 <span className="text-[10px] font-normal text-[var(--text-muted)]">{mode === 'usdt' ? 'USDT 기준' : '원화 기준'}</span></h2>
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
              <YAxis tickFormatter={cfg.yFmt}
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
                    <td className="px-3 py-2 text-right text-[var(--text)]">{fmt(row.principal)}</td>
                    <td className="px-3 py-2 text-right text-emerald-400">+{fmt(row.profit)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-sky-400">{fmt(row.fv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {mode === 'usdt' && (
            <p className="text-[10px] text-[var(--text-muted)] mt-3">
              USDT 기준 복리 시뮬레이션입니다. 실제 코인 수익률은 시장에 따라 크게 달라지며 원금 손실이 발생할 수 있습니다. 투자 권유가 아닙니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
