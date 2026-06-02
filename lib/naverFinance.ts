/**
 * Naver Finance 모바일 API — 한국 주식 재무 데이터
 *
 * 실제 응답 구조 (2026-06-02 디버그 확인):
 * ─ basic endpoint:
 *     stockName, closePrice (콤마 포함 문자열)
 *     stockExchangeType.code: "KS"=KOSPI, "KQ"=KOSDAQ
 *     ※ per/pbr/marketValue 없음 → finance/annual에서 가져옴
 *
 * ─ finance/annual endpoint:
 *     financeInfo.trTitleList[{isConsensus, key}]  (key = "202312" 등)
 *     financeInfo.rowList[{title, columns: {[key]: {value, cx}}}]
 *     단위: 매출액·영업이익·당기순이익 = 억원 / 비율(%)/PER·PBR(배)/EPS·BPS(원)
 */

export interface NaverData {
  code: string;
  name: string;
  market: string;    // 'KOSPI' | 'KOSDAQ'
  yfSuffix: string;  // '.KS' | '.KQ'  ← Yahoo Finance 티커 접미사
  price: number;
  marketCap: number; // 원 (EPS 기반 추정)
  per: number | null;
  pbr: number | null;
  roe: number | null;        // %
  debtRatio: number | null;  // %
  opMargin: number | null;   // % (영업이익률)
  revenue: number | null;       // 원
  prevRevenue: number | null;   // 원 (전년도)
  operatingProfit: number | null; // 원
  netIncome: number | null;     // 원
}

const BASE = 'https://m.stock.naver.com/api/stock';
const HDR: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
    'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  Referer: 'https://m.stock.naver.com/',
  Origin: 'https://m.stock.naver.com',
};

async function nGet(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, {
      headers: HDR,
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** 콤마 포함 숫자 문자열 → number | null */
function numStr(v: string | null | undefined): number | null {
  if (!v || v === '-') return null;
  const n = parseFloat(v.replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

/** finance/annual rowList에서 제목으로 해당 연도의 값을 추출 */
type RowList = Array<{ title: string; columns: Record<string, { value: string }> }>;

function getRow(rowList: RowList, title: string, key: string): number | null {
  const row = rowList.find((r) => r.title === title);
  return numStr(row?.columns?.[key]?.value);
}

// ── 캐시 ────────────────────────────────────────────────────────────────────
const _cache = new Map<string, { d: NaverData; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1h

export async function fetchNaverData(code: string): Promise<NaverData | null> {
  const cached = _cache.get(code);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.d;

  // 1) basic — 이름, 현재가, 시장 구분
  const basic = (await nGet(`${BASE}/${code}/basic`)) as Record<string, unknown> | null;
  if (!basic?.stockName) return null;

  const price = numStr(String(basic.closePrice ?? '')) ?? 0;
  const exType = basic.stockExchangeType as Record<string, string> | null;
  const exCode = exType?.code ?? 'KS'; // "KS"=KOSPI, "KQ"=KOSDAQ
  const yfSuffix = exCode === 'KQ' ? '.KQ' : '.KS';
  const market = exCode === 'KQ' ? 'KOSDAQ' : 'KOSPI';

  // 2) finance/annual — 재무제표 (rowList 구조)
  const annualRes = (await nGet(`${BASE}/${code}/finance/annual`)) as Record<string, unknown> | null;
  const fi = annualRes?.financeInfo as Record<string, unknown> | null;

  const trList = (fi?.trTitleList as Array<{ isConsensus: string; key: string }>) ?? [];
  const rowList: RowList = (fi?.rowList as RowList) ?? [];

  // 가장 최근 확정(non-consensus) 연도 키
  const actual = trList.filter((t) => t.isConsensus === 'N');
  const latestKey = actual[actual.length - 1]?.key ?? '';
  const prevKey   = actual[actual.length - 2]?.key ?? '';

  const UNIT = 1e8; // 억원 → 원

  const revenueRaw  = getRow(rowList, '매출액',    latestKey);
  const prevRevRaw  = getRow(rowList, '매출액',    prevKey);
  const opProfitRaw = getRow(rowList, '영업이익',  latestKey);
  const netIncRaw   = getRow(rowList, '당기순이익', latestKey);
  const opMargin    = getRow(rowList, '영업이익률', latestKey); // 이미 %
  const roe         = getRow(rowList, 'ROE',       latestKey); // 이미 %
  const debtRatio   = getRow(rowList, '부채비율',   latestKey); // 이미 %
  const per         = getRow(rowList, 'PER',       latestKey); // 배수
  const pbr         = getRow(rowList, 'PBR',       latestKey); // 배수
  const eps         = getRow(rowList, 'EPS',       latestKey); // 원/주

  // 시가총액 추정: 주식수 = 당기순이익(억원)×1e8 / EPS(원)
  const sharesEst =
    netIncRaw != null && eps != null && eps > 0
      ? (netIncRaw * UNIT) / eps
      : null;
  const marketCap = price > 0 && sharesEst != null ? price * sharesEst : 0;

  const result: NaverData = {
    code,
    name: String(basic.stockName),
    market,
    yfSuffix,
    price,
    marketCap,
    per,
    pbr,
    roe,
    debtRatio,
    opMargin,
    revenue:         revenueRaw  != null ? revenueRaw  * UNIT : null,
    prevRevenue:     prevRevRaw  != null ? prevRevRaw  * UNIT : null,
    operatingProfit: opProfitRaw != null ? opProfitRaw * UNIT : null,
    netIncome:       netIncRaw   != null ? netIncRaw   * UNIT : null,
  };

  _cache.set(code, { d: result, ts: Date.now() });
  return result;
}
