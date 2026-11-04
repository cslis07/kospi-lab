/**
 * Bitget 입출금 대비 누적 손익 — 내 자산 '실적' 카드의 누적 한 줄(계산: lib/cumulativePnl).
 * 입출금 기록은 Bitget 이 한 번에 90일 창까지만 받아서 LEDGER_START 부터 90일씩 나눠 모은다.
 * 읽기 전용, 게이트 뒤(/api/bitget/*). 브라우저만 10분 보관(CDN 공유 캐시 금지).
 */
import { NextResponse } from 'next/server';
import { bitgetKeysConfigured, bitgetSignedGet } from '@/lib/bitget';
import { computeCumulative, parseWalletRows } from '@/lib/cumulativePnl';
import { PRIVATE } from '@/lib/cdn';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** 2023-01부터 조회해 본 결과 첫 입금이 2025-10 이라 2025-01 부터 모은다(그 전 기록 없음 확인, 2026-11-04) */
const LEDGER_START = Date.UTC(2025, 0, 1);
const WINDOW = 90 * 86_400_000;

async function records(kind: 'deposit-records' | 'withdrawal-records', now: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = [];
  for (let s = LEDGER_START; s < now; s += WINDOW) {
    let cursor = '';
    for (let page = 0; page < 20; page++) {
      const j = await bitgetSignedGet(`/api/v2/spot/wallet/${kind}?startTime=${s}&endTime=${Math.min(s + WINDOW, now)}&limit=100${cursor ? `&idLessThan=${cursor}` : ''}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = (j.data as any[]) ?? [];
      out.push(...list);
      if (list.length < 100) break;
      cursor = String(list[list.length - 1].orderId);
    }
  }
  return parseWalletRows(out);
}

export async function GET() {
  if (!bitgetKeysConfigured()) return NextResponse.json({ configured: false });
  try {
    const now = Date.now();
    const [dep, wd, bal] = await Promise.all([
      records('deposit-records', now),
      records('withdrawal-records', now),
      bitgetSignedGet('/api/v2/account/all-account-balance'),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const balance = ((bal.data as any[]) ?? []).reduce((a, x) => a + (Number(x.usdtBalance) || 0), 0);
    return NextResponse.json({ configured: true, ...computeCumulative(dep, wd, balance) }, { headers: { 'Cache-Control': PRIVATE(600) } });
  } catch (e) {
    return NextResponse.json({ configured: true, error: String(e) });
  }
}
