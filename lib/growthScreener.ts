/**
 * 성장주·기대주 스크리너 — 데이터 수집 + 점수화.
 *
 * 데이터: 네이버 finance/annual 1콜/종목.
 *  - 확정 3개년(매출·영업이익·순이익·EPS·PER·ROE·부채비율·영업이익률)
 *  - 컨센서스 1개년(애널리스트 추정 — 매출·영업이익·EPS·PER=포워드PER)
 *    ※ 미커버 종목(주로 소형주)은 컨센서스 열이 전부 '-' → 기대 점수 없음으로 처리
 *    ※ 적자 기업은 PER 가 음수로 온다 → 밸류에이션 점수에서 제외
 *
 * 점수(scoreGrowth)는 순수 함수 — tests/engine.test.ts 에서 고정한다.
 */

export interface GrowthFinance {
  code: string;
  /** 확정 연도 키 (과거→최근), 최대 3개 */
  years: string[];
  /** 컨센서스 연도 키 (없으면 null) */
  consensusYear: string | null;
  revenue: (number | null)[];        // 억원, years 순서
  opProfit: (number | null)[];
  netIncome: (number | null)[];
  eps: (number | null)[];
  roe: (number | null)[];
  opMargin: (number | null)[];
  per: (number | null)[];
  debtRatio: (number | null)[];
  /** 컨센서스 값 (연도 없으면 전부 null) */
  cRevenue: number | null;
  cOpProfit: number | null;
  cNetIncome: number | null;
  cEps: number | null;
  cPer: number | null;               // = 포워드 PER (네이버가 현재가 기준으로 계산)
}

export interface GrowthScore {
  total: number;                     // 0~100
  parts: {
    growth: number;                  // 확정 성장 (35)
    outlook: number;                 // 미래 기대 — 컨센서스 (30)
    quality: number;                 // 수익성 (15)
    valuation: number;               // 밸류에이션·안정 (20)
  };
  /** 판단 근거 지표 (UI 표시용) */
  metrics: {
    revYoY: number | null;           // 최근 확정 매출 YoY %
    opYoY: number | null;            // 최근 확정 영업이익 YoY %
    revYoYPrev: number | null;       // 직전 연도 매출 YoY % (지속성)
    cRevGrowth: number | null;       // 컨센서스 매출 성장 %
    cOpGrowth: number | null;        // 컨센서스 영업이익 성장 %
    cEpsGrowth: number | null;       // 컨센서스 EPS 성장 %
    trailingPer: number | null;
    forwardPer: number | null;
    peg: number | null;              // fwdPER ÷ 컨센서스 EPS 성장%
    roe: number | null;
    opMarginTrend: number | null;    // 영업이익률 변화 %p (최근-직전)
    debtRatio: number | null;
  };
  badges: string[];                  // 고성장 · 기대주 · 턴어라운드 · 저평가성장
  hasConsensus: boolean;
  warnings: string[];
}

/* ── 수집 ──────────────────────────────────────────────── */

const BASE = 'https://m.stock.naver.com/api/stock';
const HDR: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
    'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://m.stock.naver.com/',
};

function numStr(v: string | null | undefined): number | null {
  if (!v || v === '-') return null;
  const n = parseFloat(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

type RowList = Array<{ title: string; columns: Record<string, { value: string }> }>;

/* 재무는 분기 단위로만 갱신 → 12시간 캐시. 실패는 캐시하지 않는다 */
const FIN_TTL = 12 * 60 * 60 * 1000;
const MAX_KEYS = 3000;
const _cache = new Map<string, { d: GrowthFinance; ts: number }>();

export async function fetchGrowthFinance(code: string): Promise<GrowthFinance | null> {
  const hit = _cache.get(code);
  if (hit && Date.now() - hit.ts < FIN_TTL) return hit.d;

  let json: unknown;
  try {
    const res = await fetch(`${BASE}/${code}/finance/annual`, {
      headers: HDR, cache: 'no-store', signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    json = await res.json();
  } catch { return null; }

  const fi = (json as { financeInfo?: unknown })?.financeInfo as Record<string, unknown> | null;
  const trList = (fi?.trTitleList as Array<{ isConsensus: string; key: string }>) ?? [];
  const rowList: RowList = (fi?.rowList as RowList) ?? [];
  if (!trList.length || !rowList.length) return null;

  const actualKeys = trList.filter((t) => t.isConsensus === 'N').map((t) => t.key).slice(-3);
  const cKeyRaw = trList.find((t) => t.isConsensus === 'Y')?.key ?? null;
  if (!actualKeys.length) return null;

  const row = (title: string) => rowList.find((r) => r.title === title);
  const series = (title: string) => {
    const r = row(title);
    return actualKeys.map((k) => numStr(r?.columns?.[k]?.value));
  };
  const cVal = (title: string) => (cKeyRaw ? numStr(row(title)?.columns?.[cKeyRaw]?.value) : null);

  const d: GrowthFinance = {
    code,
    years: actualKeys,
    revenue: series('매출액'),
    opProfit: series('영업이익'),
    netIncome: series('당기순이익'),
    eps: series('EPS'),
    roe: series('ROE'),
    opMargin: series('영업이익률'),
    per: series('PER'),
    debtRatio: series('부채비율'),
    cRevenue: cVal('매출액'),
    cOpProfit: cVal('영업이익'),
    cNetIncome: cVal('당기순이익'),
    cEps: cVal('EPS'),
    cPer: cVal('PER'),
    // 컨센서스 연도 키가 있어도 값이 전부 '-' 인 미커버 종목이 있다 → 값 기준으로 판정
    consensusYear: null,
  };
  d.consensusYear =
    cKeyRaw && (d.cRevenue != null || d.cOpProfit != null || d.cEps != null) ? cKeyRaw : null;

  if (_cache.size >= MAX_KEYS) {
    const now = Date.now();
    for (const [k, v] of _cache) if (now - v.ts >= FIN_TTL) _cache.delete(k);
    if (_cache.size >= MAX_KEYS) _cache.delete(_cache.keys().next().value as string);
  }
  _cache.set(code, { d, ts: Date.now() });
  return d;
}

/* ── 점수화 (순수 함수) ────────────────────────────────── */

/** 증가율 % (전기가 0·null 이면 null). 이상치 방지로 ±300% 클램프 */
export function growthPct(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  const g = ((cur - prev) / Math.abs(prev)) * 100;
  return Math.max(-300, Math.min(300, Math.round(g * 10) / 10));
}

/** 값을 [0, max] 사이 선형 점수로 (lo 이하 0점, hi 이상 만점) */
function scale(v: number | null, lo: number, hi: number, max: number): number {
  if (v == null) return 0;
  if (v <= lo) return 0;
  if (v >= hi) return max;
  return Math.round(((v - lo) / (hi - lo)) * max * 10) / 10;
}

export function scoreGrowth(f: GrowthFinance): GrowthScore {
  const n = f.years.length;
  const last = n - 1;
  const warnings: string[] = [];

  const revYoY = n >= 2 ? growthPct(f.revenue[last], f.revenue[last - 1]) : null;
  const opYoY = n >= 2 ? growthPct(f.opProfit[last], f.opProfit[last - 1]) : null;
  const revYoYPrev = n >= 3 ? growthPct(f.revenue[last - 1], f.revenue[last - 2]) : null;

  const hasConsensus = f.consensusYear != null;
  const cRevGrowth = hasConsensus ? growthPct(f.cRevenue, f.revenue[last]) : null;
  const cOpGrowth = hasConsensus ? growthPct(f.cOpProfit, f.opProfit[last]) : null;
  const cEpsGrowth = hasConsensus ? growthPct(f.cEps, f.eps[last]) : null;

  const trailingPer = f.per[last] != null && f.per[last]! > 0 ? f.per[last] : null;
  const forwardPer = f.cPer != null && f.cPer > 0 ? f.cPer : null;
  // PEG = 포워드 PER ÷ 컨센서스 EPS 성장률(%) — 성장 대비 가격.
  // 성장이 0 이하이거나 **기준 EPS 가 적자**면 성장률 자체가 무의미하므로 계산하지 않는다
  // (적자 -160 → +60 을 "137% 성장"으로 읽으면 턴어라운드가 초저PEG 로 둔갑한다)
  const epsBasePositive = f.eps[last] != null && f.eps[last]! > 0;
  const peg =
    forwardPer != null && cEpsGrowth != null && cEpsGrowth > 0 && epsBasePositive
      ? Math.round((forwardPer / cEpsGrowth) * 100) / 100
      : null;

  const roe = f.roe[last];
  const opMarginTrend =
    n >= 2 && f.opMargin[last] != null && f.opMargin[last - 1] != null
      ? Math.round((f.opMargin[last]! - f.opMargin[last - 1]!) * 10) / 10
      : null;
  const debtRatio = f.debtRatio[last];

  /* 1) 확정 성장 35 — 매출 15 + 영업이익 12 + 2년 연속 성장 8 */
  let growth = scale(revYoY, 0, 20, 15) + scale(opYoY, 0, 25, 12);
  if (revYoY != null && revYoYPrev != null && revYoY > 0 && revYoYPrev > 0) {
    growth += revYoY >= revYoYPrev ? 8 : 5;   // 가속 8 / 지속 5
  }
  growth = Math.min(35, Math.round(growth * 10) / 10);

  /* 2) 미래 기대 30 — 컨센서스 매출 12 + 영업이익 12 + 흑자전환 6 */
  let outlook = 0;
  if (hasConsensus) {
    outlook = scale(cRevGrowth, 0, 25, 12) + scale(cOpGrowth, 0, 35, 12);
    const turnaround =
      f.opProfit[last] != null && f.opProfit[last]! < 0 && f.cOpProfit != null && f.cOpProfit > 0;
    if (turnaround) outlook += 6;
  } else {
    warnings.push('애널리스트 컨센서스 없음 — 미래 기대 점수 제외(미커버 종목)');
  }
  outlook = Math.min(30, Math.round(outlook * 10) / 10);

  /* 3) 수익성 15 — ROE 8 + 영업이익률 개선 7 */
  const quality = Math.min(15, Math.round((scale(roe, 0, 15, 8) + scale(opMarginTrend, 0, 3, 7)) * 10) / 10);

  /* 4) 밸류에이션·안정 20 — PEG 12 + 포워드<트레일링 4 + 부채비율 4 */
  let valuation = 0;
  if (peg != null) {
    valuation += peg < 0.5 ? 12 : peg < 1 ? 9 : peg < 1.5 ? 6 : peg < 2 ? 3 : 0;
  } else if (trailingPer == null && f.eps[last] != null && f.eps[last]! < 0) {
    warnings.push('적자 기업 — PER·PEG 밸류에이션 평가 불가');
  }
  if (forwardPer != null && trailingPer != null && forwardPer < trailingPer) valuation += 4;
  if (debtRatio != null && debtRatio < 150) valuation += debtRatio < 80 ? 4 : 2;
  valuation = Math.min(20, valuation);

  /* 배지 */
  const badges: string[] = [];
  if (revYoY != null && opYoY != null && revYoY >= 20 && opYoY >= 20) badges.push('고성장');
  if ((cOpGrowth != null && cOpGrowth >= 30) || (cRevGrowth != null && cRevGrowth >= 20)) badges.push('기대주');
  if (f.opProfit[last] != null && f.opProfit[last]! < 0 && f.cOpProfit != null && f.cOpProfit > 0) badges.push('턴어라운드');
  if (peg != null && peg < 1 && revYoY != null && revYoY > 0) badges.push('저평가성장');

  if (f.opProfit[last] != null && f.opProfit[last]! < 0 && !badges.includes('턴어라운드')) {
    warnings.push('최근 확정 영업이익 적자 — 성장률 수치 해석 주의');
  }

  const total = Math.min(100, Math.round((growth + outlook + quality + valuation) * 10) / 10);
  return {
    total,
    parts: { growth, outlook, quality, valuation },
    metrics: {
      revYoY, opYoY, revYoYPrev, cRevGrowth, cOpGrowth, cEpsGrowth,
      trailingPer, forwardPer, peg, roe, opMarginTrend, debtRatio,
    },
    badges, hasConsensus, warnings,
  };
}
