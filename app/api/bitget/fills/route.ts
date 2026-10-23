/**
 * Bitget USDT 선물 체결 내역 → 수수료 진단(메이커 vs 테이커).
 * 읽기 전용(조회만). 게이트됨(middleware: /api/bitget/*). 최대 90일, 7일 구간으로 나눠 조회.
 * 응답은 집계(lib/feeDiag)만 — 체결 원본은 내보내지 않는다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { bitgetKeysConfigured } from '@/lib/bitget';
import { fetchFills } from '@/lib/bitgetFills';
import { feeDiag } from '@/lib/feeDiag';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!bitgetKeysConfigured()) return NextResponse.json({ configured: false });

  const days = Math.min(90, Math.max(1, Math.round(Number(req.nextUrl.searchParams.get('days') ?? 30)) || 30));
  const endTime = Date.now();
  const startTime = endTime - days * 86_400_000;

  try {
    const { fills, truncated } = await fetchFills(startTime, endTime);
    return NextResponse.json({ configured: true, days, diag: feeDiag(fills), truncated });
  } catch (e) {
    return NextResponse.json({ configured: true, days, error: String(e) });
  }
}
