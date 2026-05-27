import { NextRequest, NextResponse } from 'next/server';
import type { CryptoData } from '@/lib/types';

// Binance BTCUSDT → Yahoo Finance BTC-USD
function toYahooSymbol(sym: string): string {
  if (sym.endsWith('USDT')) return `${sym.slice(0, -4)}-USD`;
  if (sym.endsWith('USD'))  return sym;
  return `${sym}-USD`;
}

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchOne(symbol: string): Promise<CryptoData> {
  const yahooSym = toYahooSymbol(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=1d&range=2d&includePrePost=false`;

  let res = await fetch(url, { headers: HEADERS, next: { revalidate: 0 } });
  if (!res.ok) {
    res = await fetch(url.replace('query1', 'query2'), { headers: HEADERS, next: { revalidate: 0 } });
    if (!res.ok) throw new Error(`Yahoo ${yahooSym}: ${res.status}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No result for ${yahooSym}`);

  const meta       = result.meta ?? {};
  const price      = Number(meta.regularMarketPrice ?? 0);
  const prevClose  = Number(meta.previousClose ?? meta.chartPreviousClose ?? 0);
  const change     = price - prevClose;
  const changeRate = prevClose ? (change / prevClose) * 100 : 0;

  const base = symbol.endsWith('USDT') ? symbol.slice(0, -4) : symbol.replace('-USD', '');

  return {
    symbol,
    baseAsset:      base,
    quoteAsset:     'USDT',
    price,
    change,
    changeRate,
    high24h:        Number(meta.regularMarketDayHigh  ?? price),
    low24h:         Number(meta.regularMarketDayLow   ?? price),
    volume24h:      Number(meta.regularMarketVolume   ?? 0),
    quoteVolume24h: Number(meta.regularMarketVolume   ?? 0) * price,
  };
}

export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get('symbols') ?? '')
    .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 20);

  if (!symbols.length) return NextResponse.json({});

  const settled = await Promise.allSettled(symbols.map(fetchOne));
  const map: Record<string, CryptoData> = {};
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') map[symbols[i]] = r.value;
  });

  return NextResponse.json(map);
}
