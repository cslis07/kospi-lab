import { NextResponse } from 'next/server';
import { goalPriceChanged, analystIndustries, industryReports, krPrices, naverCache, industryNameMap, stockIndustryCode, stockLogo, researchUrl } from '@/lib/naverStock';

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
  // 리포트·목표주가는 하루 몇 번 바뀜(서버 10~15분 캐시) — 카드의 현재가만 실시간으로 따로 붙인다
  const codes = goal.sets.map((x) => x.itemCode);
  const [reports, px, names, indCodes] = await Promise.all([
    industry ? industryReports(industry, 8) : Promise.resolve([]),
    krPrices(codes),
    industryNameMap(),
    Promise.all(codes.map(stockIndustryCode)),   // 하루 캐시 — 네이버 카드의 업종명(예: 전자장비와기기)
  ]);
  const prices = Object.fromEntries([...px.entries()].map(([k, v]) => [k, { price: v.price, change: v.change, changeRate: v.changeRate }]));
  const sets = goal.sets.map((x, i) => ({
    ...x, logo: stockLogo(x.itemCode), industryName: names.get(indCodes[i]) ?? '',
    url: researchUrl(x.latest.nid), prevUrl: x.prev ? researchUrl(x.prev.nid) : null,
  }));
  return NextResponse.json({ direction, goal: { ...goal, sets }, prices, analyst: { ...ind, industry, reports }, asOf: new Date().toISOString() },
    { headers: naverCache('research', goal.sets.length === 0 && ind.industries.length === 0, 's-maxage=15') });
}
