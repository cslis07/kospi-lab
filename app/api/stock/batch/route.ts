import { NextRequest, NextResponse } from 'next/server';
import { KR_CODE_RE } from '@/lib/naver';
import { fetchKrQuotes } from '@/lib/krQuote';

// 종목 1개 조회(네이버 basic + integration)는 lib/krQuote — /domestic 서버 첫 화면과 같은 코드
export async function GET(req: NextRequest) {
  const tickers = (req.nextUrl.searchParams.get('tickers') ?? '')
    .split(',').map((t) => t.trim().toUpperCase()).filter((t) => KR_CODE_RE.test(t)).slice(0, 20);

  if (!tickers.length) return NextResponse.json({});

  const map = await fetchKrQuotes(tickers, { revalidate: 0 });

  return NextResponse.json(map, { headers: { 'Cache-Control': 's-maxage=10, stale-while-revalidate=300' } });
}
