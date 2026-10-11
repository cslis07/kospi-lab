'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import useSWR from 'swr';
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { isolatedLiqPrice, liqSafety, notionForRisk } from '@/lib/positionSizing';
import { useRiskLimits } from '@/hooks/useRiskLimits';

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
  // 자유 입력을 위한 내부 문자열 버퍼(빈칸 허용). 포커스 중이 아닐 때만 외부값과 동기화
  const [text, setText] = useState(String(numValue));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(String(numValue)); }, [numValue]);

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs text-[var(--text-muted)]">{label}</span>
        <div className="flex items-center gap-1">
          <input type="number" inputMode="decimal" value={text} min={numMin} max={numMax} step={numStep}
            onFocus={() => { focused.current = true; }}
            onChange={(e) => {
              setText(e.target.value);
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) onNum(clamp(v, numMin, numMax));
            }}
            onBlur={() => {
              focused.current = false;
              const v = parseFloat(text);
              if (isNaN(v)) { setText(String(numValue)); }
              else { const c = clamp(v, numMin, numMax); setText(String(c)); onNum(c); }
            }}
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
              <linearGradient id="fvGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00acfe" stopOpacity={0.3} /><stop offset="95%" stopColor="#00acfe" stopOpacity={0} /></linearGradient>
              <linearGradient id="prGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#5c6f8a" stopOpacity={0.3} /><stop offset="95%" stopColor="#5c6f8a" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval={Math.ceil(years / 5) - 1} />
            <YAxis tickFormatter={(v) => v >= 100000000 ? `${(v/100000000).toFixed(0)}억` : `${(v/10000).toFixed(0)}만`} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={50} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="fv" name="예상 자산" stroke="#00acfe" fill="url(#fvGrad)" strokeWidth={2} />
            <Area type="monotone" dataKey="principal" name="투자 원금" stroke="#5c6f8a" fill="url(#prGrad)" strokeWidth={1.5} strokeDasharray="4 2" />
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
  // mmr = Bitget USDT-M 고립마진 1티어(소액) 유지증거금률
  { symbol: 'BTCUSDT', short: 'BTC', name: '비트코인', bg: '#F7931A', mmr: 0.004 },
  { symbol: 'ETHUSDT', short: 'ETH', name: '이더리움', bg: '#627EEA', mmr: 0.004 },
  { symbol: 'XRPUSDT', short: 'XRP', name: '리플',     bg: '#23292F', mmr: 0.005 },
  { symbol: 'SOLUSDT', short: 'SOL', name: '솔라나',   bg: '#9945FF', mmr: 0.005 },
];

// Bitget 테이커 수수료(기본). 청산 시 청산 명목가에 부과되므로 유지증거금률과 함께 더해진다.
const TAKER_FEE = 0.0006;

function priceDigits(p: number) { return p >= 1000 ? 1 : p >= 10 ? 2 : 4; }

function LeverageCalc() {
  const [symbol, setSymbol]   = useState('BTCUSDT');
  const [margin, setMargin]   = useState(100);   // 증거금 USDT
  const [lev,    setLev]      = useState(10);     // 배율
  const [dir,    setDir]      = useState<'long' | 'short'>('long');
  const [targetStr, setTargetStr] = useState('');  // 목표가 입력(빈칸이면 현재가로 간주)
  const [feeOn,  setFeeOn]    = useState(false);   // 수수료·펀딩 반영(실손익)
  const [holdH,  setHoldH]    = useState(24);      // 보유 시간(시간)
  const [seed,   setSeed]     = useState(1000);    // 리스크 역산: 계좌 시드 USDT
  const [riskPct, setRiskPct] = useState(2);       // 리스크 역산: 계좌 대비 허용 손실%
  const [stopStr, setStopStr] = useState('');      // 리스크 역산: 손절가

  // 코인 전환 시 목표가·손절가 초기화(현재가 기준으로)
  useEffect(() => { setTargetStr(''); setStopStr(''); }, [symbol]);

  const { data: prices } = useSWR<Record<string, { price: number }>>(
    `/api/crypto/batch?symbols=${COINS.map((c) => c.symbol).join(',')}`,
    fetcher,
    { refreshInterval: 10000 },
  );
  const { data: market } = useSWR('/api/market', fetcher, { refreshInterval: 30000 });
  const usdtKrw: number | null = market?.usdtkrw?.value ?? market?.usdkrw?.value ?? null;
  // 선물 펀딩비(8h, %) — 실손익용
  const { data: futures } = useSWR<{ symbol: string; fundingRate: number | null }[]>(
    '/api/futures/tickers', fetcher, { refreshInterval: 60000 },
  );
  const fundingPct = futures?.find((f) => f.symbol === symbol)?.fundingRate ?? null; // 8h당 %
  const { limits: riskLimits } = useRiskLimits();      // 1회 손실 한도(서킷브레이커 설정 공유)

  const coin = COINS.find((c) => c.symbol === symbol)!;
  const price = prices?.[symbol]?.price ?? 0;
  const dg = price ? priceDigits(price) : 2;

  const position = margin * lev;                       // 포지션 명목가치
  const qty = price > 0 ? position / price : 0;        // 코인 수량
  const dirSign = dir === 'long' ? 1 : -1;
  const isShort = dir === 'short';
  const targetNum = parseFloat(targetStr);
  const effTarget = targetStr !== '' && !isNaN(targetNum) && targetNum > 0 ? targetNum : price; // 미입력 시 현재가
  const changePct = price > 0 ? ((effTarget - price) / price) * 100 : 0; // 부호 있는 가격 변동%
  const grossPnl = price > 0 ? position * ((effTarget - price) / price) * dirSign : 0; // 수수료 전 손익(USDT)

  // 수수료·펀딩(실손익): 진입 테이커 + 청산 테이커(청산 명목가) + 보유기간 펀딩
  const openFee  = position * TAKER_FEE;
  const closeFee = price > 0 ? position * (effTarget / price) * TAKER_FEE : 0;
  const feeCost  = openFee + closeFee;
  // 펀딩: 8h마다 명목가×펀딩률. 펀딩률>0이면 롱이 숏에게 지급(롱 비용·숏 수익)
  const fundingPeriods = holdH / 8;
  const fundingCost = fundingPct != null ? position * (fundingPct / 100) * fundingPeriods * dirSign : 0;
  const netPnl = grossPnl - feeCost - fundingCost;
  const pnl = feeOn ? netPnl : grossPnl;               // 표시 손익
  const roe = margin > 0 ? (pnl / margin) * 100 : 0;   // 증거금 대비 수익률
  const targetPrice = effTarget;
  // 청산가: Bitget 고립마진 공식(단일 소스 lib/positionSizing). 코인별 1티어 MMR + 테이커.
  const liqPrice = price > 0 ? isolatedLiqPrice(price, lev, isShort, coin.mmr, TAKER_FEE) : 0;
  const liqMovePct = price > 0 ? Math.abs(price - liqPrice) / price * 100 : 0; // 청산까지 가격 변동 %

  // ── 리스크 기반 역산: "계좌의 X%만 잃으려면?" ──
  const perTradeLimit = riskLimits.perTradeLossLimitUsdt;  // 1회 손실 한도(USDT, null=미설정)
  const stopNum = parseFloat(stopStr);
  const hasStop = stopStr !== '' && !isNaN(stopNum) && stopNum > 0 && price > 0
    && (isShort ? stopNum > price : stopNum < price);   // 손절은 손실 방향이어야 유효
  const stopPct = hasStop ? Math.abs(stopNum - price) / price * 100 : 0;
  const riskLoss  = seed * (riskPct / 100);             // 손절 시 손실(계좌 대비)
  // 비용 차감 사이징: 수량=(최대허용손실−예상비용)÷손절거리. 예상비용은 1차 노션으로 추정(진입+청산 테이커)
  const notion0   = hasStop ? notionForRisk(seed, riskPct, stopPct) : 0;
  const estCost   = notion0 * TAKER_FEE * 2;            // 진입+청산 테이커 추정
  const recNotion = hasStop ? notionForRisk(seed, riskPct, stopPct, estCost) : 0;  // 권장 포지션 명목가(비용 차감)
  const recMargin = recNotion / lev;                    // 권장 증거금
  const safety    = hasStop ? liqSafety(price, stopPct, lev, isShort, coin.mmr, TAKER_FEE) : 0; // 청산여유÷손절거리
  const safeMaxLev = hasStop && safety > 0 && safety < 2 ? Math.max(1, Math.floor(lev * (safety / 2))) : lev;
  const perTradeExceeded = perTradeLimit != null && riskLoss > perTradeLimit;  // 1회 한도 초과

  // 목표가 슬라이더 범위(현재가 ±50%)
  const priceLo = price ? +(price * 0.5).toFixed(dg) : 0;
  const priceHi = price ? +(price * 1.5).toFixed(dg) : 1;
  const priceStep = price > 1000 ? 10 : price > 10 ? 0.1 : 0.0001;

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
        <span>레버리지 선물은 원금 초과 손실·강제청산 위험이 있습니다. <b>청산가</b>는 Bitget 고립마진 공식으로 계산합니다. <b>손익</b>은 기본은 수수료 제외이며, 아래 <b>수수료·펀딩 반영</b>을 켜면 진입·청산 테이커와 보유기간 펀딩비까지 반영한 실손익을 보여줍니다.</span>
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
        {/* 목표가 입력 */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-[var(--text-muted)]">목표가 (USDT)</span>
            <div className="flex items-center gap-1">
              <input type="number" inputMode="decimal" value={targetStr}
                placeholder={price ? String(+price.toFixed(dg)) : ''} min={0} step={priceStep}
                onChange={(e) => setTargetStr(e.target.value)}
                className="w-28 bg-white/5 border border-[var(--border)] rounded-md px-1.5 py-1 text-xs font-semibold text-right text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-sky-500/50" />
              <button onClick={() => setTargetStr('')} className="text-[10px] text-[var(--text-muted)] hover:text-sky-400 w-12" title="현재가로 초기화">현재가</button>
            </div>
          </div>
          <input type="range" min={priceLo} max={priceHi} step={priceStep}
            value={clamp(effTarget, priceLo, priceHi)}
            onChange={(e) => setTargetStr(e.target.value)} disabled={!price}
            className="w-full accent-sky-500 disabled:opacity-40" />
          <div className="flex justify-between text-[10px]">
            <span className="text-[var(--text-muted)]">현재가 대비{' '}
              <span className={changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}>{changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%</span>
            </span>
            <span className={
              (dir === 'long' ? changePct > 0 : changePct < 0) ? 'text-emerald-400'
                : (dir === 'long' ? changePct < 0 : changePct > 0) ? 'text-red-400' : 'text-[var(--text-muted)]'
            }>
              {changePct === 0 ? '진입가' : (dir === 'long' ? changePct > 0 : changePct < 0) ? '수익 구간' : '손실 구간'}
            </span>
          </div>
        </div>

        {/* 수수료·펀딩 반영(실손익) 토글 */}
        <div className="pt-1 border-t border-[var(--border)]">
          <label className="flex items-center justify-between cursor-pointer select-none">
            <span className="text-xs text-[var(--text)]">수수료·펀딩 반영 <span className="text-[10px] text-[var(--text-muted)]">(실손익)</span></span>
            <input type="checkbox" checked={feeOn} onChange={(e) => setFeeOn(e.target.checked)} className="w-4 h-4 accent-sky-500" />
          </label>
          {feeOn && (
            <div className="mt-3 space-y-2.5">
              <SimSlider label="보유 시간" sliderValue={holdH} sliderMin={0} sliderMax={720} sliderStep={1} onSlider={setHoldH}
                numValue={holdH} numMin={0} numMax={8760} numStep={1} unit="시간" onNum={setHoldH} numW="w-20" />
              <p className="text-[10px] text-[var(--text-muted)]">
                테이커 {(TAKER_FEE * 100).toFixed(2)}%(진입+청산) · 펀딩 {fundingPct != null ? `${fundingPct >= 0 ? '+' : ''}${fundingPct.toFixed(4)}%/8h (${dir === 'long' ? (fundingPct >= 0 ? '롱 지급' : '롱 수취') : (fundingPct >= 0 ? '숏 수취' : '숏 지급')})` : '로딩…'} · {fundingPeriods.toFixed(1)}회
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 손익 결과 */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="text-center mb-4">
          <p className="text-xs text-[var(--text-muted)] mb-1">{feeOn ? '예상 실손익 (수수료·펀딩 반영)' : '예상 손익'}</p>
          <p className={`text-3xl font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {pnl >= 0 ? '+' : ''}{fmtUsdt(pnl)}
          </p>
          {krwOf(pnl) !== null && (
            <p className={`text-base font-bold mt-1 ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              ≈ 한화 {pnl >= 0 ? '+' : ''}{fmtW(krwOf(pnl)!)}
            </p>
          )}
          <p className={`text-sm font-semibold mt-1 ${roe >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            증거금 대비 {roe >= 0 ? '+' : ''}{roe.toFixed(1)}%
            {usdtKrw ? <span className="text-[10px] font-normal text-[var(--text-muted)] ml-1.5">1 USDT ≈ ₩{Math.round(usdtKrw).toLocaleString('ko-KR')}</span> : null}
          </p>
          {feeOn && (
            <div className="mt-3 pt-2.5 border-t border-[var(--border)] text-[11px] text-[var(--text-muted)] space-y-0.5 max-w-[260px] mx-auto">
              <div className="flex justify-between"><span>수수료 전 손익</span><span className={grossPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>{grossPnl >= 0 ? '+' : ''}{fmtUsdt(grossPnl)}</span></div>
              <div className="flex justify-between"><span>− 수수료(진입+청산)</span><span className="text-red-400">-{fmtUsdt(feeCost, 2)}</span></div>
              <div className="flex justify-between"><span>{fundingCost >= 0 ? '− 펀딩비' : '+ 펀딩 수취'}</span><span className={fundingCost > 0 ? 'text-red-400' : fundingCost < 0 ? 'text-emerald-400' : ''}>{fundingCost >= 0 ? '-' : '+'}{fmtUsdt(Math.abs(fundingCost), 2)}</span></div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {[
            { label: '포지션 크기', value: fmtUsdt(position, 0), sub: price ? `${qty.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${coin.short}` : '' },
            { label: '목표가', value: price ? `$${targetPrice.toLocaleString('en-US', { maximumFractionDigits: dg })}` : '-', sub: `현재가 대비 ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` },
            { label: '청산가 (Bitget 고립)', value: price ? `$${liqPrice.toLocaleString('en-US', { maximumFractionDigits: dg })}` : '-', sub: `${dir === 'long' ? '-' : '+'}${liqMovePct.toFixed(1)}% · 유지증거금 ${(coin.mmr * 100).toFixed(1)}%`, danger: true },
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

      {/* 리스크 기반 역산 — "계좌의 X%만 잃으려면?" */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">리스크 기반 역산</h2>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">손절가를 정하면 “계좌의 일부만 잃도록” 적정 증거금·포지션을 거꾸로 계산합니다. 리스크는 배율이 아니라 <b>손절 거리</b>가 정합니다.</p>
        </div>

        <SimSlider label="계좌 시드 (USDT)" sliderValue={seed} sliderMin={100} sliderMax={100000} sliderStep={100} onSlider={setSeed}
          numValue={seed} numMin={10} numMax={10000000} numStep={100} unit="USDT" onNum={setSeed} numW="w-24" />
        <SimSlider label="허용 손실 (계좌 대비)" sliderValue={riskPct * 10} sliderMin={5} sliderMax={100} sliderStep={5}
          onSlider={(v) => setRiskPct(v / 10)} numValue={riskPct} numMin={0.1} numMax={50} numStep={0.1} unit="%" onNum={setRiskPct} numW="w-16" />
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-[var(--text-muted)]">손절가 (USDT)</span>
            <input type="number" inputMode="decimal" value={stopStr}
              placeholder={price ? String(+(dir === 'long' ? price * 0.97 : price * 1.03).toFixed(dg)) : ''} min={0} step={priceStep}
              onChange={(e) => setStopStr(e.target.value)}
              className="w-28 bg-white/5 border border-[var(--border)] rounded-md px-1.5 py-1 text-xs font-semibold text-right text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-sky-500/50" />
          </div>
          {stopStr !== '' && !hasStop && (
            <p className="text-[10px] text-amber-400">손절가는 {dir === 'long' ? '현재가보다 낮아야' : '현재가보다 높아야'} 합니다(손실 방향).</p>
          )}
        </div>

        {hasStop ? (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label: '권장 증거금', value: fmtUsdt(recMargin, 0), sub: `${lev}배 기준` },
                { label: '권장 포지션', value: fmtUsdt(recNotion, 0), sub: price ? `${(recNotion / price).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${coin.short} · 비용 ~${fmtUsdt(estCost, 1)} 차감` : '' },
                { label: '손절 시 손실', value: `-${fmtUsdt(riskLoss, 0)}`, sub: perTradeExceeded ? `⚠ 1회 한도(-${perTradeLimit}) 초과` : `계좌의 ${riskPct}% · 손절거리 ${stopPct.toFixed(2)}%`, danger: true },
                { label: '청산 여유', value: `${safety.toFixed(1)}배`, sub: safety < 2 ? '⚠ 손절 전 청산 위험' : '손절선의 여유 거리', danger: safety < 2 },
              ].map((c) => (
                <div key={c.label} className={`rounded-xl border p-3 ${c.danger ? 'border-red-500/20 bg-red-500/5' : 'border-[var(--border)] bg-white/3'}`}>
                  <p className="text-[10px] text-[var(--text-muted)]">{c.label}</p>
                  <p className={`text-base font-bold tabular-nums mt-0.5 ${c.danger ? 'text-red-400' : 'text-[var(--text)]'}`}>{c.value}</p>
                  {c.sub && <p className={`text-[10px] mt-0.5 ${c.danger ? 'text-red-400/80' : 'text-[var(--text-muted)]'}`}>{c.sub}</p>}
                </div>
              ))}
            </div>
            {safety > 0 && safety < 2 && (
              <div className="flex items-start gap-2 text-[11px] text-red-400 bg-red-500/5 border border-red-500/20 rounded-xl px-3 py-2">
                <span>⚠</span>
                <span>청산선이 손절선의 <b>{safety.toFixed(1)}배</b> 거리밖에 안 됩니다(2배 미만 = 손절보다 먼저 강제청산될 수 있음). 배율을 <b>{safeMaxLev}배 이하</b>로 낮추면 손절이 먼저 작동합니다.</span>
              </div>
            )}
            {perTradeExceeded && (
              <div className="flex items-start gap-2 text-[11px] text-red-400 bg-red-500/5 border border-red-500/20 rounded-xl px-3 py-2">
                <span>⚠</span>
                <span>이 손절 시 손실 <b>-{fmtUsdt(riskLoss, 0)}</b>은 설정한 <b>1회 손실 한도(-{perTradeLimit} USDT)</b>를 넘습니다. 허용 손실%를 낮추거나 손절을 좁히세요. (한도는 홈 ‘오늘의 리스크’에서 설정)</span>
              </div>
            )}
          </>
        ) : (
          <p className="text-[11px] text-[var(--text-muted)] text-center py-3 border border-dashed border-[var(--border)] rounded-xl">손절가를 입력하면 권장 증거금·청산 여유가 계산됩니다.</p>
        )}
        <p className="text-[10px] text-[var(--text-muted)]">
          권장 증거금은 위 ‘배율’ 슬라이더 값을 그대로 쓴 결과입니다. 배율을 바꾸면 손실 크기는 그대로(손절 거리로 고정)이고 증거금만 달라집니다. 투자 권유가 아닙니다.
        </p>
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
                <th className="text-right px-3 py-2 text-[var(--text-muted)] font-medium">한화</th>
                <th className="text-right px-3 py-2 text-[var(--text-muted)] font-medium">증거금 대비</th>
              </tr>
            </thead>
            <tbody>
              {quickRows.map((r, i) => (
                <tr key={r.move} className={i % 2 === 1 ? 'bg-[var(--bg)]/30' : ''}>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{dir === 'long' ? '+' : '-'}{r.move}%</td>
                  <td className="px-3 py-2 text-right font-semibold text-emerald-400">+{fmtUsdt(r.pnl)}</td>
                  <td className="px-3 py-2 text-right text-emerald-400">{krwOf(r.pnl) !== null ? `+${fmtW(krwOf(r.pnl)!)}` : '-'}</td>
                  <td className="px-3 py-2 text-right text-emerald-400">+{r.roe.toFixed(0)}%</td>
                </tr>
              ))}
              {/* 청산 행 */}
              <tr className="border-t border-red-500/20 bg-red-500/5">
                <td className="px-3 py-2 text-red-400">{dir === 'long' ? '-' : '+'}{liqMovePct.toFixed(1)}% (청산)</td>
                <td className="px-3 py-2 text-right font-semibold text-red-400">-{fmtUsdt(margin)}</td>
                <td className="px-3 py-2 text-right text-red-400">{krwOf(margin) !== null ? `-${fmtW(krwOf(margin)!)}` : '-'}</td>
                <td className="px-3 py-2 text-right text-red-400">-100%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mt-3">
          청산가 = Bitget 고립마진 공식 <b>진입가 × (1 ∓ 1/배율) ÷ (1 ∓ (유지증거금률+테이커수수료 0.06%))</b>. 유지증거금률은 소액(1티어) 기준(BTC·ETH 0.4%, XRP·SOL 0.5%)이라 포지션이 커지면 상승해 청산가가 더 불리해집니다. 교차마진·펀딩비 적립은 미반영. 실제값은 거래소 설정에 따라 다릅니다. 투자 권유가 아닙니다.
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
