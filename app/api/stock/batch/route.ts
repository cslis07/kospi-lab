import { NextRequest, NextResponse } from 'next/server';
import { fetchStockBasic } from '@/lib/naver';
import type { StockData } from '@/lib/types';

export async function GET(req: NextRequest) {
  const tickers = (req.nextUrl.searchParams.get('tickers') ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20); // max 20 tickers

  if (tickers.length === 0) return NextResponse.json({});

  const results = await Promise.allSettled(
    tickers.map(async (ticker) => {
      const raw = await fetchStockBasic(ticker);
      const price = parseFloat(String(raw.closePrice ?? raw.currentPrice ?? 0).replace(/,/g, ''));
      const change = parseFloat(String(raw.compareToPreviousClosePrice ?? 0).replace(/,/g, ''));
      const changeRate = parseFloat(String(raw.fluctuationsRatio ?? 0).replace(/[+%]/g, ''));
      const totalInfos: { key: string; value: string }[] = raw.totalInfos ?? [];
      const getInfo = (key: string) => totalInfos.find((i) => i.key === key)?.value ?? '-';
      return [ticker, {
        ticker,
        name: raw.stockName ?? ticker,
        price,
        change,
        changeRate,
        volume: getInfo('거래량'),
        marketCap: getInfo('시가총액'),
        market: raw.stockExchangeType?.name ?? 'KRX',
      } as StockData] as [string, StockData];
    })
  );

  const map: Record<string, StockData> = {};
  results.forEach((r) => {
    if (r.status === 'fulfilled') map[r.value[0]] = r.value[1];
  });

  return NextResponse.json(map);
}
