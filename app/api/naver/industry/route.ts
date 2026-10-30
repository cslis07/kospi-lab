import { NextResponse } from 'next/server';
import { industryTrend, industryHeat, naverCache, type Period } from '@/lib/naverStock';

// 산업 트렌드 — ?market=kr|us &cat=industries|themes(국내만) &period=daily|weekly|monthly &size=3~20
// ?heat=1 → 히트맵용 전체 목록(등락률·시가총액·시총 상위 3종목, 가격 조회 없음)
export const preferredRegion = 'icn1';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const market = sp.get('market') === 'us' ? 'us' : 'kr';
  const cat = sp.get('cat') === 'themes' ? 'themes' : 'industries';
  const p = sp.get('period');
  const period: Period = p === 'weekly' || p === 'monthly' ? p : 'daily';
  if (sp.get('heat') === '1') {
    const items = await industryHeat(market, cat, period);
    return NextResponse.json({ market, cat, period, items, asOf: new Date().toISOString() },
      { headers: naverCache('industry-heat', items.length === 0, 's-maxage=15, stale-while-revalidate=60') });
  }
  const size = Math.min(20, Math.max(3, Number(sp.get('size')) || 3));
  const cards = await industryTrend(market, cat, period, size);
  return NextResponse.json({ market, cat, period, cards, asOf: new Date().toISOString() },
    { headers: naverCache('industry', cards.length === 0, 's-maxage=10') });
}
