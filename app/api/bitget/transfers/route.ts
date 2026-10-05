/**
 * Bitget 현물 지갑 입출금 내역(온체인·내부) — 매매일지 비용 분석의 "실제로 손에 쥔 돈" 계산용.
 * 읽기 전용. 게이트 뒤(/api/bitget/*). 개인 데이터라 CDN 캐시 금지.
 * ⚠ Bitget 은 조회 구간이 최대 90일 — 그보다 길면 90일씩 나눠 조회한다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { bitgetKeysConfigured, bitgetSignedGet } from '@/lib/bitget';
import type { CashMove } from '@/lib/tradeCosts';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const DAY = 86_400_000;
const WINDOW = 89 * DAY;

async function records(kind: 'withdrawal' | 'deposit', start: number, end: number): Promise<CashMove[]> {
  const out: CashMove[] = [];
  for (let to = end; to > start; to -= WINDOW) {
    const from = Math.max(start, to - WINDOW);
    const j = await bitgetSignedGet(`/api/v2/spot/wallet/${kind}-records?startTime=${from}&endTime=${to}&limit=100`);
    const rows = (j.data as Record<string, string>[] | undefined) ?? [];
    for (const r of rows) {
      if (r.status !== 'success') continue;
      out.push({ ts: Number(r.cTime) || 0, coin: String(r.coin ?? ''), size: Number(r.size) || 0, fee: Math.abs(Number(r.fee) || 0) });
    }
  }
  return out.sort((a, b) => b.ts - a.ts);
}

export async function GET(req: NextRequest) {
  if (!bitgetKeysConfigured()) return NextResponse.json({ configured: false, withdrawals: [], deposits: [] });
  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get('days')) || 30));
  const end = Date.now(), start = end - days * DAY;
  try {
    const [withdrawals, deposits] = await Promise.all([records('withdrawal', start, end), records('deposit', start, end)]);
    return NextResponse.json({ configured: true, withdrawals, deposits }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    // 키에 지갑 읽기 권한이 없을 수 있다 — 매매일지는 계속 동작하게 빈 값 + error
    return NextResponse.json({ configured: true, withdrawals: [], deposits: [], error: String(e).slice(0, 200) }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
}
