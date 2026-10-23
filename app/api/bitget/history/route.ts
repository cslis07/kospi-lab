/**
 * Bitget USDT 선물 — 청산된 포지션 이력.
 *
 * 매매일지의 근본 문제를 푼다: 지금까지 "내 실제 성적"은 사용자가 손으로 적어야만 쌓였다.
 * 손으로 적는 기록은 이긴 매매만 남기 쉬워(생존 편향) 성적표 자체가 거짓말이 된다.
 * 거래소가 아는 사실(진입가·청산가·실현손익·수수료·펀딩)을 그대로 가져와 자동으로 채운다.
 *
 * 읽기 전용(조회만). 게이트 뒤(/api/bitget/*).
 * ⚠ 키에 선물 읽기 권한이 없으면 error 필드로 폴백한다(앱은 계속 동작).
 */
import { NextRequest, NextResponse } from 'next/server';
import { bitgetKeysConfigured } from '@/lib/bitget';
import { fetchClosedPositions, type ClosedPosition } from '@/lib/bitgetPositions';

export type { ClosedPosition };
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

export async function GET(req: NextRequest) {
  if (!bitgetKeysConfigured()) return NextResponse.json({ configured: false, positions: [] });

  const days = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get('days') ?? 30)));
  const endTime = Date.now();
  const startTime = endTime - days * 86_400_000;

  try {
    const { positions, slRecovered } = await fetchClosedPositions(startTime, endTime);
    return NextResponse.json({ configured: true, days, positions, slRecovered });
  } catch (e) {
    return NextResponse.json({ configured: true, error: String(e), positions: [] });
  }
}
