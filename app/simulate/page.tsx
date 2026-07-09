'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, isNaN(n) ? lo : n));

const fmtW = (n: number) =>
  n >= 100000000 ? `${(n/100000000).toFixed(2)}억원` :
  n >= 10000     ? `${(n/10000).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}만원` :
  `${Math.round(n).toLocaleString()}원`;
const fmtUsdt = (n: number, d = 1) =>
  `${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })} USDT`;

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

/* ══════════════════ 원화: 복리 적립 시뮬 ══════════════════ */
type Preset = { label: string; rate: number };
const PRESETS: Preset[] = [
  { label: 'CMA/예금',   rate: 3.5  },
  { label: 'S&P500',     rate: 10.5 },
  { label: 'NASDAQ100',  rate: 14   },
  { label: '균형포트',   rate: 7    },
];

function CompoundSim() {
  const [initial,  setInitial]  = useState(10000000);
  const [monthly,  setMonthly]  = useState(500000);
  const [rate,     setRate]     = useState(10.5);
  const [years,    setYears]    = useState(20);
  const [preset,   setPreset]   = useState<string>('S&P500');

  const applyPreset = (p: Preset) => { setPreset(p.label); setRate(p.rate); };

  const data = useMemo(() => {
    const r = rate / 100 / 12;
    const rows = [];
    for (let y = 0; y <= years; y++) {
      const n = y * 12;
      const fv = initial * Math.pow(1 + r, n) + (r > 0 ? monthly * (Math.pow(1 + r, n) - 1) / r : monthly * n);
      const principal = initial + monthly * n;
      rows.push({ year: `${y}년`, fv: Math.round(fv), principal: Math.round(principal), profit: Math.round(fv - principal) });
    }
    return rows;
  }, [initial, monthly, rate, years]);

  const final = data[data.length - 1];
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
    if (!active || !payload) return null;
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 text-xs shadow-xl">
        <p className="font-semibold text-[var(--text)] mb-1">{label}</p>
        {payload.map((p) => <p key={p.name} style={{ color: p.color }}>{p.name}: {fmtW(p.value)}</p>)}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[var(--text)]">투자 조건 설정</h2>
        <div>
          <p className="text-xs text-[var(--text-muted)] mb-2">수익률 프리셋</p>
          <div className="grid grid-cols-4 gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => applyPreset(p)}
                className={`py-2 rounded-xl border text-xs font-medium transition-all ${
                  preset === p.label ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}>
                <div className="leading-tight">{p.label}</div>
                <div className="opacity-60">{p.rate}%</div>
              </button>
            ))}
          </div>
        </div>
        <SimSlider label="초기 투자금" sliderValue={initial} sliderMin={0} sliderMax={100000000} sliderStep={1000000} onSlider={setInitial}
          numValue={Math.round(initial / 10000)} numMin={0} numMax={10000} numStep={1} unit="만원" onNum={(v) => setInitial(v * 10000)} numW="w-24" />
        <SimSlider label="월 적립액" sliderValue={monthly} sliderMin={0} sliderMax={5000000} sliderStep={50000} onSlider={setMonthly}
          numValue={Math.round(monthly / 10000)} numMin={0} numMax={500} numStep={1} unit="만원" onNum={(v) => setMonthly(v * 10000)} numW="w-24" />
        <SimSlider label="연 수익률" sliderValue={rate * 10} sliderMin={0} sliderMax={300} sliderStep={5}
          onSlider={(v) => { setRate(v / 10); setPreset('직접입력'); }} numValue={rate} numMin={0} numMax={30} numStep={0.5} unit="%"
          onNum={(v) => { setRate(v); setPreset('직접입력'); }} numW="w-16" />
        <SimSlider label="투자 기간" sliderValue={years} sliderMin={1} sliderMax={40} sliderStep={1} onSlider={setYears}
          numValue={years} numMin={1} numMax={40} numStep={1} unit="년" onNum={setYears} numW="w-14" />
      </div>

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

      {final && final.principal > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-[var(--text-muted)]">총 수익률</p>
            <p className="text-2xl font-bold text-emerald-400">+{((final.profit / final.principal) * 100).toFixed(1)}%</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--text-muted)]">월 {fmtW(monthly)} × {years*12}개월</p>
            <p className="text-sm font-semibold text-[var(--text)]">연 {rate}% 복리</p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text)] mb-4">자산 성장 그래프</h2>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="fvGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
              <linearGradient id="prGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6b7280" stopOpacity={0.3} /><stop offset="95%" stopColor="#6b7280" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval={Math.ceil(years / 5) - 1} />
            <YAxis tickFormatter={(v) => v >= 100000000 ? `${(v/100000000).toFixed(0)}억` : `${(v/10000).toFixed(0)}만`} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={50} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="fv" name="예상 자산" stroke="#3b82f6" fill="url(#fvGrad)" strokeWidth={2} />
            <Area type="monotone" dataKey="principal" name="투자 원금" stroke="#6b7280" fill="url(#prGrad)" strokeWidth={1.5} strokeDasharray="4 2" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

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
  );
}

/* ══════════════════ 코인: 레버리지 손익 계산기 ══════════════════ */
const COINS = [
  { symbol: 'BTCUSDT', short: 'BTC', name: '비트코인', bg: '#F7931A' },
  { symbol: 'ETHUSDT', short: 'ETH', name: '이더리움', bg: '#627EEA' },
  { symbol: 'XRPUSDT', short: 'XRP', name: '리플',     bg: '#23292F' },
  { symbol: 'SOLUSDT', short: 'SOL', name: '솔라나',   bg: '#9945FF' },
];

function priceDigits(p: number) { return p >= 1000 ? 1 : p >= 10 ? 2 : 4; }

function LeverageCalc() {
  const [symbol, setSymbol]   = useState('BTCUSDT');
  const [margin, setMargin]   = useState(100);   // 증거금 USDT
  const [lev,    setLev]      = useState(10);     // 배율
  const [dir,    setDir]      = useState<'long' | 'short'>('long');
  const [move,   setMove]     = useState(5);      // 목표 가격 변동 %

  const { data: prices } = useSWR<Record<string, { price: number }>>(
    `/api/crypto/batch?symbols=${COINS.map((c) => c.symbol).join(',')}`,
    fetcher,
    { refreshInterval: 10000 },
  );
  const { data: market } = useSWR('/api/market', fetcher, { refreshInterval: 30000 });
  const usdtKrw: number | null = market?.usdtkrw?.value ?? market?.usdkrw?.value ?? null;

  const coin = COINS.find((c) => c.symbol === symbol)!;
  const price = prices?.[symbol]?.price ?? 0;
  const dg = price ? priceDigits(price) : 2;

  const position = margin * lev;                       // 포지션 명목가치
  const qty = price > 0 ? position / price : 0;        // 코인 수량
  const dirSign = dir === 'long' ? 1 : -1;
  const pnl = position * (move / 100) * dirSign;       // 예상 손익(USDT)
  const roe = margin > 0 ? (pnl / margin) * 100 : 0;   // 증거금 대비 수익률
  const targetPrice = price * (1 + (move / 100) * dirSign);
  // 청산가(근사, 고립마진·수수료 제외): 진입가 × (1 ∓ 1/배율)
  const liqPrice = dir === 'long' ? price * (1 - 1 / lev) : price * (1 + 1 / lev);
  const liqMovePct = 100 / lev;                        // 청산까지 가격 변동 %

  const krwOf = (u: number) => (usdtKrw ? u * usdtKrw : null);

  // 가격 변동별 손익 빠른 표
  const quickRows = [1, 3, 5, 10, 20].map((m) => ({
    move: m,
    pnl: position * (m / 100),
    roe: margin > 0 ? (position * (m / 100)) / margin * 100 : 0,
  }));

  return (
    <div className="space-y-4">
      {/* 코인 탭 */}
      <div className="grid grid-cols-4 gap-1.5">
        {COINS.map((c) => (
          <button key={c.symbol} onClick={() => setSymbol(c.symbol)}
            className={`py-2.5 rounded-xl border text-sm font-bold transition-all flex flex-col items-center gap-0.5 ${
              symbol === c.symbol ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[8px] text-white" style={{ backgroundColor: c.bg }}>{c.short[0]}</span>
              {c.short}
            </span>
            <span className="text-[10px] font-normal opacity-70 tabular-nums">
              {prices?.[c.symbol]?.price ? `$${prices[c.symbol].price.toLocaleString('en-US', { maximumFractionDigits: priceDigits(prices[c.symbol].price) })}` : '…'}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2">
        <span>⚠</span>
        <span>레버리지 선물은 원금 초과 손실·강제청산 위험이 있습니다. 아래 계산은 수수료·펀딩비를 제외한 단순 예시입니다.</span>
      </div>

      {/* 입력 */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text)]">{coin.name} 선물 손익 계산</h2>
          <span className="text-xs text-[var(--text-muted)] tabular-nums">
            현재가 {price ? `$${price.toLocaleString('en-US', { maximumFractionDigits: dg })}` : '로딩…'}
          </span>
        </div>

        {/* 방향 */}
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={() => setDir('long')}
            className={`py-2 rounded-xl border text-sm font-bold transition-all ${dir === 'long' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>롱 ▲ (상승 베팅)</button>
          <button onClick={() => setDir('short')}
            className={`py-2 rounded-xl border text-sm font-bold transition-all ${dir === 'short' ? 'border-red-500 bg-red-500/10 text-red-400' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>숏 ▼ (하락 베팅)</button>
        </div>

        <SimSlider label="증거금 (USDT)" sliderValue={margin} sliderMin={10} sliderMax={10000} sliderStep={10} onSlider={setMargin}
          numValue={margin} numMin={1} numMax={1000000} numStep={10} unit="USDT" onNum={setMargin} numW="w-24" />
        <SimSlider label="배율 (레버리지)" sliderValue={lev} sliderMin={1} sliderMax={125} sliderStep={1} onSlider={setLev}
          numValue={lev} numMin={1} numMax={125} numStep={1} unit="배" onNum={setLev} numW="w-16" />
        <SimSlider label={`목표 가격 변동 (${dir === 'long' ? '상승' : '하락'} 시 수익)`} sliderValue={move} sliderMin={0} sliderMax={50} sliderStep={0.5} onSlider={setMove}
          numValue={move} numMin={0} numMax={100} numStep={0.5} unit="%" onNum={setMove} numW="w-16" />
      </div>

      {/* 손익 결과 */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="text-center mb-4">
          <p className="text-xs text-[var(--text-muted)] mb-1">예상 손익</p>
          <p className={`text-3xl font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {pnl >= 0 ? '+' : ''}{fmtUsdt(pnl)}
          </p>
          <p className={`text-sm font-semibold mt-0.5 ${roe >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            증거금 대비 {roe >= 0 ? '+' : ''}{roe.toFixed(1)}%
          </p>
          {krwOf(pnl) !== null && (
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">≈ {fmtW(krwOf(pnl)!)}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {[
            { label: '포지션 크기', value: fmtUsdt(position, 0), sub: price ? `${qty.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${coin.short}` : '' },
            { label: '목표가', value: price ? `$${targetPrice.toLocaleString('en-US', { maximumFractionDigits: dg })}` : '-', sub: `${dir === 'long' ? '+' : '-'}${move}%` },
            { label: '청산가(근사)', value: price ? `$${liqPrice.toLocaleString('en-US', { maximumFractionDigits: dg })}` : '-', sub: `${dir === 'long' ? '-' : '+'}${liqMovePct.toFixed(1)}% 지점`, danger: true },
            { label: '최대 손실(청산 시)', value: `-${fmtUsdt(margin, 0)}`, sub: '증거금 전액', danger: true },
          ].map((c) => (
            <div key={c.label} className={`rounded-xl border p-3 ${c.danger ? 'border-red-500/20 bg-red-500/5' : 'border-[var(--border)] bg-white/3'}`}>
              <p className="text-[10px] text-[var(--text-muted)]">{c.label}</p>
              <p className={`text-base font-bold tabular-nums mt-0.5 ${c.danger ? 'text-red-400' : 'text-[var(--text)]'}`}>{c.value}</p>
              {c.sub && <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{c.sub}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* 가격 변동별 빠른 손익표 */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text)] mb-3">가격 변동별 손익 <span className="text-[10px] font-normal text-[var(--text-muted)]">{coin.short} {dir === 'long' ? '롱' : '숏'} · {lev}배 · {margin} USDT</span></h2>
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
                <th className="text-left px-3 py-2 text-[var(--text-muted)] font-medium">{dir === 'long' ? '상승' : '하락'}폭</th>
                <th className="text-right px-3 py-2 text-[var(--text-muted)] font-medium">손익(USDT)</th>
                <th className="text-right px-3 py-2 text-[var(--text-muted)] font-medium">증거금 대비</th>
              </tr>
            </thead>
            <tbody>
              {quickRows.map((r, i) => (
                <tr key={r.move} className={i % 2 === 1 ? 'bg-[var(--bg)]/30' : ''}>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{dir === 'long' ? '+' : '-'}{r.move}%</td>
                  <td className="px-3 py-2 text-right font-semibold text-emerald-400">+{fmtUsdt(r.pnl)}</td>
                  <td className="px-3 py-2 text-right text-emerald-400">+{r.roe.toFixed(0)}%</td>
                </tr>
              ))}
              {/* 청산 행 */}
              <tr className="border-t border-red-500/20 bg-red-500/5">
                <td className="px-3 py-2 text-red-400">{dir === 'long' ? '-' : '+'}{liqMovePct.toFixed(1)}% (청산)</td>
                <td className="px-3 py-2 text-right font-semibold text-red-400">-{fmtUsdt(margin)}</td>
                <td className="px-3 py-2 text-right text-red-400">-100%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mt-3">
          청산가는 고립마진 기준 근사치(진입가 × (1 ∓ 1/배율))이며 수수료·유지증거금을 제외합니다. 실제 청산가는 거래소·마진모드에 따라 다릅니다. 투자 권유가 아닙니다.
        </p>
      </div>
    </div>
  );
}

/* ══════════════════ 메인 ══════════════════ */
export default function SimulatePage() {
  const [mode, setMode] = useState<'krw' | 'usdt'>('krw');

  return (
    <div className="max-w-2xl mx-auto pb-12">
      <h1 className="text-xl font-bold text-[var(--text)] mb-1">수익 시뮬레이션</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        {mode === 'krw' ? '복리 적립 계산 FV = PV·(1+r)ⁿ + PMT·[(1+r)ⁿ−1]/r' : '코인 선물 레버리지 손익 계산기'}
      </p>

      {/* 모드 토글 */}
      <div className="flex gap-1.5 mb-4">
        {([
          { key: 'krw',  label: '원화 · 주식·펀드 적립', icon: '₩' },
          { key: 'usdt', label: 'USDT · 코인 선물',      icon: '₮' },
        ] as { key: 'krw' | 'usdt'; label: string; icon: string }[]).map((m) => (
          <button key={m.key} onClick={() => setMode(m.key)}
            className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
              mode === m.key ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}>
            <span className="mr-1.5">{m.icon}</span>{m.label}
          </button>
        ))}
      </div>

      {mode === 'krw' ? <CompoundSim /> : <LeverageCalc />}
    </div>
  );
}
