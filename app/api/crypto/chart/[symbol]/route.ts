import { NextRequest, NextResponse } from 'next/server';
import { BITGET_BASE } from '@/lib/bitget';

interface CryptoChartPoint {
  date: string;
  price: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

function ymd(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

// BTCUSDT → BTC-USD (Yahoo 폴백용)
function toYahooSymbol(sym: string): string {
  if (sym.endsWith('USDT')) return `${sym.slice(0, -4)}-USD`;
  if (sym.endsWith('USD'))  return sym;
  return `${sym}-USD`;
}
const RANGE_MAP: Record<number, string> = { 1: '1mo', 3: '3mo', 6: '6mo', 12: '1y' };

// ── Bitget 일봉 캔들 ──────────────────────────────────────────────────────────
async function fromBitget(symbol: string, days: number): Promise<CryptoChartPoint[]> {
  const url = `${BITGET_BASE}/api/v2/spot/market/candles?symbol=${symbol}&granularity=1day&limit=${days}`;
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Bitget candles ${res.status}`);
  const json = await res.json();
  if (json.code !== '00000') throw new Error(`Bitget ${json.code}`);
  // data: [ts, open, high, low, close, baseVol, quoteVol, usdtVol]
  return (json.data as string[][])
    .map((c) => ({
      date:   ymd(Number(c[0])),
      price:  Number(c[4]),
      open:   Number(c[1]),
      high:   Number(c[2]),
      low:    Number(c[3]),
      volume: Number(c[5]),
    }))
    .filter((p) => p.price > 0);
}

// ── Yahoo 폴백 ────────────────────────────────────────────────────────────────
async function fromYahoo(symbol: string, range: string): Promise<CryptoChartPoint[]> {
  const yahooSym = toYahooSymbol(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=1d&range=${range}&includePrePost=false`;
  let res = await fetch(url, { headers: HEADERS, next: { revalidate: 60 } });
  if (!res.ok) {
    res = await fetch(url.replace('query1', 'query2'), { headers: HEADERS, next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`Yahoo chart ${res.status}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('No chart result');
  const ts: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  return ts
    .map((t, i) => ({
      date:   ymd(t * 1000),
      price:  q.close?.[i] ?? 0,
      open:   q.open?.[i]   ?? undefined,
      high:   q.high?.[i]   ?? undefined,
      low:    q.low?.[i]    ?? undefined,
      volume: q.volume?.[i] ?? undefined,
    }))
    .filter((p) => p.price > 0);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const sym    = symbol.toUpperCase();
  const months = Math.min(12, Math.max(1, parseInt(req.nextUrl.searchParams.get('months') ?? '1')));
  const days   = { 1: 31, 3: 92, 6: 183, 12: 366 }[months] ?? 31;

  // 1순위: Bitget 일봉
  try {
    const pts = await fromBitget(sym, days);
    if (pts.length) return NextResponse.json(pts);
  } catch { /* Yahoo 폴백 */ }

  // 2순위: Yahoo
  try {
    return NextResponse.json(await fromYahoo(sym, RANGE_MAP[months] || '1mo'));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
