/**
 * 규율 점수(매매일지)용 1H 종가 — 심볼당 Bitget 공개 캔들 1회(limit=1000 ≈ 최근 41일).
 * 공개 시세지만 내 매매 심볼 목록이 쿼리에 실리므로 /api/bitget/* 게이트 뒤에 둔다.
 * 응답: { candles: { BTCUSDT: [[openTs, close], ...오래된→최신] }, errors: [...] }
 * 마지막(진행 중) 봉도 그대로 준다 — '진입 전에 마감된 봉만' 쓰는 판단은 lib/discipline 이 한다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { BITGET_BASE } from '@/lib/bitget';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const SYM_RE = /^[A-Z0-9]{2,20}USDT$/;
const MAX_SYMBOLS = 20;
const TTL = 5 * 60_000;
const cache = new Map<string, { ts: number; rows: Array<[number, number]> }>();

async function fetch1h(symbol: string): Promise<Array<[number, number]>> {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.ts < TTL) return hit.rows;
  const res = await fetch(`${BITGET_BASE}/api/v2/mix/market/candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=1H&limit=1000`, {
    cache: 'no-store', signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json() as { code?: string; msg?: string; data?: string[][] };
  if (j.code !== '00000' || !Array.isArray(j.data)) throw new Error(`Bitget ${j.code}: ${j.msg}`);
  const rows = j.data
    .map((r) => [Number(r[0]), Number(r[4])] as [number, number])
    .filter(([t, c]) => t > 0 && c > 0)
    .sort((a, b) => a[0] - b[0]);
  cache.set(symbol, { ts: Date.now(), rows });
  return rows;
}

export async function GET(req: NextRequest) {
  const symbols = [...new Set((req.nextUrl.searchParams.get('symbols') ?? '').split(',').map((s) => s.trim().toUpperCase()))]
    .filter((s) => SYM_RE.test(s)).slice(0, MAX_SYMBOLS);
  const candles: Record<string, Array<[number, number]>> = {};
  const errors: string[] = [];
  await Promise.all(symbols.map(async (s) => {
    try { candles[s] = await fetch1h(s); } catch (e) { errors.push(`${s}: ${String(e)}`); }
  }));
  return NextResponse.json({ candles, errors });
}
