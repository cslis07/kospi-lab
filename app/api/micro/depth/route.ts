import { NextResponse } from 'next/server';
import { withCdn } from '@/lib/cdn';
import { type BandDepth, toLevels, bandDepth } from '@/lib/microData';

/**
 * 바이낸스·바이비트 호가 깊이(4코인 고정) — 미시 데이터 수집기(scripts/microCollect.mts) 전용.
 * GitHub 러너는 미국 IP라 두 거래소가 막혀서, 서울 리전(icn1)인 이 경로를 거쳐 받는다.
 * 공개 무키 API·개인정보 없음. 입력 인자 없음(임의 심볼로 외부 호출을 늘리지 못하게). 화면에서는 쓰지 않는다.
 */
export const preferredRegion = 'icn1';
export const maxDuration = 15;

const COINS = ['BTC', 'ETH', 'SOL', 'XRP'];
type Rows = unknown[][];
async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}
const quiet = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

async function handler() {
  const depth: Record<string, { binance: BandDepth | null; bybit: BandDepth | null }> = {};
  await Promise.all(COINS.map(async (c) => {
    const [bn, by] = await Promise.all([
      quiet(get<{ bids: Rows; asks: Rows }>(`https://fapi.binance.com/fapi/v1/depth?symbol=${c}USDT&limit=1000`).then((d) => bandDepth({ bids: toLevels(d.bids), asks: toLevels(d.asks) }))),
      quiet(get<{ result: { b: Rows; a: Rows } }>(`https://api.bybit.com/v5/market/orderbook?category=linear&symbol=${c}USDT&limit=500`).then((d) => bandDepth({ bids: toLevels(d.result.b), asks: toLevels(d.result.a) }))),
    ]);
    depth[c] = { binance: bn, bybit: by };
  }));
  return NextResponse.json({ t: Date.now(), depth });
}

// 수집기가 15초 간격으로 부른다 — 5초만 공유(연타 방지), 묵은 값은 주지 않음
export const GET = withCdn(handler, 5, 0);
