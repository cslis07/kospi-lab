// 3모드 진입 신호 전용 경량 엔드포인트 — 캔들+펀딩+테이커만 사용해 빠르게 응답
// (무거운 coin-analysis: AI브리핑·백테스트·뉴스·오더북·DVOL은 '분석' 버튼에서만)
import { NextRequest, NextResponse } from 'next/server';
import { buildModes, type Candle } from '@/lib/coinSignalModes';
import { getEtfFlows, etfBiasFor } from '@/lib/etfFlow';

export const maxDuration = 15;
export const preferredRegion = 'icn1'; // Bitget 안정
export const dynamic = 'force-dynamic';

const BITGET = 'https://api.bitget.com';
const COINS = new Set(['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'SOLUSDT']);

async function candles(sym: string, g: string, limit: number): Promise<Candle[]> {
  const u = `${BITGET}/api/v2/mix/market/candles?symbol=${sym}&productType=USDT-FUTURES&granularity=${g}&limit=${limit}`;
  const j = await (await fetch(u, { cache: 'no-store', signal: AbortSignal.timeout(8000) })).json();
  if (j.code !== '00000') throw new Error(`Bitget ${j.code}`);
  return (j.data as string[][]).map((r) => ({ ts: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5], qv: +r[6] }));
}
async function fundingRate(sym: string): Promise<number> {
  try {
    const j = await (await fetch(`${BITGET}/api/v2/mix/market/current-fund-rate?symbol=${sym}&productType=USDT-FUTURES`, { cache: 'no-store', signal: AbortSignal.timeout(7000) })).json();
    return Number(j?.data?.[0]?.fundingRate ?? 0);
  } catch { return 0; }
}
async function takerRatio(sym: string): Promise<number | null> {
  try {
    const j = await (await fetch(`${BITGET}/api/v2/mix/market/taker-buy-sell?symbol=${sym}&productType=USDT-FUTURES&period=5m`, { cache: 'no-store', signal: AbortSignal.timeout(7000) })).json();
    const rows = (j?.data ?? []) as { buyVolume: string; sellVolume: string }[];
    const last6 = rows.slice(-6);
    const b = last6.reduce((a, r) => a + Number(r.buyVolume), 0), s = last6.reduce((a, r) => a + Number(r.sellVolume), 0);
    return s > 0 ? b / s : null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
  if (!COINS.has(symbol)) return NextResponse.json({ error: `지원하지 않는 심볼: ${symbol}` }, { status: 400 });
  try {
    const [c5m, c15m, c1h, c4h, c1d, funding, taker, etf] = await Promise.all([
      candles(symbol, '5m', 300), candles(symbol, '15m', 300), candles(symbol, '1H', 300),
      candles(symbol, '4H', 250), candles(symbol, '1D', 250),
      fundingRate(symbol), takerRatio(symbol), getEtfFlows().catch(() => null),
    ]);
    const modes = buildModes({
      candles: { c5m, c15m, c1h, c4h, c1d },
      derivs: { funding, oiChgPct: null, takerRatio: taker, lsRatio: null },
      etfBias: etfBiasFor(etf, symbol.replace('USDT', '')),
    });
    return NextResponse.json({ symbol, price: c5m[c5m.length - 1].c, ts: Date.now(), modes }, {
      headers: { 'Cache-Control': 's-maxage=20, stale-while-revalidate=40' },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
