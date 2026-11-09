import { NextRequest, NextResponse } from 'next/server';
import { fetchUsQuotes } from '@/lib/usQuote';

// 시세 조회 본체는 lib/usQuote(Yahoo v8 chart meta) — /overseas 서버 첫 화면과 같은 코드
export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get('symbols') ?? '')
    .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 20);

  if (!symbols.length) return NextResponse.json({});

  const map = await fetchUsQuotes(symbols, { revalidate: 0 });

  return NextResponse.json(map, { headers: { 'Cache-Control': 's-maxage=15, stale-while-revalidate=300' } });
}
