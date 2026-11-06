import { KR_CODE_RE } from './krCode';
export { KR_CODE_RE };

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://finance.naver.com',
  'Accept': 'application/json',
};

export async function fetchStockBasic(ticker: string) {
  const res = await fetch(
    `https://m.stock.naver.com/api/stock/${ticker}/basic`,
    { headers: HEADERS, next: { revalidate: 0 } }
  );
  if (!res.ok) throw new Error(`Stock fetch failed: ${ticker}`);
  return res.json();
}

export async function fetchStockIntegration(ticker: string) {
  const res = await fetch(
    `https://m.stock.naver.com/api/stock/${ticker}/integration`,
    { headers: { ...HEADERS }, next: { revalidate: 60 } }
  );
  if (!res.ok) throw new Error(`Integration fetch failed: ${ticker}`);
  return res.json();
}

export async function fetchMarketIndex(market: string) {
  const res = await fetch(
    `https://m.stock.naver.com/api/index/${market}/basic`,
    { headers: HEADERS, next: { revalidate: 0 } }
  );
  if (!res.ok) throw new Error(`Index fetch failed: ${market}`);
  return res.json();
}


export interface NaverAcStock { code: string; name: string; market: 'KOSPI' | 'KOSDAQ' }

/**
 * 네이버 증권 자동완성(국내 상장 종목·ETF, 키 불필요).
 * 예전 ac.finance.naver.com 은 2026-11 기준 DNS 소멸 → ac.stock.naver.com(2026-11-06 실측 200).
 * 응답 items[].{code,name,typeCode(KOSPI/KOSDAQ/NASDAQ…),nationCode}. 국내(KOR)·코스피/코스닥만 돌려준다. 실패 시 null.
 */
export async function naverAutocomplete(q: string, limit = 10): Promise<NaverAcStock[] | null> {
  const res = await fetch(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock`, {
    headers: { 'User-Agent': HEADERS['User-Agent'], Accept: 'application/json', Referer: 'https://stock.naver.com/' },
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { items?: { code?: string; name?: string; typeCode?: string; nationCode?: string }[] };
  const out: NaverAcStock[] = [];
  for (const it of json.items ?? []) {
    if (it.nationCode !== 'KOR' || !it.code || !it.name || !KR_CODE_RE.test(it.code)) continue;
    if (it.typeCode !== 'KOSPI' && it.typeCode !== 'KOSDAQ') continue;
    out.push({ code: it.code, name: it.name, market: it.typeCode });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * 네이버 fchart 일봉.
 * ⚠ `count=` 파라미터는 헤더행만 돌려준다(2026-08-24 실측). 반드시 startTime/endTime(YYYYMMDD)을 쓸 것.
 *   — 이전 버전이 count 방식이라 조용히 빈 데이터를 반환했고, 호출처가 없어 아무도 몰랐다.
 * 응답은 작은따옴표 헤더가 섞인 유사 JSON 텍스트다(파싱은 호출부 책임).
 */
export async function fetchChartData(ticker: string, startYmd: string, endYmd: string, timeframe = 'day') {
  const url = `https://fchart.stock.naver.com/siseJson.naver?symbol=${ticker}&requestType=1&startTime=${startYmd}&endTime=${endYmd}&timeframe=${timeframe}`;
  const res = await fetch(url, {
    headers: { ...HEADERS, Accept: 'text/html,application/xhtml+xml,application/xml' },
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`Chart fetch failed: ${ticker}`);
  return res.text();
}
