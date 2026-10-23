// 냉각 타이머 — 손실 청산 뒤 30분·서킷브레이커 차단 시 자정까지. 게이트 뒤(/api/bitget/*). 로직은 lib/guard.cooldownState.
import { NextResponse } from 'next/server';
import { bitgetKeysConfigured } from '@/lib/bitget';
import { cooldownNow } from '@/lib/guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET() {
  if (!bitgetKeysConfigured()) return NextResponse.json({ configured: false, cooldown: null });
  try {
    return NextResponse.json({ configured: true, cooldown: await cooldownNow() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ configured: true, cooldown: null, error: String(e) });
  }
}
