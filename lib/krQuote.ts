import type { StockData } from '@/lib/types';
import { chunkList } from '@/lib/stockBatch';

/**
 * 네이버 모바일 증권 시세 1종목(basic + integration) — /api/stock/batch 라우트와 /domestic 서버 첫 화면이 같이 쓴다.
 * 상장폐지·무효 코드는 네이버가 409 등을 준다 → throw(호출 쪽이 allSettled 로 빼낸다).
 * `next` 는 호출 쪽이 정한다: 라우트는 { revalidate: 0 }(매번 새로), ISR 페이지는 { revalidate: 60 }(0 이면 페이지가 동적으로 바뀜).
 */
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://finance.naver.com',
  'Accept': 'application/json',
};

type NextFetch = { revalidate: number };

function parseNum(s: unknown) {
  return parseFloat(String(s ?? 0).replace(/[,+%]/g, '')) || 0;
}

export async function fetchKrQuote(ticker: string, next: NextFetch = { revalidate: 0 }): Promise<StockData> {
  const [basicRes, integRes] = await Promise.all([
    fetch(`https://m.stock.naver.com/api/stock/${ticker}/basic`, { headers: HEADERS, next, signal: AbortSignal.timeout(6000) }),
    fetch(`https://m.stock.naver.com/api/stock/${ticker}/integration`, { headers: HEADERS, next, signal: AbortSignal.timeout(6000) })
      .catch(() => null),
  ]);

  // 예전엔 확인 없이 '0원 +0.00%'·코드 숫자 이름으로 내보냈다
  if (!basicRes.ok) throw new Error(`Naver basic ${ticker}: ${basicRes.status}`);
  const basic = await basicRes.json();
  if (basic?.closePrice == null) throw new Error(`Naver basic ${ticker}: no price`);
  const integ = integRes?.ok ? await integRes.json().catch(() => ({})) : {};
  const infos: { key: string; value: string }[] = integ.totalInfos ?? [];
  const get = (k: string) => infos.find((i) => i.key === k)?.value ?? '-';

  const price = parseNum(basic.closePrice);
  const change = parseNum(basic.compareToPreviousClosePrice);

  return {
    ticker,
    name: basic.stockName ?? ticker,
    price,
    change,
    changeRate: parseNum(basic.fluctuationsRatio),
    volume: get('거래량'),
    tradingValue: get('대금'),
    marketCap: get('시총'),
    market: basic.stockExchangeType?.name ?? 'KRX',
    prevClose: price - change,
    high52w: parseNum(get('52주 최고')) || undefined,
    low52w: parseNum(get('52주 최저')) || undefined,
    tradedAt: typeof basic.localTradedAt === 'string' ? basic.localTradedAt : undefined,
  };
}

/** 여러 종목 — 실패한 종목은 빠진다(라우트와 같은 동작). */
export async function fetchKrQuotes(tickers: string[], next?: NextFetch): Promise<Record<string, StockData>> {
  const results = await Promise.allSettled(tickers.map((t) => fetchKrQuote(t, next)));
  const map: Record<string, StockData> = {};
  results.forEach((r, i) => { if (r.status === 'fulfilled') map[tickers[i]] = r.value; });
  return map;
}

/**
 * 많은 종목을 20개 묶음씩 `parallel` 묶음 동시에 — 한 함수에서 176종목(요청 352개)을 한꺼번에 쏘지 않게.
 * 서버 첫 화면용: ISR 재생성은 백그라운드라 조금 느려도 사용자 대기와 무관.
 */
export async function fetchKrQuotesChunked(tickers: string[], next?: NextFetch, parallel = 3): Promise<Record<string, StockData>> {
  const chunks = chunkList(tickers);
  const out: Record<string, StockData> = {};
  for (let i = 0; i < chunks.length; i += parallel) {
    const parts = await Promise.all(chunks.slice(i, i + parallel).map((c) => fetchKrQuotes(c, next)));
    for (const p of parts) Object.assign(out, p);
  }
  return out;
}
