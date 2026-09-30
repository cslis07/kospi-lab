import { NextResponse } from 'next/server';
import { fetchKrxDailyMap, hasKrxKey } from '@/lib/krx';

/**
 * 인기 종목(거래대금 상위) — KRX 전종목 일별매매. ⚠️ KRX 는 **전 거래일** 확정치라 date 를 화면에 함께 표기한다.
 * (실시간 상승·보합·하락 종목수는 /api/home/board 의 네이버 integration 으로 이전)
 */
export const revalidate = 300;

export async function GET() {
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
    { available: true, popular, date },
    { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=86400' } },
  );
}
