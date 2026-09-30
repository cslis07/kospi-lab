/**
 * KRX ETF 랭킹 (거래대금·상승률·하락률 Top)
 * GET /api/krx/etf
 */
import { NextResponse } from 'next/server';
import { fetchKrxEtf, hasKrxKey } from '@/lib/krx';
import { withCdn } from '@/lib/cdn';

export const revalidate = 300;

async function handler() {
  if (!hasKrxKey()) return NextResponse.json({ configured: false });
  try {
    const data = await fetchKrxEtf(30);
    return NextResponse.json({ configured: true, ...data });
  } catch (e) {
    return NextResponse.json({ configured: true, count: 0, error: String(e) }, { status: 502 });
  }
}

// CDN 캐시(KRX 전 거래일 확정치) — 만료 후에도 직전 값을 즉시 응답
export const GET = withCdn(handler, 600, 86400);
