import { NextResponse } from 'next/server';
import { withCdn } from '@/lib/cdn';

/** Bitget USDT 선물 히스토리 캔들(공개, 키 불필요) — 매매 해부용. endTime 기준 과거로 limit개. */
export const dynamic = 'force-dynamic';

async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') ?? '').toUpperCase();
  const endTime = searchParams.get('endTime') ?? String(Date.now());
  const granularity = searchParams.get('granularity') ?? '1H';
  // Bitget history-candles 는 한 번에 최대 200봉 — 그 이상을 보내면 40053 오류로 빈 결과가 온다(실측)
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? 200)));
  if (!/^[A-Z0-9]{5,20}$/.test(symbol)) return NextResponse.json({ error: 'bad symbol', candles: [] }, { status: 400 });
  if (!/^\d+$/.test(endTime)) return NextResponse.json({ error: 'bad endTime', candles: [] }, { status: 400 });
  if (!/^(1m|5m|15m|30m|1H|4H|6H|12H|1D)$/.test(granularity)) return NextResponse.json({ error: 'bad granularity', candles: [] }, { status: 400 });

  const u = `https://api.bitget.com/api/v2/mix/market/history-candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=${granularity}&endTime=${endTime}&limit=${limit}`;
  try {
    const res = await fetch(u, { cache: 'no-store', signal: AbortSignal.timeout(9000) });
    const json = await res.json();
    if (json.code !== '00000') return NextResponse.json({ error: `${json.code}: ${json.msg}`, candles: [] }, { status: 200 });
    const candles = ((json.data as string[][]) ?? []).map((c) => ({ ts: +c[0], o: +c[1], h: +c[2], l: +c[3], c: +c[4] })).sort((a, b) => a.ts - b.ts);
    return NextResponse.json({ candles });
  } catch (e) {
    return NextResponse.json({ error: String(e), candles: [] }, { status: 200 });
  }
}

// CDN 캐시(과거 캔들) — 만료 후에도 직전 값을 즉시 응답
export const GET = withCdn(handler, 60, 600);
