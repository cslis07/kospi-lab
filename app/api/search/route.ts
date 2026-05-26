import { NextRequest, NextResponse } from 'next/server';
import { searchStocks } from '@/lib/naver';
import type { SearchResult } from '@/lib/types';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (!q.trim()) return NextResponse.json([]);

  try {
    const data = await searchStocks(q);
    const items: string[][] = data.items ?? [];

    const results: SearchResult[] = items.map((item) => ({
      ticker: item[0],
      name: item[1],
      market: item[3] === 'KQ' ? 'KOSDAQ' : 'KOSPI',
      type: item[4] ?? '주식',
    }));

    return NextResponse.json(results);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
