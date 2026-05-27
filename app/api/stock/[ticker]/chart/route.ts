import { NextRequest, NextResponse } from 'next/server';
import type { ChartPoint } from '@/lib/types';

const YF_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

const NAVER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  'Referer': 'https://finance.naver.com',
  'Accept': 'application/json',
};

// months → Yahoo Finance range param
const RANGE_MAP: Record<number, string> = {
  1: '1mo', 3: '3mo', 6: '6mo', 12: '1y',
};

function parseNum(s: unknown) {
  return parseFloat(String(s ?? 0).replace(/,/g, '')) || 0;
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// ── Yahoo Finance v8 chart (국내 종목: .KS / .KQ suffix) ──────────────────
async function fetchYahoo(ticker: string, market: string, months: number): Promise<ChartPoint[]> {
  const range  = RANGE_MAP[months] || '1mo';
  const suffix = market === 'KOSDAQ' ? '.KQ' : '.KS';

  const tryFetch = async (sym: string) => {
    const base = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=${range}&includePrePost=false`;
    let res = await fetch(base, { headers: YF_HEADERS, next: { revalidate: 60 } });
    if (!res.ok) {
      res = await fetch(base.replace('query1', 'query2'), { headers: YF_HEADERS, next: { revalidate: 60 } });
    }
    return res;
  };

  let res = await tryFetch(ticker + suffix);

  // KS 실패 → KQ 시도 (KOSDAQ 종목이 market 파람 없이 들어올 때)
  if (!res.ok && suffix === '.KS') {
    res = await tryFetch(ticker + '.KQ');
  }
  if (!res.ok) throw new Error(`Yahoo chart ${res.status}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('No chart result');

  const timestamps: number[]          = result.timestamp ?? [];
  const quote                          = result.indicators?.quote?.[0] ?? {};
  const closes:  (number | null)[]    = quote.close   ?? [];
  const opens:   (number | null)[]    = quote.open    ?? [];
  const highs:   (number | null)[]    = quote.high    ?? [];
  const lows:    (number | null)[]    = quote.low     ?? [];
  const volumes: (number | null)[]    = quote.volume  ?? [];

  return timestamps
    .map((ts, i) => {
      // KST 날짜 (UTC+9)
      const kst  = new Date(ts * 1000 + 9 * 3_600_000);
      const date = `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, '0')}${String(kst.getUTCDate()).padStart(2, '0')}`;
      const price = closes[i];
      return {
        date,
        price:  price  ? Math.round(price)        : 0,
        open:   opens[i]   ? Math.round(opens[i]!)  : undefined,
        high:   highs[i]   ? Math.round(highs[i]!)  : undefined,
        low:    lows[i]    ? Math.round(lows[i]!)   : undefined,
        volume: volumes[i] ?? undefined,
      } as ChartPoint;
    })
    .filter((p) => p.price > 0);
}

// ── Naver mobile fallback ─────────────────────────────────────────────────
async function fetchNaver(ticker: string, months: number): Promise<ChartPoint[]> {
  const endDate   = new Date();
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - months);

  const url = `https://m.stock.naver.com/api/stock/${ticker}/price?startDate=${fmtDate(startDate)}&endDate=${fmtDate(endDate)}&timeframe=day`;
  const res = await fetch(url, { headers: NAVER_HEADERS, next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`Naver chart ${res.status}`);

  const raw: Record<string, unknown>[] = await res.json();
  return raw
    .map((row) => ({
      date:   String(row.localTradedAt ?? '').replace(/-/g, ''),
      price:  parseNum(row.closePrice),
      open:   parseNum(row.openPrice)  || undefined,
      high:   parseNum(row.highPrice)  || undefined,
      low:    parseNum(row.lowPrice)   || undefined,
      volume: Number(row.accumulatedTradingVolume ?? 0) || undefined,
    }))
    .filter((p) => p.price > 0)
    .reverse(); // newest-first → oldest-first
}

// ── Handler ───────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const months = Math.min(12, Math.max(1, parseInt(req.nextUrl.searchParams.get('months') ?? '1')));
  const market = req.nextUrl.searchParams.get('market') ?? '';

  // 1. Yahoo Finance — range를 정확히 지원 (1mo / 3mo / 6mo / 1y)
  try {
    const points = await fetchYahoo(ticker, market, months);
    if (points.length > 0) return NextResponse.json(points);
  } catch { /* fall through */ }

  // 2. Naver mobile fallback (날짜 범위는 ~22개로 제한될 수 있음)
  try {
    const points = await fetchNaver(ticker, months);
    return NextResponse.json(points);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
