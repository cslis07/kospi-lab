import type { OverseasStockData } from '@/lib/types';
import { chunkList } from '@/lib/stockBatch';

/**
 * Yahoo v8 chart meta 로 미국 종목 시세 1개 — /api/overseas/batch 라우트와 /overseas 서버 첫 화면이 같이 쓴다.
 * v7 quote API 는 401 차단이라 v8 chart 의 meta 필드를 쓴다(crumb 불필요).
 * `next` 는 호출 쪽이 정한다: 라우트는 { revalidate: 0 }(매번 새로), ISR 페이지는 { revalidate: 60 }(0 이면 페이지가 동적으로 바뀜).
 */
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

type NextFetch = { revalidate: number };

function fmtVol(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v ? String(v) : '-';
}
function fmtCap(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(2)}M`;
  return v ? `$${v.toLocaleString()}` : '-';
}
function normalizeExchange(s: string): string {
  const l = s.toLowerCase();
  if (l.includes('nasdaq')) return 'NASDAQ';
  if (l.includes('nyse'))   return 'NYSE';
  return s;
}

export async function fetchUsQuote(symbol: string, next: NextFetch = { revalidate: 0 }): Promise<OverseasStockData> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d&includePrePost=false`; // range=1d → chartPreviousClose = 직전 거래일 종가(2d 면 이틀 전 종가)

  let res = await fetch(url, { headers: HEADERS, next, signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    // query1 실패 → query2 폴백
    res = await fetch(url.replace('query1', 'query2'), { headers: HEADERS, next, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Yahoo v8 ${symbol}: ${res.status}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No chart result for ${symbol}`);

  const meta      = result.meta ?? {};
  const price     = Number(meta.regularMarketPrice ?? 0);
  const prevClose = Number(meta.previousClose ?? meta.chartPreviousClose ?? 0);
  const change    = price - prevClose;
  const changeRate = prevClose ? (change / prevClose) * 100 : 0;
  const vol       = Number(meta.regularMarketVolume ?? 0);
  const cap       = Number(meta.marketCap ?? 0);
  const t         = Number(meta.regularMarketTime);

  return {
    symbol,
    name:        String(meta.longName ?? meta.shortName ?? symbol),
    price,
    change,
    changeRate,
    volume:      vol,
    marketCap:   cap,
    exchange:    normalizeExchange(String(meta.exchangeName ?? meta.fullExchangeName ?? 'NASDAQ')),
    currency:    String(meta.currency ?? 'USD'),
    prevClose,
    high52w:     meta.fiftyTwoWeekHigh  ? Number(meta.fiftyTwoWeekHigh)  : undefined,
    low52w:      meta.fiftyTwoWeekLow   ? Number(meta.fiftyTwoWeekLow)   : undefined,
    tradedAt:    t > 0 ? new Date(t * 1000).toISOString() : undefined,
    volumeFmt:   fmtVol(vol),
    marketCapFmt: fmtCap(cap),
  } as OverseasStockData & { volumeFmt: string; marketCapFmt: string };
}

/** 여러 종목 — 실패한 종목은 빠진다(라우트와 같은 동작). */
export async function fetchUsQuotes(symbols: string[], next?: NextFetch): Promise<Record<string, OverseasStockData>> {
  const settled = await Promise.allSettled(symbols.map((s) => fetchUsQuote(s, next)));
  const map: Record<string, OverseasStockData> = {};
  settled.forEach((r, i) => { if (r.status === 'fulfilled') map[symbols[i]] = r.value; });
  return map;
}

/** 많은 종목을 20개 묶음씩 `parallel` 묶음 동시에 — 서버 첫 화면용(ISR 재생성은 백그라운드라 조금 느려도 사용자 대기와 무관). */
export async function fetchUsQuotesChunked(symbols: string[], next?: NextFetch, parallel = 3): Promise<Record<string, OverseasStockData>> {
  const chunks = chunkList(symbols);
  const out: Record<string, OverseasStockData> = {};
  for (let i = 0; i < chunks.length; i += parallel) {
    const parts = await Promise.all(chunks.slice(i, i + parallel).map((c) => fetchUsQuotes(c, next)));
    for (const p of parts) Object.assign(out, p);
  }
  return out;
}
