/**
 * 급변 확률 계기판 — 지금 이 코인이 사전 등록 신호(lib/crashPrecursor) 중 어디에 해당하나(실시간 상태만).
 * 측정 확률은 정적 파일 /data/precursor-stats.json(scripts/precursor-stats.ts 생성)을 화면이 따로 읽는다.
 * 공개(시세 기반) · CDN 60초.
 */
import { NextRequest, NextResponse } from 'next/server';
import { liveState, type Bar } from '@/lib/crashPrecursor';

export const maxDuration = 15;
export const revalidate = 0;

const SYM_RE = /^(BTC|ETH|SOL|XRP)USDT$/;

async function bitget(symbol: string, g: string, limit: number): Promise<Bar[]> {
  const j = await fetch(`https://api.bitget.com/api/v2/mix/market/candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=${g}&limit=${limit}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) }).then((r) => r.json());
  if (j?.code !== '00000') throw new Error(`Bitget ${g}`);
  const ms = g === '1H' ? 3_600_000 : 900_000;
  return (j.data as string[][]).map((r) => ({ ts: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }))
    .sort((a, b) => a.ts - b.ts).filter((b) => b.ts + ms <= Date.now());   // 마감된 봉만
}

async function oiChg6h(symbol: string): Promise<number | null> {
  try {
    const j = await fetch(`https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${symbol}&intervalTime=1h&limit=8`, { cache: 'no-store', signal: AbortSignal.timeout(6000) }).then((r) => r.json());
    const l = ((j?.result?.list ?? []) as { timestamp: string; openInterest: string }[]).map((x) => ({ ts: +x.timestamp, v: +x.openInterest })).sort((a, b) => a.ts - b.ts);
    return l.length >= 7 ? (l[l.length - 1].v / l[l.length - 7].v - 1) * 100 : null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
  if (!SYM_RE.test(symbol)) return NextResponse.json({ error: 'BTC·ETH·SOL·XRP USDT만 측정돼 있습니다' }, { status: 400 });
  try {
    const [h1, m15, oi] = await Promise.all([bitget(symbol, '1H', 1000), bitget(symbol, '15m', 200), oiChg6h(symbol)]);
    return NextResponse.json({ symbol, asOf: Date.now(), state: liveState(h1, m15, oi), oiChg6h: oi }, { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=60' } });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
