import { NextRequest, NextResponse } from 'next/server';
import type { StockData } from '@/lib/types';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://finance.naver.com',
  'Accept': 'application/json',
};

function parseNum(s: unknown) {
  return parseFloat(String(s ?? 0).replace(/[,+%]/g, '')) || 0;
}

async function fetchOne(ticker: string): Promise<[string, StockData]> {
  const [basicRes, integRes] = await Promise.all([
    fetch(`https://m.stock.naver.com/api/stock/${ticker}/basic`, { headers: HEADERS, next: { revalidate: 0 } }),
    fetch(`https://m.stock.naver.com/api/stock/${ticker}/integration`, { headers: HEADERS, next: { revalidate: 0 } }),
  ]);

  const basic = await basicRes.json();
  const integ = integRes.ok ? await integRes.json() : {};
  const infos: { key: string; value: string }[] = integ.totalInfos ?? [];
  const get = (k: string) => infos.find((i) => i.key === k)?.value ?? '-';

  const price = parseNum(basic.closePrice);
  const change = parseNum(basic.compareToPreviousClosePrice);

  return [ticker, {
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
  }];
}

export async function GET(req: NextRequest) {
  const tickers = (req.nextUrl.searchParams.get('tickers') ?? '')
    .split(',').map((t) => t.trim()).filter(Boolean).slice(0, 20);

  if (!tickers.length) return NextResponse.json({});

  const results = await Promise.allSettled(tickers.map(fetchOne));
  const map: Record<string, StockData> = {};
  results.forEach((r) => { if (r.status === 'fulfilled') map[r.value[0]] = r.value[1]; });

  return NextResponse.json(map);
}
