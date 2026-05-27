import { NextRequest, NextResponse } from 'next/server';
import type { OverseasStockData } from '@/lib/types';

// v7 quote API → 401 차단. v8 chart의 meta 필드를 사용 (crumb 불필요)
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

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

async function fetchOne(symbol: string): Promise<OverseasStockData> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d&includePrePost=false`;

  let res = await fetch(url, { headers: HEADERS, next: { revalidate: 0 } });
  if (!res.ok) {
    // query1 실패 → query2 폴백
    res = await fetch(url.replace('query1', 'query2'), { headers: HEADERS, next: { revalidate: 0 } });
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
    volumeFmt:   fmtVol(vol),
    marketCapFmt: fmtCap(cap),
  } as OverseasStockData & { volumeFmt: string; marketCapFmt: string };
}

export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get('symbols') ?? '')
    .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 20);

  if (!symbols.length) return NextResponse.json({});

  const settled = await Promise.allSettled(symbols.map(fetchOne));
  const map: Record<string, OverseasStockData> = {};
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') map[symbols[i]] = r.value;
  });

  return NextResponse.json(map);
}
