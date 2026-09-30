/**
 * KRX 시장 종합 (지수 + 상품). 랭킹·ETF는 별도 라우트(용량↓).
 * GET /api/krx/market
 */
import { NextResponse } from 'next/server';
import { fetchKrxIndices, fetchKrxCommodities, hasKrxKey } from '@/lib/krx';
import { withCdn } from '@/lib/cdn';

export const revalidate = 300;

async function handler() {
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

// CDN 캐시(KRX 전 거래일 확정치) — 만료 후에도 직전 값을 즉시 응답
export const GET = withCdn(handler, 600, 86400);
