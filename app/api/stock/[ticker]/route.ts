import { NextRequest, NextResponse } from 'next/server';
import { fetchStockBasic } from '@/lib/naver';
import type { StockData } from '@/lib/types';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  try {
    const raw = await fetchStockBasic(ticker);

    const price = parseFloat(String(raw.closePrice ?? raw.currentPrice ?? 0).replace(/,/g, ''));
    const change = parseFloat(String(raw.compareToPreviousClosePrice ?? 0).replace(/,/g, ''));
    const changeRate = parseFloat(String(raw.fluctuationsRatio ?? 0).replace(/[+%]/g, ''));

    const totalInfos: { key: string; value: string }[] = raw.totalInfos ?? [];
    const getInfo = (key: string) =>
      totalInfos.find((i) => i.key === key)?.value ?? '-';

    const stock: StockData = {
      ticker,
      name: raw.stockName ?? raw.name ?? ticker,
      price,
      change,
      changeRate,
      volume: getInfo('거래량'),
      marketCap: getInfo('시가총액'),
      market: raw.stockExchangeType?.name ?? 'KRX',
      prevClose: price - change,
    };

    return NextResponse.json(stock);
  } catch (e) {
    return NextResponse.json(
      { error: String(e) },
      { status: 502 }
    );
  }
}
