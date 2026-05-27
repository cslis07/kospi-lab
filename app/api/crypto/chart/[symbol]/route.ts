import { NextRequest, NextResponse } from 'next/server';

interface CryptoChartPoint {
  date: string;
  price: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

// BTCUSDT → BTC-USD (Yahoo Finance)
function toYahooSymbol(sym: string): string {
  if (sym.endsWith('USDT')) return `${sym.slice(0, -4)}-USD`;
  if (sym.endsWith('USD'))  return sym;
  return `${sym}-USD`;
}

// months → Yahoo range
const RANGE_MAP: Record<number, string> = {
  1: '1mo', 3: '3mo', 6: '6mo', 12: '1y',
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const months = Math.min(12, Math.max(1, parseInt(req.nextUrl.searchParams.get('months') ?? '1')));
  const range  = RANGE_MAP[months] || '1mo';

  const yahooSym = toYahooSymbol(symbol.toUpperCase());
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=1d&range=${range}&includePrePost=false`;

  try {
    let res = await fetch(url, { headers: HEADERS, next: { revalidate: 60 } });
    if (!res.ok) {
      res = await fetch(url.replace('query1', 'query2'), { headers: HEADERS, next: { revalidate: 60 } });
      if (!res.ok) throw new Error(`Yahoo chart ${res.status}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error('No chart result');

    const timestamps: number[]       = result.timestamp ?? [];
    const quote                       = result.indicators?.quote?.[0] ?? {};
    const closes:  (number | null)[] = quote.close  ?? [];
    const opens:   (number | null)[] = quote.open   ?? [];
    const highs:   (number | null)[] = quote.high   ?? [];
    const lows:    (number | null)[] = quote.low    ?? [];
    const volumes: (number | null)[] = quote.volume ?? [];

    const points: CryptoChartPoint[] = timestamps
      .map((ts, i) => {
        const d    = new Date(ts * 1000);
        const date = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
        const price = closes[i];
        return {
          date,
          price:  price          ? price          : 0,
          open:   opens[i]   ?? undefined,
          high:   highs[i]   ?? undefined,
          low:    lows[i]    ?? undefined,
          volume: volumes[i] ?? undefined,
        };
      })
      .filter((p) => p.price > 0);

    return NextResponse.json(points);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
