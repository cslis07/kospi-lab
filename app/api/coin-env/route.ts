import { NextResponse } from 'next/server';
import { fetchCoinEnv } from '@/lib/coinDashboard';
import { getEtfFlows } from '@/lib/etfFlow';
import { withCdn } from '@/lib/cdn';

/**
 * 코인 홈 대시보드 데이터 — 시장환경 그리드 + 현물 ETF 순유입.
 * 공개(게이트 없음)·경량. 업비트/바이낸스(김프)를 쓰므로 서울 리전 고정.
 */
export const preferredRegion = 'icn1';
export const revalidate = 300;   // 5분 CDN 캐시

async function handler() {
  const [env, etf] = await Promise.all([
    fetchCoinEnv().catch(() => null),
    getEtfFlows().catch(() => null),
  ]);
  return NextResponse.json({ env, etf });
}

// CDN 캐시(시장환경·ETF 유입 — 업스트림 7초) — 만료 후에도 직전 값을 즉시 응답
export const GET = withCdn(handler, 300, 3600);
