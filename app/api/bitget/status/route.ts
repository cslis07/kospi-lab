// 홈 '지금 내 상태' — 가드 마지막 실행·열린 포지션(손절 주문 여부)·냉각. 게이트 뒤(/api/bitget/*). 로직은 lib/guard.myStatus.
import { NextResponse } from 'next/server';
import { bitgetKeysConfigured } from '@/lib/bitget';
import { myStatus } from '@/lib/guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET() {
  if (!bitgetKeysConfigured()) return NextResponse.json({ configured: false });
  try {
    return NextResponse.json({ configured: true, asOf: Date.now(), ...(await myStatus()) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ configured: true, error: String(e) }, { status: 502 });
  }
}
