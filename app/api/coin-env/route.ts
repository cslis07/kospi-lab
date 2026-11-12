import { NextResponse } from 'next/server';
import { getEtfFlows } from '@/lib/etfFlow';
import { withCdn } from '@/lib/cdn';

/**
 * 코인 화면 — 현물 ETF 순유입. 시장환경은 /api/coin-env/live 로 옮겼다(2026-11-12, 실시간 카드).
 * 공개(게이트 없음)·경량.
 */
export const preferredRegion = 'icn1';
export const revalidate = 300;   // 5분 CDN 캐시

async function handler() {
  const etf = await getEtfFlows().catch(() => null);
  return NextResponse.json({ etf });
}

// CDN 캐시(ETF 유입) — 만료 후에도 직전 값을 즉시 응답
export const GET = withCdn(handler, 300, 3600);
