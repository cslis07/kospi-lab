import { NextResponse } from 'next/server';
import { fetchKrxDailyMap, hasKrxKey } from '@/lib/krx';
import { rankKrStocks } from '@/lib/naverStock';

/**
 * 홈 '인기' 탭 — **네이버 실시간 인기 종목**(조회 많은 순, 시세 실시간)이 주력(10-01 교체, 이전엔 KRX 전 거래일 거래대금).
 * 네이버가 비면(구조 변경·차단) KRX 전 거래일 거래대금 상위로 대체하고 source·date 로 화면에 밝힌다.
 * (실시간 상승·보합·하락 종목수는 /api/home/board 의 네이버 integration)
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const live = await rankKrStocks('popular', 8);
  if (live.length) {
    return NextResponse.json(
      { available: true, source: 'naver', popular: live.map((r) => ({ code: r.code, name: r.name, price: r.price, changeRate: r.changeRate })), asOf: new Date().toISOString() },
      { headers: { 'Cache-Control': 's-maxage=10' } },
    );
  }
  if (!hasKrxKey()) return NextResponse.json({ available: false, popular: [], date: '' });
  const { map, date } = await fetchKrxDailyMap();
  if (!map.size) return NextResponse.json({ available: false, popular: [], date: '' });

  const popular = [...map.entries()]
    .map(([code, d]) => ({ code, name: d.name, price: d.close, changeRate: d.changeRate, tradingValue: d.tradingValue }))
    .filter((x) => x.price > 0 && x.name)
    .sort((a, b) => b.tradingValue - a.tradingValue)
    .slice(0, 8)
    .map(({ code, name, price, changeRate }) => ({ code, name, price, changeRate }));

  return NextResponse.json(
    { available: true, source: 'krx', popular, date },
    { headers: { 'Cache-Control': 's-maxage=60' } },  // 대체 경로 — 네이버가 돌아오면 곧 바뀌게 짧게
  );
}
