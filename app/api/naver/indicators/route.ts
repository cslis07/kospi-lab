import { NextResponse } from 'next/server';
import { marketIndicators } from '@/lib/naverStock';

// 환율 · 시장지표 12종 — 값은 30초, 미니차트(일별 30개)는 10분 캐시
export const preferredRegion = 'icn1';
export const dynamic = 'force-dynamic';

export async function GET() {
  const items = await marketIndicators();
  return NextResponse.json({ items, asOf: new Date().toISOString() },
    { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=120' } });
}
