import { NextRequest, NextResponse } from 'next/server';
import { fetchKrQuote } from '@/lib/krQuote';

// 시세 조회 본체는 lib/krQuote(네이버 basic + integration) — 종목 상세 서버 첫 화면·/api/stock/batch 와 같은 코드
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  try {
    const stock = await fetchKrQuote(ticker, { revalidate: 0 });
    return NextResponse.json(stock, { headers: { 'Cache-Control': 's-maxage=10, stale-while-revalidate=300' } });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
