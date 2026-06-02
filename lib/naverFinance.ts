/**
 * Naver Finance 모바일 API — 한국 주식 재무 데이터
 * Base: https://m.stock.naver.com/api/stock/{code}/...
 *
 * Naver Finance가 Vercel에서 차단될 경우 자동으로 null 반환 (Yahoo Finance 폴백).
 */

export interface NaverData {
  code: string;
  name: string;
  market: string;      // 'KOSPI' | 'KOSDAQ'
  price: number;
  marketCap: number;   // 원 단위
  per: number | null;
  pbr: number | null;
  roe: number | null;           // %
  debtRatio: number | null;    // % (부채/자본)
  revenue: number | null;       // 원
  prevRevenue: number | null;   // 원 (전년)
  operatingProfit: number | null; // 원
  netIncome: number | null;     // 원
}

const BASE = 'https://m.stock.naver.com/api/stock';

// 모바일 User-Agent — 더 많은 CDN 엣지에서 허용되는 경향
const HDR: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
    'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
  Referer: 'https://m.stock.naver.com/',
  Origin: 'https://m.stock.naver.com',
};

async function nGet(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, {
      headers: HDR,
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** 문자열/숫자/null 을 number | null 로 변환 */
function n(v: unknown): number | null {
  if (v == null) return null;
  const x =
    typeof v === 'string'
      ? parseFloat(v.replace(/[^0-9.-]/g, ''))
      : Number(v);
  return isFinite(x) ? x : null;
}

/** 여러 경로 중 첫 번째 non-null 반환 */
function first(...vals: (number | null | undefined)[]): number | null {
  for (const v of vals) {
    if (v != null) return v as number;
  }
  return null;
}

/** annual 배열 파싱 — Naver 응답 구조가 버전마다 다를 수 있으므로 복수 경로 시도 */
function extractAnnuals(data: unknown): unknown[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;
  const candidates = [
    d?.financeInfo,
    d,
  ];
  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue;
    const obj = c as Record<string, unknown>;
    for (const key of ['annual', 'annualFinancialInfoList', 'annualList']) {
      const list = obj[key];
      if (Array.isArray(list) && list.length > 0) return list;
    }
  }
  if (Array.isArray(data)) return data;
  return [];
}

/** annual row에서 필드를 추출 — 중첩 구조 대응 */
function fromAnnual(row: unknown, ...keys: string[]): number | null {
  if (!row || typeof row !== 'object') return null;
  const obj = row as Record<string, unknown>;
  // Flat fields
  for (const k of keys) {
    const v = n(obj[k]);
    if (v != null) return v;
  }
  // Nested in basicFinancialInfo / investmentIndexFinancialInfo
  for (const sub of ['basicFinancialInfo', 'investmentIndexFinancialInfo']) {
    const nested = obj[sub];
    if (!nested || typeof nested !== 'object') continue;
    const nestedObj = nested as Record<string, unknown>;
    for (const k of keys) {
      const v = n(nestedObj[k]);
      if (v != null) return v;
    }
  }
  return null;
}

// ── 캐시 ──────────────────────────────────────────────────────────────────────
const _cache = new Map<string, { d: NaverData; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1h

export async function fetchNaverData(code: string): Promise<NaverData | null> {
  // 캐시 확인
  const cached = _cache.get(code);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.d;

  // 1) 기본 정보 (가격, 시가총액, PER, PBR)
  const basic = await nGet(`${BASE}/${code}/basic`) as Record<string, unknown> | null;
  if (!basic?.stockName) return null;  // 접근 불가 or 종목 없음

  const price = n(basic.closePrice) ?? 0;
  const marketCap = n(basic.marketValue) ?? 0;

  // 2) 연간 재무제표 (ROE, 부채비율, 매출, 영업이익, 순이익)
  let annuals: unknown[] = [];
  for (const ep of [
    'finance/annual',
    'finance/summary',
    'finance/financial',
    'finance/info',
  ]) {
    const data = await nGet(`${BASE}/${code}/${ep}`);
    const list = extractAnnuals(data);
    if (list.length > 0) { annuals = list; break; }
  }

  const a0 = annuals[0] ?? {};
  const a1 = annuals[1] ?? {};

  // Naver financial values are in 억원 (100 million KRW) → multiply by 1e8 for 원
  const UNIT = 1e8;
  const revenueRaw    = fromAnnual(a0, 'revenue', 'sales', 'totalRevenue');
  const prevRevRaw    = fromAnnual(a1, 'revenue', 'sales', 'totalRevenue');
  const opProfitRaw   = fromAnnual(a0, 'operatingProfit', 'operatingIncome');
  const netIncomeRaw  = fromAnnual(a0, 'netProfit', 'netIncome', 'netIncomeToCommon');

  const result: NaverData = {
    code,
    name: String(basic.stockName),
    market: (basic.stockExchangeType as Record<string, unknown>)?.code as string ?? '',
    price,
    marketCap,
    per: first(n(basic.per), fromAnnual(a0, 'per', 'PER')),
    pbr: first(n(basic.pbr), fromAnnual(a0, 'pbr', 'PBR')),
    roe: fromAnnual(a0, 'roe', 'ROE'),
    debtRatio: fromAnnual(a0, 'debtRatio', 'debtEquityRatio', 'liabilityToEquity'),
    revenue:       revenueRaw  != null ? revenueRaw  * UNIT : null,
    prevRevenue:   prevRevRaw  != null ? prevRevRaw  * UNIT : null,
    operatingProfit: opProfitRaw != null ? opProfitRaw * UNIT : null,
    netIncome:     netIncomeRaw != null ? netIncomeRaw * UNIT : null,
  };

  _cache.set(code, { d: result, ts: Date.now() });
  return result;
}
