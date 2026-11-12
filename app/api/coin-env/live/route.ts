import { NextResponse } from 'next/server';
import { fetchEnvLive } from '@/lib/coinEnvLive';

/**
 * 코인 › 시장환경 실시간 카드 — 금리·유가·달러·USDT/KRW·김치프리미엄·공포탐욕·스테이블코인 시총 + 다음 FOMC.
 * 공개(게이트 없음). 업비트를 쓰므로 서울 리전 고정. 현재값은 매 요청 새로 받고 CDN 10초가 동시 요청을 합친다
 * (화면이 열려 있을 때만 15초마다 요청 — 서버가 스스로 깨어나는 주기 작업 없음).
 */
export const preferredRegion = 'icn1';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

export async function GET() {
  const d = await fetchEnvLive();
  return NextResponse.json(d, {
    headers: { 'Cache-Control': d.cards.length ? 's-maxage=10, stale-while-revalidate=600' : 's-maxage=15, stale-while-revalidate=30' },
  });
}
