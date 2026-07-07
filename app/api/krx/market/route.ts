/**
 * KRX 시장 종합 (지수 + 상품). 랭킹·ETF는 별도 라우트(용량↓).
 * GET /api/krx/market
 */
import { NextResponse } from 'next/server';
import { fetchKrxIndices, fetchKrxCommodities, hasKrxKey } from '@/lib/krx';

export const revalidate = 300;

export async function GET() {
  if (!hasKrxKey()) return NextResponse.json({ configured: false });
  try {
    const [indices, commodities] = await Promise.all([
      fetchKrxIndices(),
      fetchKrxCommodities(),
    ]);
    return NextResponse.json({ configured: true, indices, commodities });
  } catch (e) {
    return NextResponse.json({ configured: true, error: String(e) }, { status: 502 });
  }
}
