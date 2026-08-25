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

export async function searchStocks(query: string) {
  const url = `https://ac.finance.naver.com/ac?q=${encodeURIComponent(query)}&q_enc=UTF-8&st=0&r_format=json&t_period=D&r_count=10&v=2`;
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 0 } });
  if (!res.ok) throw new Error('Search failed');
  return res.json();
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
