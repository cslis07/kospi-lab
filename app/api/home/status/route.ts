import { NextResponse } from 'next/server';
import { fetchKrxDailyMap, hasKrxKey } from '@/lib/krx';

/**
 * 시장 현황(상승·보합·하락 종목수) + 인기 종목(거래대금 상위) — KRX 전종목 일별매매 1콜에서 함께 산출.
 * KRX 키 없거나 실패 시 빈 값(에러 아님).  키: 로컬 .env.local · Vercel production 양쪽.
 */
export const revalidate = 300;

export async function GET() {
  if (!hasKrxKey()) {
    return NextResponse.json({ available: false, up: 0, flat: 0, down: 0, popular: [], date: '' });
  }
  const { map, date } = await fetchKrxDailyMap();
  if (!map.size) {
    return NextResponse.json({ available: false, up: 0, flat: 0, down: 0, popular: [], date: '' });
  }

  let up = 0, flat = 0, down = 0;
  for (const d of map.values()) {
    if (d.close <= 0) continue;
    if (d.changeRate > 0) up++;
    else if (d.changeRate < 0) down++;
    else flat++;
  }

  const popular = [...map.entries()]
    .map(([code, d]) => ({ code, name: d.name, price: d.close, changeRate: d.changeRate, tradingValue: d.tradingValue }))
    .filter((x) => x.price > 0 && x.name)
    .sort((a, b) => b.tradingValue - a.tradingValue)
    .slice(0, 8)
    .map(({ code, name, price, changeRate }) => ({ code, name, price, changeRate }));

  return NextResponse.json(
    { available: true, up, flat, down, popular, date },
    { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=900' } },
  );
}
