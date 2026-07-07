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
    return NextResponse.json({ configured: true, ...data });
  } catch (e) {
    return NextResponse.json({ configured: true, count: 0, error: String(e) }, { status: 502 });
  }
}
