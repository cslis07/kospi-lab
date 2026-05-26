import { NextRequest, NextResponse } from 'next/server';
import type { ChartPoint } from '@/lib/types';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://finance.naver.com',
  'Accept': 'application/json',
};

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function parseNum(s: unknown) {
  return parseFloat(String(s ?? 0).replace(/,/g, '')) || 0;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const months = parseInt(req.nextUrl.searchParams.get('months') ?? '1');

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - months);

  const url = `https://m.stock.naver.com/api/stock/${ticker}/price?startDate=${fmtDate(startDate)}&endDate=${fmtDate(endDate)}&timeframe=day`;

  try {
    const res = await fetch(url, { headers: HEADERS, next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`chart API ${res.status}`);

    const raw: Record<string, unknown>[] = await res.json();

    const points: ChartPoint[] = raw
      .map((row) => ({
        date: String(row.localTradedAt ?? '').replace(/-/g, ''),
        price: parseNum(row.closePrice),
        open: parseNum(row.openPrice),
        high: parseNum(row.highPrice),
        low: parseNum(row.lowPrice),
        volume: Number(row.accumulatedTradingVolume ?? 0),
      }))
      .filter((p) => p.price > 0)
      .reverse(); // oldest first for chart

    return NextResponse.json(points);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
