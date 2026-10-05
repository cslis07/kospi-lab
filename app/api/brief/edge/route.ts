import { NextResponse } from 'next/server';
import { buildEdgeReport, type EdgeReport } from '@/lib/briefEdge';
import type { BriefMarket } from '@/lib/brief';

/**
 * 모닝 브리핑 과거 통계 — ?market=coin|kr|us.
 * "요인이 크게 움직인 다음 날 이 시장은 실제로 어땠나"를 약 3년 일별 데이터로 측정(대조군·판정 기준은 lib/briefEdge).
 * 일별 데이터라 6시간 캐시.
 */
export const maxDuration = 30;
export const revalidate = 0;

const MARKETS: BriefMarket[] = ['coin', 'kr', 'us'];
const TTL = 6 * 60 * 60 * 1000;
const cache = new Map<BriefMarket, { data: EdgeReport; exp: number }>();

export async function GET(req: Request) {
  const m = new URL(req.url).searchParams.get('market');
  const market: BriefMarket = (MARKETS as string[]).includes(m ?? '') ? (m as BriefMarket) : 'coin';
  const hit = cache.get(market);
  let data: EdgeReport;
  if (hit && hit.exp > Date.now()) data = hit.data;
  else {
    try { data = await buildEdgeReport(market); }
    catch { data = { market, target: '', from: null, to: null, days: 0, baseRate: null, rows: [], latest: [], note: '과거 데이터를 불러오지 못했습니다.' }; }
    if (data.rows.length) cache.set(market, { data, exp: Date.now() + TTL });
  }
  return NextResponse.json(data, {
    headers: { 'Cache-Control': data.rows.length ? 's-maxage=21600, stale-while-revalidate=86400' : 's-maxage=120' },
  });
}
