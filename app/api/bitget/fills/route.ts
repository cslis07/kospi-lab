/**
 * Bitget USDT 선물 체결 내역 → 수수료 진단(메이커 vs 테이커).
 * 읽기 전용(조회만). 게이트됨(middleware: /api/bitget/*). 최대 90일, 7일 구간으로 나눠 조회.
 * 응답은 집계(lib/feeDiag)만 — 체결 원본은 내보내지 않는다.
 * leak = 비용 누수 집중 분석(lib/costLeak) — 진입/청산 × 시장가/지정가 × 이익/손실 청산 수수료.
 * ?byDay=1 이면 KST 하루별 진입 체결 메이커/테이커 건수(entryByDay)도 준다(규율 점수 '지정가 진입' 줄).
 */
import { NextRequest, NextResponse } from 'next/server';
import { bitgetKeysConfigured } from '@/lib/bitget';
import { fetchFills } from '@/lib/bitgetFills';
import { feeDiag, entryScopeByDay } from '@/lib/feeDiag';
import { fillLeak } from '@/lib/costLeak';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!bitgetKeysConfigured()) return NextResponse.json({ configured: false });

  const days = Math.min(90, Math.max(1, Math.round(Number(req.nextUrl.searchParams.get('days') ?? 30)) || 30));
  const endTime = Date.now();
  const startTime = endTime - days * 86_400_000;
  const byDay = req.nextUrl.searchParams.get('byDay') === '1';

  try {
    const { fills, truncated } = await fetchFills(startTime, endTime);
    return NextResponse.json({ configured: true, days, diag: feeDiag(fills), leak: fillLeak(fills), truncated, ...(byDay ? { entryByDay: entryScopeByDay(fills) } : {}) });
  } catch (e) {
    return NextResponse.json({ configured: true, days, error: String(e) });
  }
}
