import { NextRequest, NextResponse } from 'next/server';
import type { OverseasStockData } from '@/lib/types';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

function fmtCap(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

function fmtVol(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get('symbols') ?? '')
    .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 20);

  if (!symbols.length) return NextResponse.json({});

  try {
    const url =
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}&lang=en-US&region=US`;

    const res = await fetch(url, { headers: HEADERS, next: { revalidate: 0 } });
    if (!res.ok) {
      // fallback to query2
      const res2 = await fetch(
        url.replace('query1', 'query2'),
        { headers: HEADERS, next: { revalidate: 0 } }
      );
      if (!res2.ok) throw new Error(`Yahoo Finance ${res2.status}`);
      const d2 = await res2.json();
      return buildResponse(d2);
    }
    const data = await res.json();
    return buildResponse(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

function buildResponse(data: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = (data as any)?.quoteResponse?.result ?? [];
  const map: Record<string, OverseasStockData> = {};

  for (const item of results) {
    const sym: string = item.symbol ?? '';
    if (!sym) continue;

    const rawCap  = item.marketCap ?? 0;
    const rawVol  = item.regularMarketVolume ?? 0;

    map[sym] = {
      symbol:     sym,
      name:       item.shortName ?? item.longName ?? sym,
      price:      item.regularMarketPrice ?? 0,
      change:     item.regularMarketChange ?? 0,
      changeRate: item.regularMarketChangePercent ?? 0,
      volume:     rawVol,
      marketCap:  rawCap,
      exchange:   normalizeExchange(item.fullExchangeName ?? ''),
      currency:   item.currency ?? 'USD',
      prevClose:  item.regularMarketPreviousClose,
      high52w:    item.fiftyTwoWeekHigh,
      low52w:     item.fiftyTwoWeekLow,
      // attach formatted helpers as extra fields
      volumeFmt:  fmtVol(rawVol),
      marketCapFmt: fmtCap(rawCap),
    } as OverseasStockData & { volumeFmt: string; marketCapFmt: string };
  }

  return NextResponse.json(map);
}

function normalizeExchange(raw: string): string {
  if (raw.toLowerCase().includes('nasdaq')) return 'NASDAQ';
  if (raw.toLowerCase().includes('nyse'))   return 'NYSE';
  return raw;
}
