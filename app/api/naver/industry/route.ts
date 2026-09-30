import { NextResponse } from 'next/server';
import { industryTrend, type Period } from '@/lib/naverStock';

// 산업 트렌드 — ?market=kr|us &cat=industries|themes(국내만) &period=daily|weekly|monthly &size=3~20
export const preferredRegion = 'icn1';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const market = sp.get('market') === 'us' ? 'us' : 'kr';
  const cat = sp.get('cat') === 'themes' ? 'themes' : 'industries';
  const p = sp.get('period');
  const period: Period = p === 'weekly' || p === 'monthly' ? p : 'daily';
  const size = Math.min(20, Math.max(3, Number(sp.get('size')) || 3));
  const cards = await industryTrend(market, cat, period, size);
  return NextResponse.json({ market, cat, period, cards, asOf: new Date().toISOString() },
    { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } });
}
