import { NextResponse } from 'next/server';
import { withCdn } from '@/lib/cdn';
import { getSupplyLayer } from '@/lib/coinSupply';

/**
 * 레이어1 — 공급/구조(공개, 무키). 스테이블코인 총공급·stETH peg·거래소 총 리저브.
 * 느리게 변하므로 5분 신선 + 30분 stale. 실패해도 null 필드로 graceful.
 */
async function handler() {
  const layer = await getSupplyLayer();
  return NextResponse.json(layer);
}

export const GET = withCdn(handler, 300, 1800);
export const maxDuration = 20;
