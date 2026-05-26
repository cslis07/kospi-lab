import { NextResponse } from 'next/server';
import { fetchMarketIndex } from '@/lib/naver';
import type { MarketIndex } from '@/lib/types';

function parseIndex(raw: Record<string, string>, name: string): MarketIndex {
  return {
    name,
    value: parseFloat(String(raw.closePrice ?? raw.currentPrice ?? 0).replace(/,/g, '')),
    change: parseFloat(String(raw.compareToPreviousClosePrice ?? 0).replace(/,/g, '')),
    changeRate: parseFloat(String(raw.fluctuationsRatio ?? 0).replace(/[+%]/g, '')),
    status: raw.marketStatus ?? 'CLOSE',
  };
}

export async function GET() {
  try {
    const [kospi, kosdaq, usdkrw] = await Promise.allSettled([
      fetchMarketIndex('KOSPI'),
      fetchMarketIndex('KOSDAQ'),
      fetchMarketIndex('FX_USDKRW'),
    ]);

    return NextResponse.json({
      kospi: kospi.status === 'fulfilled' ? parseIndex(kospi.value, 'KOSPI') : null,
      kosdaq: kosdaq.status === 'fulfilled' ? parseIndex(kosdaq.value, 'KOSDAQ') : null,
      usdkrw: usdkrw.status === 'fulfilled' ? parseIndex(usdkrw.value, 'USD/KRW') : null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
