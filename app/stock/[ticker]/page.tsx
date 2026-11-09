import SwrFallback from '@/components/SwrFallback';
import StockDetailClient from './StockDetailClient';
import { KR_CODE_RE } from '@/lib/krCode';
import { fetchKrQuote } from '@/lib/krQuote';

/**
 * 종목 상세 — 첫 시세를 서버에서 넣어 HTML 에 바로 가격·등락이 보이게(속도 2단계, /domestic·/overseas 와 같은 방식, 2026-11-09).
 * 예전: 'use client' 페이지가 요청마다 서버에서 다시 그려졌고(CDN 캐시 없음) 그 HTML 은 뼈대뿐 →
 *       JS 실행 뒤에야 /api/stock/{ticker} 요청 → 가격이 늦게 보임.
 * 지금: 종목마다 처음 방문될 때 한 번 만들고(빌드 때는 안 만듦 — generateStaticParams 빈 배열) 60초 캐시(ISR).
 *       화면은 StockDetailClient 그대로 — 뜬 직후 SWR 이 같은 키로 새로 받아 바꾼다. 조회 실패·잘못된 코드면 넣지 않음 → 예전처럼 화면에서 받는다.
 */
export const revalidate = 60;

export function generateStaticParams() {
  return [];
}

export default async function StockDetailPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const fallback: Record<string, unknown> = {};
  if (KR_CODE_RE.test(ticker)) {
    try {
      // 화면의 useSWR 키와 같은 문자열(`/api/stock/${ticker}`) — useParams 값과 같은 ticker 를 쓴다
      fallback[`/api/stock/${ticker}`] = await fetchKrQuote(ticker, { revalidate: 60 });
    } catch { /* 넣지 않음 */ }
  }
  return (
    <SwrFallback fallback={fallback}>
      <StockDetailClient />
    </SwrFallback>
  );
}
