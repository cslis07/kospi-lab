import { NextRequest, NextResponse } from 'next/server';
import type { CryptoData } from '@/lib/types';
import { fetchBitgetTickers, type BitgetTicker } from '@/lib/bitget';

// Binance BTCUSDT → Yahoo Finance BTC-USD (Bitget 미보유 심볼 폴백용)
function toYahooSymbol(sym: string): string {
  if (sym.endsWith('USDT')) return `${sym.slice(0, -4)}-USD`;
  if (sym.endsWith('USD'))  return sym;
  return `${sym}-USD`;
}

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

function baseOf(symbol: string): string {
  return symbol.endsWith('USDT') ? symbol.slice(0, -4) : symbol.replace('-USD', '');
}

// ── Bitget 티커 → CryptoData ──────────────────────────────────────────────────
function fromBitget(symbol: string, t: BitgetTicker): CryptoData {
  const price      = Number(t.lastPr);
  const open       = Number(t.open);
  const changeRate = Number(t.change24h) * 100;
  return {
    symbol,
    baseAsset:      baseOf(symbol),
    quoteAsset:     'USDT',
    price,
    change:         open ? price - open : 0,
    changeRate,
    high24h:        Number(t.high24h),
    low24h:         Number(t.low24h),
    volume24h:      Number(t.baseVolume),
    quoteVolume24h: Number(t.quoteVolume),
  };
}

// ── Yahoo Finance 폴백 (Bitget에 없는 심볼) ───────────────────────────────────
async function fetchYahoo(symbol: string): Promise<CryptoData> {
  const yahooSym = toYahooSymbol(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=1d&range=2d&includePrePost=false`;
  let res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
  if (!res.ok) {
    res = await fetch(url.replace('query1', 'query2'), { headers: HEADERS, cache: 'no-store' });
    if (!res.ok) throw new Error(`Yahoo ${yahooSym}: ${res.status}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No result for ${yahooSym}`);
  const meta       = result.meta ?? {};
  const price      = Number(meta.regularMarketPrice ?? 0);
  const prevClose  = Number(meta.previousClose ?? meta.chartPreviousClose ?? 0);
  return {
    symbol,
    baseAsset:      baseOf(symbol),
    quoteAsset:     'USDT',
    price,
    change:         price - prevClose,
    changeRate:     prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
    high24h:        Number(meta.regularMarketDayHigh ?? price),
    low24h:         Number(meta.regularMarketDayLow  ?? price),
    volume24h:      Number(meta.regularMarketVolume  ?? 0),
    quoteVolume24h: Number(meta.regularMarketVolume  ?? 0) * price,
  };
}

export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get('symbols') ?? '')
    .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 20);

  if (!symbols.length) return NextResponse.json({});

  const map: Record<string, CryptoData> = {};

  // 1순위: Bitget 공개 티커 (전체 1콜, 안정적)
  let bitget: Map<string, BitgetTicker> | null = null;
  try {
    bitget = await fetchBitgetTickers();
  } catch { /* Bitget 실패 시 전량 Yahoo 폴백 */ }

  const missing: string[] = [];
  for (const sym of symbols) {
    const t = bitget?.get(sym);
    if (t) map[sym] = fromBitget(sym, t);
    else missing.push(sym);
  }

  // 2순위: Bitget에 없는 심볼만 Yahoo 폴백
  if (missing.length) {
    const settled = await Promise.allSettled(missing.map(fetchYahoo));
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') map[missing[i]] = r.value;
    });
  }

  return NextResponse.json(map);
}
