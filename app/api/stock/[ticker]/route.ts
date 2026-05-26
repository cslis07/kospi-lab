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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  try {
    // basic: price / change / market info
    const [basicRes, integRes] = await Promise.all([
      fetch(`https://m.stock.naver.com/api/stock/${ticker}/basic`, {
        headers: HEADERS, next: { revalidate: 0 },
      }),
      fetch(`https://m.stock.naver.com/api/stock/${ticker}/integration`, {
        headers: HEADERS, next: { revalidate: 0 },
      }),
    ]);

    if (!basicRes.ok) throw new Error(`basic API ${basicRes.status}`);

    const basic = await basicRes.json();
    const integ = integRes.ok ? await integRes.json() : {};

    const price = parseNum(basic.closePrice);
    const change = parseNum(basic.compareToPreviousClosePrice);
    const changeRate = parseNum(basic.fluctuationsRatio);

    // integration totalInfos has volume, tradingValue, marketCap, 52w
    const infos: { key: string; value: string }[] = integ.totalInfos ?? [];
    const get = (key: string) => infos.find((i) => i.key === key)?.value ?? '-';

    const stock: StockData = {
      ticker,
      name: basic.stockName ?? ticker,
      price,
      change,
      changeRate,
      volume: get('거래량'),
      tradingValue: get('대금'),
      marketCap: get('시총'),
      market: basic.stockExchangeType?.name ?? 'KRX',
      prevClose: price - change,
      high52w: parseNum(get('52주 최고')) || undefined,
      low52w: parseNum(get('52주 최저')) || undefined,
    };

    return NextResponse.json(stock);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
