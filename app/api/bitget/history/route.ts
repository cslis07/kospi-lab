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
import { bitgetKeysConfigured, bitgetSignedGet } from '@/lib/bitget';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export interface ClosedPosition {
  positionId: string;
  symbol: string;
  side: 'long' | 'short';
  openAvg: number;
  closeAvg: number;
  size: number;
  /** 수수료·펀딩까지 반영한 실현 순손익 (USDT) — 이게 '진짜 성적'이다 */
  netProfit: number;
  grossPnl: number;
  fee: number;
  funding: number;
  openTs: number;
  closeTs: number;
}

export async function GET(req: NextRequest) {
  if (!bitgetKeysConfigured()) return NextResponse.json({ configured: false, positions: [] });

  const days = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get('days') ?? 30)));
  const endTime = Date.now();
  const startTime = endTime - days * 86_400_000;

  try {
    const j = await bitgetSignedGet(
      `/api/v2/mix/position/history-position?productType=USDT-FUTURES&startTime=${startTime}&endTime=${endTime}&limit=100`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = ((j.data as any)?.list as any[] | undefined) ?? [];

    const positions: ClosedPosition[] = rows.map((r) => {
      const openFee = num(r.openFee), closeFee = num(r.closeFee), funding = num(r.totalFunding);
      return {
        positionId: String(r.positionId ?? `${r.symbol}-${r.ctime}`),
        symbol: String(r.symbol ?? ''),
        side: (r.holdSide === 'short' ? 'short' : 'long') as 'long' | 'short',
        openAvg: num(r.openAvgPrice),
        closeAvg: num(r.closeAvgPrice),
        size: num(r.closeTotalPos ?? r.openTotalPos),
        // netProfit 이 없으면 pnl - 수수료 + 펀딩으로 직접 계산(필드명이 버전마다 다르다)
        netProfit: r.netProfit != null ? num(r.netProfit) : num(r.pnl) - (openFee + closeFee) * -1 + funding,
        grossPnl: num(r.pnl),
        fee: openFee + closeFee,
        funding,
        openTs: num(r.ctime),
        closeTs: num(r.utime),
      };
    }).filter((p) => p.symbol && p.closeTs > 0)
      .sort((a, b) => b.closeTs - a.closeTs);

    return NextResponse.json({ configured: true, days, positions });
  } catch (e) {
    return NextResponse.json({ configured: true, error: String(e), positions: [] });
  }
}
