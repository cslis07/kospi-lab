import { NextRequest, NextResponse } from 'next/server';
import { fetchStockBasic } from '@/lib/naver';
import type { StockData } from '@/lib/types';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://finance.naver.com',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  try {
    const raw = await fetchStockBasic(ticker);

    let integration: Record<string, unknown> = {};
    try {
      const intRes = await fetch(
        `https://m.stock.naver.com/api/stock/${ticker}/integration`,
        { headers: HEADERS, next: { revalidate: 300 } }
      );
      if (intRes.ok) integration = await intRes.json();
    } catch {}

    const price = parseFloat(String(raw.closePrice ?? raw.currentPrice ?? 0).replace(/,/g, ''));
    const change = parseFloat(String(raw.compareToPreviousClosePrice ?? 0).replace(/,/g, ''));
    const changeRate = parseFloat(String(raw.fluctuationsRatio ?? 0).replace(/[+%]/g, ''));

    const totalInfos: { key: string; value: string }[] = raw.totalInfos ?? [];
    const getInfo = (k: string) => totalInfos.find((i) => i.key === k)?.value ?? '-';

    const yearInfos: { key: string; value: string }[] =
      (integration as { yearlyTotalInfos?: { key: string; value: string }[] }).yearlyTotalInfos ?? [];
    const getYear = (k: string) => yearInfos.find((i) => i.key.includes(k))?.value;

    const h52 = getYear('최고');
    const l52 = getYear('최저');

    const stock: StockData = {
      ticker,
      name: raw.stockName ?? raw.name ?? ticker,
      price,
      change,
      changeRate,
      volume: getInfo('거래량'),
      tradingValue: getInfo('거래대금'),
      marketCap: getInfo('시가총액'),
      market: raw.stockExchangeType?.name ?? 'KRX',
      prevClose: price - change,
      high52w: h52 ? parseFloat(h52.replace(/,/g, '')) : undefined,
      low52w: l52 ? parseFloat(l52.replace(/,/g, '')) : undefined,
    };

    return NextResponse.json(stock);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
