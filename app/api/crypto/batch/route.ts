import { NextRequest, NextResponse } from 'next/server';
import type { CryptoData } from '@/lib/types';

const HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0',
};

export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get('symbols') ?? '')
    .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 20);

  if (!symbols.length) return NextResponse.json({});

  // Binance 배치 조회: symbols=["BTCUSDT","ETHUSDT",...]
  const encoded = encodeURIComponent(JSON.stringify(symbols));
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encoded}`;

  try {
    const res = await fetch(url, { headers: HEADERS, next: { revalidate: 0 } });
    if (!res.ok) throw new Error(`Binance ${res.status}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: any[] = await res.json();

    const map: Record<string, CryptoData> = {};
    for (const t of list) {
      const sym: string = t.symbol;
      // 기본자산 = USDT 앞부분 (BTCUSDT → BTC)
      const base = sym.endsWith('USDT') ? sym.slice(0, -4) : sym;
      map[sym] = {
        symbol:         sym,
        baseAsset:      base,
        quoteAsset:     'USDT',
        price:          parseFloat(t.lastPrice  ?? 0),
        change:         parseFloat(t.priceChange ?? 0),
        changeRate:     parseFloat(t.priceChangePercent ?? 0),
        high24h:        parseFloat(t.highPrice   ?? 0),
        low24h:         parseFloat(t.lowPrice    ?? 0),
        volume24h:      parseFloat(t.volume      ?? 0),
        quoteVolume24h: parseFloat(t.quoteVolume ?? 0),
      };
    }
    return NextResponse.json(map);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
