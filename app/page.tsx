import SwrFallback from '@/components/SwrFallback';
import HomeClient from './HomeClient';
import { fetchHomeIndexCards } from '@/lib/homeIndices';

/**
 * 홈 — 첫 화면 '오늘의 시장' 지수 카드를 서버에서 넣어 HTML 에 바로 숫자가 보이게(속도 2단계, 2026-11-10).
 * 예전: HTML 에 카드 자리 6칸이 회색 뼈대 → JS 실행 뒤에야 /api/home/indices 요청 → 그제야 숫자.
 * ISR 60초: 페이지는 그대로 CDN 에서 나가고, 누가 볼 때 최대 60초에 한 번만 백그라운드로 다시 만든다.
 * 화면은 HomeClient 그대로 — 뜬 직후 SWR 이 새로 받아(10초 주기) 바꾼다. 실패·빈 응답이면 넣지 않음 → 예전처럼 화면에서 받는다.
 * 넣는 것은 공개 지수 시세뿐 — 내 상태(가드·포지션 등 잠긴 개인 데이터)는 넣지 않는다.
 */
export const revalidate = 60;

const INDICES_KEY = '/api/home/indices';

async function snapshot(): Promise<Record<string, unknown>> {
  try {
    const cards = await fetchHomeIndexCards({ live: 60, minute: 60 });
    return cards.length ? { [INDICES_KEY]: { cards, asOf: new Date().toISOString() } } : {};
  } catch {
    return {};
  }
}

export default async function HomePage() {
  const fallback = await snapshot();
  return (
    <SwrFallback fallback={fallback}>
      <HomeClient />
    </SwrFallback>
  );
}
