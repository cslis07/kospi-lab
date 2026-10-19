import { NextResponse } from 'next/server';
import { withCdn } from '@/lib/cdn';
import { getDemandLayer } from '@/lib/coinPremium';

/**
 * 레이어2 — 수요/흐름(공개, 무키). 코인베이스 프리미엄·김프.
 * 빠르게 변하므로 30초 신선 + 2분 stale.
 */
async function handler() {
  const layer = await getDemandLayer();
  return NextResponse.json(layer);
}

export const GET = withCdn(handler, 30, 120);
export const maxDuration = 15;
