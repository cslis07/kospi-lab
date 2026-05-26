import { NextRequest, NextResponse } from 'next/server';
import { fetchChartData } from '@/lib/naver';
import type { ChartPoint } from '@/lib/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const count = parseInt(req.nextUrl.searchParams.get('count') ?? '60');
  const tf = req.nextUrl.searchParams.get('tf') ?? 'day';

  try {
    const text = await fetchChartData(ticker, count, tf);

    let rows: string[][];
    try {
      rows = JSON.parse(text);
    } catch {
      rows = text
        .trim()
        .split('\n')
        .map((line) => {
          try { return JSON.parse(line.replace(/^,/, '')); } catch { return null; }
        })
        .filter(Boolean) as string[][];
    }

    // Skip header row
    const points: ChartPoint[] = rows
      .slice(1)
      .map((row) => {
        if (!Array.isArray(row) || row.length < 5) return null;
        const price = parseFloat(String(row[4]).replace(/,/g, ''));
        if (!price || isNaN(price)) return null;
        return {
          date: String(row[0]),
          open: parseFloat(String(row[1]).replace(/,/g, '')),
          high: parseFloat(String(row[2]).replace(/,/g, '')),
          low: parseFloat(String(row[3]).replace(/,/g, '')),
          price,
          volume: parseFloat(String(row[5]).replace(/,/g, '')),
        };
      })
      .filter(Boolean) as ChartPoint[];

    return NextResponse.json(points);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
