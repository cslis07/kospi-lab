import { NextResponse } from 'next/server';
import { withCdn } from '@/lib/cdn';

/**
 * 주요 코인 52주 고/저 — Bitget 스팟 주봉(1week) 캔들 최근 52개로 계산(공개, 키 불필요).
 * 코인별 52주는 티커(crypto/batch)에 없어 목록에서 주봉으로 별도 조회. 52주는 느리게 변해 길게 캐시.
 * GET ?symbols=BTCUSDT,ETHUSDT (최대 12개) → { BTCUSDT: { high52w, low52w }, ... }
 */
async function week52(symbol: string): Promise<{ high52w: number; low52w: number } | null> {
  try {
    const u = `https://api.bitget.com/api/v2/spot/market/candles?symbol=${symbol}&granularity=1week&limit=60`;
    const res = await fetch(u, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(9000) });
    const j = await res.json();
    if (j.code !== '00000' || !Array.isArray(j.data) || !j.data.length) return null;
    const rows = (j.data as string[][]).slice(-52);
    const highs = rows.map((r) => Number(r[2])).filter(Number.isFinite);
    const lows = rows.map((r) => Number(r[3])).filter(Number.isFinite);
    if (!highs.length || !lows.length) return null;
    return { high52w: Math.max(...highs), low52w: Math.min(...lows) };
  } catch {
    return null;
  }
}

async function handler(req: Request) {
  const raw = (new URL(req.url).searchParams.get('symbols') ?? '').toUpperCase();
  const symbols = raw.split(',').map((s) => s.trim()).filter((s) => /^[A-Z0-9]{5,20}$/.test(s)).slice(0, 12);
  const out: Record<string, { high52w: number; low52w: number }> = {};
  await Promise.all(symbols.map(async (s) => { const r = await week52(s); if (r) out[s] = r; }));
  return NextResponse.json(out);
}

export const GET = withCdn(handler, 3600, 21600);
export const maxDuration = 20;
