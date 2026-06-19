import { NextResponse } from 'next/server';
import { fetchBitgetFuturesTickers } from '@/lib/bitget';

export async function GET() {
  try {
    const { list } = await fetchBitgetFuturesTickers();
    const rows = list.map((t) => ({
      symbol:        t.symbol,
      price:         Number(t.lastPr),
      changeRate:    Number(t.change24h) * 100,
      high24h:       Number(t.high24h),
      low24h:        Number(t.low24h),
      quoteVolume:   Number(t.quoteVolume),
      fundingRate:   t.fundingRate ? Number(t.fundingRate) * 100 : null,
      holdingAmount: t.holdingAmount ? Number(t.holdingAmount) : null,
      indexPrice:    t.indexPrice ? Number(t.indexPrice) : null,
      markPrice:     t.markPrice ? Number(t.markPrice) : null,
    }));
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
