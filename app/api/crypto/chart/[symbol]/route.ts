import { NextRequest, NextResponse } from 'next/server';

interface CryptoChartPoint {
  date: string;   // YYYYMMDD
  price: number;  // close in USDT
  open: number;
  high: number;
  low: number;
  volume: number;
}

// months → Binance klines limit (거래일 기준, 코인은 365일 내내)
function monthsToLimit(months: number): number {
  return Math.min(1000, months * 31);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const months = Math.min(12, Math.max(1, parseInt(req.nextUrl.searchParams.get('months') ?? '1')));
  const limit   = monthsToLimit(months);

  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol.toUpperCase())}&interval=1d&limit=${limit}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`Binance klines ${res.status}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[][] = await res.json();

    const points: CryptoChartPoint[] = raw.map((k) => {
      // k: [openTime, open, high, low, close, volume, ...]
      const ts   = Number(k[0]);
      const d    = new Date(ts);
      const date = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
      return {
        date,
        open:   parseFloat(k[1]),
        high:   parseFloat(k[2]),
        low:    parseFloat(k[3]),
        price:  parseFloat(k[4]),  // close
        volume: parseFloat(k[5]),
      };
    }).filter((p) => p.price > 0);

    return NextResponse.json(points);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
