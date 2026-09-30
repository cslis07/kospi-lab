import { NextResponse } from 'next/server';
import { goalPriceChanged, analystIndustries, industryReports } from '@/lib/naverStock';

/**
 * 리서치 — 두 위젯을 한 번에.
 *  goal: 목표주가 변화가 큰 종목(?direction=up|down)
 *  analyst: 최근 1주간 애널리스트 집중 산업 + 선택 산업(?industry=, 기본 첫 산업) 리포트
 */
export const preferredRegion = 'icn1';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const direction = sp.get('direction') === 'down' ? 'down' : 'up';
  const [goal, ind] = await Promise.all([goalPriceChanged(direction, 10), analystIndustries(7, 6)]);
  const industry = sp.get('industry') || ind.industries[0]?.industry || '';
  const reports = industry ? await industryReports(industry, 8) : [];
  return NextResponse.json({ direction, goal, analyst: { ...ind, industry, reports }, asOf: new Date().toISOString() },
    { headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=1800' } });
}
