/**
 * KRX ETF 랭킹 (거래대금·상승률·하락률 Top)
 * GET /api/krx/etf
 */
import { NextResponse } from 'next/server';
import { fetchKrxEtf, hasKrxKey } from '@/lib/krx';

export const revalidate = 300;

export async function GET() {
  if (!hasKrxKey()) return NextResponse.json({ configured: false });
  try {
    const data = await fetchKrxEtf(30);
    return NextResponse.json({ configured: true, ...data });
  } catch (e) {
    return NextResponse.json({ configured: true, count: 0, error: String(e) }, { status: 502 });
  }
}
