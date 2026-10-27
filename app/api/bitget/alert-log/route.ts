// 경보 실전 성적 — 가드가 보낸 🚨 폭락 조기 경보·⚡ 하락 충격봉의 이후 결과 집계. 게이트 뒤(/api/bitget/*). 로직은 lib/alertLog.
import { NextResponse } from 'next/server';
import { alertLogSummary } from '@/lib/guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET() {
  try {
    return NextResponse.json({ ok: true, summary: await alertLogSummary() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ ok: false, summary: null, error: String(e) });
  }
}
