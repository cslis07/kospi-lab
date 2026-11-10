import { NextResponse } from 'next/server';
import { fetchHomeIndexCards } from '@/lib/homeIndices';

/**
 * 홈 상단 지수 카드 — 본체는 lib/homeIndices(홈 서버 첫 화면과 같은 코드). 값은 전부 네이버 실시간(10초 캐시).
 */
export const dynamic = 'force-dynamic'; // 빌드 스냅샷(ISR) 대신 매 요청 실시간 — CDN 은 아래 s-maxage=10 으로 흡수

export type { IndexCard } from '@/lib/homeIndices';

export async function GET() {
  const cards = await fetchHomeIndexCards();
  return NextResponse.json(
    { cards, asOf: new Date().toISOString() },
    { headers: { 'Cache-Control': 's-maxage=10, stale-while-revalidate=600' } },
  );
}
