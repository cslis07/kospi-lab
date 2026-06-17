'use client';

import { useState } from 'react';
import useSWR from 'swr';

/* ── 타입 ──────────────────────────────────────────────── */
type RiskType   = 'safe' | 'neutral' | 'aggressive' | 'ultra';
type GoalType   = 'retirement' | 'home' | 'education' | 'wealth' | 'fire';

interface Inputs {
  age: number;
  monthly: number;
  assets: number;
  isa: boolean;
  irp: boolean;
  pension: boolean;
  risk: RiskType;
  goal: GoalType;
}

interface Asset { name: string; ratio: number; ticker: string; desc: string; color: string }
interface AccountRec { rank: number; name: string; benefit: string; limit: string; }

/* ── 추천 엔진 ─────────────────────────────────────────── */
function calcRecommendation(inp: Inputs) {
  const { age, monthly, isa, irp, pension, risk, goal } = inp;

  /* 1. 계좌 우선순위 */
  const accounts: AccountRec[] = [];
  if (!isa)     accounts.push({ rank: 1, name: 'ISA',     benefit: '배당·이자 비과세 (200만원)', limit: '연 2,000만원' });
  if (!irp)     accounts.push({ rank: 2, name: 'IRP',     benefit: '세액공제 최대 16.5%',        limit: '연 1,800만원' });
  if (!pension) accounts.push({ rank: 3, name: '연금저축', benefit: '세액공제 최대 16.5%',        limit: '연 600만원' });
  if (isa)      accounts.push({ rank: accounts.length+1, name: 'ISA (보유)', benefit: '한도 초과분 → IRP로 전환', limit: '연 2,000만원' });
  if (irp)      accounts.push({ rank: accounts.length+1, name: 'IRP (보유)', benefit: '추가 납입으로 세액공제 극대화', limit: '연 1,800만원' });
  if (pension)  accounts.push({ rank: accounts.length+1, name: '연금저축 (보유)', benefit: '추가 납입으로 세액공제 극대화', limit: '연 600만원' });

  /* 2. 자산 배분 점수 */
  const riskScore: Record<RiskType, Record<string, number>> = {
    safe:       { 'S&P500': 40, '채권': 30, '현금': 20, '금': 10 },
    neutral:    { 'S&P500': 55, '나스닥100': 20, '채권': 15, '현금': 10 },
    aggressive: { 'S&P500': 50, '나스닥100': 25, '비트코인': 15, '현금': 10 },
    ultra:      { 'S&P500': 40, '나스닥100': 25, '비트코인': 25, '현금': 10 },
  };

  // 나이 보정: 60세+ → 위험 자산 축소
  const ageFactor = Math.max(0, (60 - age) / 40);

  const rawScores = riskScore[risk];

  // 목표별 가중치
  const goalAdj: Partial<Record<string, number>> = {};
  if (goal === 'retirement' || goal === 'fire') goalAdj['채권'] = 5;
  if (goal === 'home')   goalAdj['현금'] = 10;
  if (goal === 'wealth') goalAdj['비트코인'] = 5;

  const adjusted: Record<string, number> = {};
  Object.entries(rawScores).forEach(([k, v]) => {
    adjusted[k] = Math.round(v * (k === '비트코인' || k === '나스닥100' ? ageFactor : 1) + (goalAdj[k] ?? 0));
  });
  const total = Object.values(adjusted).reduce((a, b) => a + b, 0);
  const normalized: Record<string, number> = {};
  Object.entries(adjusted).forEach(([k, v]) => { normalized[k] = Math.round((v / total) * 100); });

  // 합 100 맞추기 (반올림 오차)
  const diff = 100 - Object.values(normalized).reduce((a, b) => a + b, 0);
  const firstKey = Object.keys(normalized)[0];
  normalized[firstKey] += diff;

  /* 3. 종목 매핑 */
  const tickerMap: Record<string, { ticker: string; desc: string; color: string }> = {
    'S&P500':   { ticker: 'SPLG',  desc: 'Invesco S&P500 ETF',  color: '#3b82f6' },
    '나스닥100': { ticker: 'QQQM',  desc: 'Invesco NASDAQ100',   color: '#8b5cf6' },
    '비트코인':  { ticker: 'BTC',   desc: 'Bitcoin (spot)',      color: '#f59e0b' },
    '채권':     { ticker: 'BND',   desc: 'Vanguard 채권 ETF',   color: '#10b981' },
    '현금':     { ticker: 'CASH',  desc: 'CMA / 파킹통장',      color: '#6b7280' },
    '금':       { ticker: 'GLD',   desc: 'SPDR Gold Trust',     color: '#eab308' },
  };

  const assets: Asset[] = Object.entries(normalized).map(([name, ratio]) => ({
    name,
    ratio,
    ticker: tickerMap[name]?.ticker ?? name,
    desc:   tickerMap[name]?.desc   ?? '',
    color:  tickerMap[name]?.color  ?? '#94a3b8',
  }));

  /* 4. 월 투자금 배분 */
  const allocation = assets.map((a) => ({
    ...a,
    amount: Math.round((monthly * a.ratio) / 100 / 1000) * 1000,
  }));

  /* 5. 절세 한도 계산 */
  const taxSavings = [];
  if (!isa) taxSavings.push({ label: 'ISA 활용 시', amount: Math.min(monthly * 12, 2000000) });
  if (!irp && monthly * 12 > 1200000)
    taxSavings.push({ label: 'IRP 세액공제 (16.5%)', amount: Math.round(Math.min(monthly * 12, 1800000) * 0.165) });
  if (!pension && monthly * 12 > 600000)
    taxSavings.push({ label: '연금저축 세액공제 (16.5%)', amount: Math.round(Math.min(600000, monthly * 12) * 0.165) });

  return { accounts, assets, allocation, taxSavings };
}

/* ── 컴포넌트 ──────────────────────────────────────────── */
const fmtW = (n: number) =>
  n >= 100000000 ? `${(n/100000000).toFixed(1)}억` :
  n >= 10000     ? `${(n/10000).toFixed(0)}만원` : `${n.toLocaleString()}원`;

const RISK_LABELS: Record<RiskType, string> = {
  safe: '안정형', neutral: '중립형', aggressive: '공격형', ultra: '초공격형',
};
const GOAL_LABELS: Record<GoalType, string> = {
  retirement: '노후준비', home: '내집마련', education: '자녀교육', wealth: '자산증식', fire: 'FIRE',
};

/* ── 성향별 대표 국내 우량주 (KIS 재무지표 + KRX 시세) ───── */
interface Pick {
  code: string; name: string; tag: string;
  roe: number | null; debtRatio: number | null; revenueGrowth: number | null; eps: number | null;
}
interface BatchQuote { price: number; changeRate: number }

const swrFetch = (u: string) => fetch(u).then((r) => r.json());

function StockPicks({ risk }: { risk: RiskType }) {
  const { data, isLoading } = useSWR<Pick[]>(
    `/api/invest/picks?risk=${risk}`, swrFetch, { revalidateOnFocus: false },
  );
  const codes = Array.isArray(data) ? data.map((p) => p.code).join(',') : '';
  const { data: prices } = useSWR<Record<string, BatchQuote>>(
    codes ? `/api/stock/batch?tickers=${codes}` : null, swrFetch, { revalidateOnFocus: false },
  );

  const Metric = ({ label, value, good }: { label: string; value: string; good?: boolean | null }) => (
    <div className="text-center">
      <p className="text-[9px] text-[var(--text-muted)]">{label}</p>
      <p className={`text-xs font-bold tabular-nums ${good === true ? 'text-emerald-400' : good === false ? 'text-red-400' : 'text-[var(--text)]'}`}>{value}</p>
    </div>
  );

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h2 className="text-sm font-semibold text-[var(--text)] mb-1">
        성향 맞춤 국내 우량주{' '}
        <span className="text-[var(--text-muted)] font-normal text-xs">({RISK_LABELS[risk]} · 실시간 KIS)</span>
      </h2>
      <p className="text-[11px] text-[var(--text-muted)] mb-3">각 성향의 대표 종목을 실시간 재무지표로 보여줍니다 · 투자 참고용</p>

      {isLoading || !Array.isArray(data) ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((p) => {
            const px   = prices?.[p.code];
            const up   = (px?.changeRate ?? 0) >= 0;
            const per  = px && p.eps && p.eps > 0 ? px.price / p.eps : null;
            // 우량 점수: ROE≥10 · 부채<100 · 매출성장>0 · PER 0~35 (보유 지표만 평가)
            const checks = [
              p.roe != null ? p.roe >= 10 : null,
              p.debtRatio != null ? p.debtRatio < 100 : null,
              p.revenueGrowth != null ? p.revenueGrowth > 0 : null,
              per != null ? per > 0 && per < 35 : null,
            ];
            const known = checks.filter((c) => c != null).length;
            const score = checks.filter((c) => c === true).length;
            const scoreColor =
              known === 0 ? 'bg-white/5 text-[var(--text-muted)] border-[var(--border)]' :
              score / known >= 0.75 ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
              score / known >= 0.5  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                                      'bg-red-500/15 text-red-400 border-red-500/30';
            return (
              <a key={p.code} href={`/stock/${p.code}`}
                className="block rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 hover:border-sky-500/40 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[var(--text)]">{p.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">{p.tag}</span>
                    {known > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${scoreColor}`}>
                        우량 {score}/{known}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-[var(--text)]">
                      {px ? `${px.price.toLocaleString()}원` : '-'}
                    </p>
                    {px && (
                      <p className={`text-[11px] font-semibold ${up ? 'text-red-400' : 'text-blue-400'}`}>
                        {up ? '▲' : '▼'} {Math.abs(px.changeRate).toFixed(2)}%
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1 pt-2 border-t border-[var(--border)]">
                  <Metric label="PER"     value={per != null && per > 0 ? `${per.toFixed(1)}배` : '-'} />
                  <Metric label="ROE"     value={p.roe != null ? `${p.roe.toFixed(1)}%` : '-'} good={p.roe != null ? p.roe >= 10 : null} />
                  <Metric label="부채비율" value={p.debtRatio != null ? `${p.debtRatio.toFixed(0)}%` : '-'} good={p.debtRatio != null ? p.debtRatio < 100 : null} />
                  <Metric label="매출성장" value={p.revenueGrowth != null ? `${p.revenueGrowth > 0 ? '+' : ''}${p.revenueGrowth.toFixed(0)}%` : '-'} good={p.revenueGrowth != null ? p.revenueGrowth > 0 : null} />
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function InvestPage() {
  const [step, setStep] = useState<'input' | 'result'>('input');
  const [inp, setInp] = useState<Inputs>({
    age: 35, monthly: 500000, assets: 10000000,
    isa: false, irp: false, pension: false,
    risk: 'aggressive', goal: 'wealth',
  });
  const [result, setResult] = useState<ReturnType<typeof calcRecommendation> | null>(null);

  const run = () => {
    setResult(calcRecommendation(inp));
    setStep('result');
  };

  /* ── 도넛 차트 (SVG) ─────────────────────────────────── */
  const DonutChart = ({ assets }: { assets: Asset[] }) => {
    const size = 160; const cx = size / 2; const cy = size / 2; const r = 60; const gap = 2;
    let cumAngle = -90;
    const slices = assets.map((a) => {
      const angle = (a.ratio / 100) * 360;
      const start = cumAngle;
      cumAngle += angle + gap;
      return { ...a, startAngle: start, sweepAngle: angle - gap };
    });
    const polarToXY = (angle: number, radius: number) => ({
      x: cx + radius * Math.cos((angle * Math.PI) / 180),
      y: cy + radius * Math.sin((angle * Math.PI) / 180),
    });
    return (
      <svg viewBox={`0 0 ${size} ${size}`} className="w-40 h-40">
        {slices.map((s, i) => {
          if (s.sweepAngle <= 0) return null;
          const s1 = polarToXY(s.startAngle, r);
          const e1 = polarToXY(s.startAngle + s.sweepAngle, r);
          const large = s.sweepAngle > 180 ? 1 : 0;
          const s2 = polarToXY(s.startAngle, r - 22);
          const e2 = polarToXY(s.startAngle + s.sweepAngle, r - 22);
          const d = `M ${s1.x} ${s1.y} A ${r} ${r} 0 ${large} 1 ${e1.x} ${e1.y} L ${e2.x} ${e2.y} A ${r-22} ${r-22} 0 ${large} 0 ${s2.x} ${s2.y} Z`;
          return <path key={i} d={d} fill={s.color} opacity={0.9} />;
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-[var(--text)] text-[10px] font-bold"
          style={{ fontSize: 10, fontWeight: 700 }}>포트폴리오</text>
        <text x={cx} y={cy + 10} textAnchor="middle"
          style={{ fontSize: 8, fill: 'var(--text-muted)' }}>분산투자</text>
      </svg>
    );
  };

  /* ── 입력 화면 ──────────────────────────────────────── */
  if (step === 'input') return (
    <div className="max-w-lg mx-auto pb-12">
      <h1 className="text-xl font-bold text-[var(--text)] mb-1">투자 설계 마법사</h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">나이·금액·성향을 입력하면 최적 계좌·종목을 추천합니다</p>

      <div className="space-y-5">
        {/* 기본 정보 */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--text)]">기본 정보</h2>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--text-muted)]">나이</span>
            <div className="flex items-center gap-3">
              <input type="range" min={20} max={70} value={inp.age}
                onChange={(e) => setInp({ ...inp, age: +e.target.value })}
                className="flex-1 accent-sky-500" />
              <span className="text-sm font-semibold text-[var(--text)] w-10 text-right">{inp.age}세</span>
            </div>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--text-muted)]">월 투자 가능 금액</span>
            <div className="flex items-center gap-3">
              <input type="range" min={50000} max={5000000} step={50000} value={inp.monthly}
                onChange={(e) => setInp({ ...inp, monthly: +e.target.value })}
                className="flex-1 accent-sky-500" />
              <span className="text-sm font-semibold text-[var(--text)] w-20 text-right">{fmtW(inp.monthly)}</span>
            </div>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--text-muted)]">현재 보유 자산</span>
            <div className="flex items-center gap-3">
              <input type="range" min={0} max={500000000} step={1000000} value={inp.assets}
                onChange={(e) => setInp({ ...inp, assets: +e.target.value })}
                className="flex-1 accent-sky-500" />
              <span className="text-sm font-semibold text-[var(--text)] w-20 text-right">{fmtW(inp.assets)}</span>
            </div>
          </label>
        </div>

        {/* 계좌 보유 여부 */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-3">보유 계좌</h2>
          <div className="grid grid-cols-3 gap-2">
            {(['isa','irp','pension'] as const).map((key) => {
              const label = key === 'isa' ? 'ISA' : key === 'irp' ? 'IRP' : '연금저축';
              return (
                <button key={key} onClick={() => setInp({ ...inp, [key]: !inp[key] })}
                  className={`py-3 rounded-xl border text-sm font-medium transition-all ${
                    inp[key]
                      ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}>
                  {inp[key] ? '✓ ' : ''}{label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 투자 성향 */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-3">투자 성향</h2>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(RISK_LABELS) as RiskType[]).map((r) => (
              <button key={r} onClick={() => setInp({ ...inp, risk: r })}
                className={`py-3 rounded-xl border text-sm font-medium transition-all ${
                  inp.risk === r
                    ? 'border-violet-500 bg-violet-500/10 text-violet-400'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}>
                {RISK_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        {/* 투자 목표 */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-3">투자 목표</h2>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(GOAL_LABELS) as GoalType[]).map((g) => (
              <button key={g} onClick={() => setInp({ ...inp, goal: g })}
                className={`py-2.5 rounded-xl border text-xs font-medium transition-all ${
                  inp.goal === g
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}>
                {GOAL_LABELS[g]}
              </button>
            ))}
          </div>
        </div>

        <button onClick={run}
          className="w-full py-4 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-sm transition-colors shadow-lg shadow-sky-500/20">
          투자 설계 시작 →
        </button>
      </div>
    </div>
  );

  /* ── 결과 화면 ──────────────────────────────────────── */
  if (!result) return null;
  const { accounts, assets, allocation, taxSavings } = result;

  return (
    <div className="max-w-lg mx-auto pb-12">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setStep('input')}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
          ← 다시 설계
        </button>
        <h1 className="text-xl font-bold text-[var(--text)]">투자 설계 결과</h1>
        <span className="ml-auto text-xs text-[var(--text-muted)] bg-[var(--border)] px-2 py-0.5 rounded-full">
          {RISK_LABELS[inp.risk]} · {GOAL_LABELS[inp.goal]}
        </span>
      </div>

      <div className="space-y-4">
        {/* 추천 계좌 */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-3">추천 계좌 순위</h2>
          <div className="space-y-2">
            {accounts.slice(0, 3).map((a) => (
              <div key={a.name} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)]">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                  a.rank === 1 ? 'bg-amber-500' : a.rank === 2 ? 'bg-slate-400' : 'bg-amber-700'
                }`}>{a.rank}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[var(--text)]">{a.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">{a.benefit}</p>
                </div>
                <span className="text-xs text-[var(--text-muted)]">{a.limit}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 자산 배분 도넛 */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-4">추천 자산 배분</h2>
          <div className="flex items-center gap-6">
            <DonutChart assets={assets} />
            <div className="flex-1 space-y-2">
              {assets.map((a) => (
                <div key={a.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                  <span className="text-xs text-[var(--text)] flex-1">{a.name}</span>
                  <span className="text-xs font-semibold text-[var(--text)]">{a.ratio}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 월 투자금 배분 */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-1">매월 투자금 배분</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">총 {fmtW(inp.monthly)}/월</p>
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
                  <th className="text-left px-3 py-2 text-xs text-[var(--text-muted)] font-medium">종목</th>
                  <th className="text-left px-3 py-2 text-xs text-[var(--text-muted)] font-medium">티커</th>
                  <th className="text-right px-3 py-2 text-xs text-[var(--text-muted)] font-medium">금액</th>
                </tr>
              </thead>
              <tbody>
                {allocation.map((a, i) => (
                  <tr key={a.name} className={i < allocation.length - 1 ? 'border-b border-[var(--border)]' : ''}>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: a.color }} />
                        <span className="text-[var(--text)] font-medium">{a.name}</span>
                      </div>
                      <p className="text-xs text-[var(--text-muted)] pl-4">{a.desc}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[var(--text-muted)] font-mono">{a.ticker}</td>
                    <td className="px-3 py-2.5 text-right text-sm font-semibold text-[var(--text)]">
                      {fmtW(a.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 성향 맞춤 국내 우량주 (실시간 KIS) */}
        <StockPicks risk={inp.risk} />

        {/* 절세 효과 */}
        {taxSavings.length > 0 && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
            <h2 className="text-sm font-semibold text-emerald-400 mb-3">예상 절세 효과 (연간)</h2>
            <div className="space-y-2">
              {taxSavings.map((t) => (
                <div key={t.label} className="flex justify-between items-center">
                  <span className="text-xs text-[var(--text-muted)]">{t.label}</span>
                  <span className="text-sm font-bold text-emerald-400">+{fmtW(t.amount)}</span>
                </div>
              ))}
              <div className="border-t border-emerald-500/20 pt-2 flex justify-between">
                <span className="text-xs font-semibold text-[var(--text)]">총 절세 예상액</span>
                <span className="text-base font-bold text-emerald-400">
                  +{fmtW(taxSavings.reduce((s, t) => s + t.amount, 0))}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 다음 단계 */}
        <div className="grid grid-cols-2 gap-3">
          <a href="/tax"
            className="flex flex-col items-center py-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-sky-500/30 transition-colors">
            <span className="text-lg mb-1">🧾</span>
            <span className="text-xs font-semibold text-[var(--text)]">세제혜택 계산</span>
            <span className="text-[10px] text-[var(--text-muted)]">정확한 환급액 계산</span>
          </a>
          <a href="/simulate"
            className="flex flex-col items-center py-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-sky-500/30 transition-colors">
            <span className="text-lg mb-1">📈</span>
            <span className="text-xs font-semibold text-[var(--text)]">수익 시뮬레이션</span>
            <span className="text-[10px] text-[var(--text-muted)]">복리 계산기</span>
          </a>
        </div>
      </div>
    </div>
  );
}
