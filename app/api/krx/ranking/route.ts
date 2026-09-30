/**
 * KRX 전종목 랭킹 (상승률·하락률·거래대금·거래량·시가총액 Top)
 * GET /api/krx/ranking
 * 공식 KRX API 키 필요 · 키 없거나 데이터 없으면 configured:false / count:0.
 */
import { NextResponse } from 'next/server';
import { fetchKrxRankings, hasKrxKey } from '@/lib/krx';

export const revalidate = 300;

export async function GET() {
  if (!hasKrxKey()) {
    return NextResponse.json({ configured: false });
  }
  try {
    const data = await fetchKrxRankings(30);
    // 전 거래일 확정치라 오래 캐시해도 된다(첫 화면 즉시)
    return NextResponse.json({ configured: true, ...data }, { headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=86400' } });
  } catch (e) {
    return NextResponse.json({ configured: true, count: 0, error: String(e) }, { status: 502 });
  }
}
