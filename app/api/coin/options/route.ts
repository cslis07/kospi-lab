import { NextResponse } from 'next/server';
import { withCdn } from '@/lib/cdn';
import { getOptionsLayer } from '@/lib/coinOptions';

/**
 * 레이어4 보조 — ETH 옵션 만기·맥스페인(공개, 무키, Deribit).
 * 만기·OI는 느리게 변하므로 30분 신선 + 2시간 stale.
 */
async function handler() {
  const layer = await getOptionsLayer();
  return NextResponse.json(layer);
}

export const GET = withCdn(handler, 1800, 7200);
export const maxDuration = 20;
