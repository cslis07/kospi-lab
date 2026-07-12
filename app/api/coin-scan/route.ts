import { NextResponse } from 'next/server';
import {
  Candle, analyzeTimeframe, buildVerdict, srZones, fibonacci, atr,
} from '@/lib/coinAnalysis';
import { BITGET_BASE } from '@/lib/bitget';

/**
 * 4개 코인의 룰 엔진 판정만 일괄 계산하는 경량 스캐너.
 * 뉴스·AI 브리핑·백테스트·파생 수급을 뺀 순수 기술적 신호 — "지금 어떤 코인이 강한가"용.
 * 정밀 판정(수급·이벤트 포함)은 개별 분석(/api/coin-analysis)이 담당한다.
 */
export const maxDuration = 30;
export const preferredRegion = 'icn1';
export const dynamic = 'force-dynamic';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'SOLUSDT'] as const;
const NAMES: Record<string, string> = {
  BTCUSDT: '비트코인', ETHUSDT: '이더리움', XRPUSDT: '리플', SOLUSDT: '솔라나',
};

interface ScanItem {
  symbol: string;
  name: string;
  price: number;
  score: number;
  direction: 'long' | 'short' | 'wait';
  entryOk: boolean;
  state: string;
  stopPct: number;
  levAggressive: number;
}

let _cache: { ts: number; items: ScanItem[] } | null = null;
const TTL = 3 * 60 * 1000;

async function fetchCandles(symbol: string, granularity: string, limit: number): Promise<Candle[]> {
  const url = `${BITGET_BASE}/api/v2/mix/market/candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=${granularity}&limit=${limit}`;
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Bitget candles ${res.status}`);
  const json = await res.json();
  if (json.code !== '00000') throw new Error(`Bitget ${json.code}: ${json.msg}`);
  return (json.data as string[][]).map((r) => ({
    ts: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]),
    c: Number(r[4]), v: Number(r[5]), qv: Number(r[6]),
  }));
}

async function scanOne(symbol: string): Promise<ScanItem | null> {
  try {
    const [c1h, c15, c5] = await Promise.all([
      fetchCandles(symbol, '1H', 250),
      fetchCandles(symbol, '15m', 200),
      fetchCandles(symbol, '5m', 200),
    ]);
    const h1 = analyzeTimeframe('1H', c1h);
    const m15 = analyzeTimeframe('15m', c15);
    const m5 = analyzeTimeframe('5m', c5);
    const price = m5.close;
    const zones = srZones(c15, price, atr(c15));
    const fib = fibonacci(c15, price);
    const v = buildVerdict(h1, m15, m5, 0, null, fib, zones, null, {});
    return {
      symbol, name: NAMES[symbol] ?? symbol, price,
      score: v.score, direction: v.direction, entryOk: v.entryOk,
      state: v.state, stopPct: v.stopPct, levAggressive: v.leverage.aggressive,
    };
  } catch (e) {
    console.error(`[coin-scan] ${symbol} 실패`, e);
    return null;
  }
}

export async function GET() {
  if (_cache && Date.now() - _cache.ts < TTL) {
    return NextResponse.json({ items: _cache.items, cached: true, updatedAt: _cache.ts });
  }
  const settled = await Promise.all(SYMBOLS.map(scanOne));
  const items = settled.filter((x): x is ScanItem => x !== null);
  if (items.length) _cache = { ts: Date.now(), items };
  return NextResponse.json({ items, cached: false, updatedAt: Date.now() });
}
