import { NextResponse } from 'next/server';
import { fetchMarketIndex } from '@/lib/naver';
import type { MarketIndex, FxRate } from '@/lib/types';

function parseIndex(raw: Record<string, string>, name: string): MarketIndex {
  return {
    name,
    value: parseFloat(String(raw.closePrice ?? raw.currentPrice ?? 0).replace(/,/g, '')),
    change: parseFloat(String(raw.compareToPreviousClosePrice ?? 0).replace(/,/g, '')),
    changeRate: parseFloat(String(raw.fluctuationsRatio ?? 0).replace(/[+%]/g, '')),
    status: raw.marketStatus ?? 'CLOSE',
  };
}

// Dunamu (Kakao) FX API — public, no key required
async function fetchFx(code: string): Promise<FxRate> {
  const res = await fetch(
    `https://quotation-api-cdn.dunamu.com/v1/forex/recent?codes=${code}`,
    { next: { revalidate: 60 } }
  );
  if (!res.ok) throw new Error(`FX ${code} status ${res.status}`);
  const data = await res.json();
  const item = data?.[0];
  if (!item) throw new Error('empty FX data');
  const sign = item.change === 'FALL' ? -1 : 1;
  return {
    value: Number(item.basePrice),
    change: sign * Number(item.changePrice ?? 0),
    changeRate: sign * Number(item.changeRate ?? 0) * 100,
  };
}

export async function GET() {
  try {
    const [kospi, kosdaq, kpi200, usdkrw, jpykrw] = await Promise.allSettled([
      fetchMarketIndex('KOSPI'),
      fetchMarketIndex('KOSDAQ'),
      fetchMarketIndex('KPI200'),
      fetchFx('FRX.KRWUSD'),
      fetchFx('FRX.KRWJPY'),
    ]);

    // JPY: display per 100엔 (multiply raw ×100)
    const jpyRaw = jpykrw.status === 'fulfilled' ? jpykrw.value : null;
    const jpyNorm: FxRate | null = jpyRaw
      ? { value: jpyRaw.value * 100, change: jpyRaw.change * 100, changeRate: jpyRaw.changeRate }
      : null;

    return NextResponse.json({
      kospi:  kospi.status  === 'fulfilled' ? parseIndex(kospi.value,  'KOSPI')   : null,
      kosdaq: kosdaq.status === 'fulfilled' ? parseIndex(kosdaq.value, 'KOSDAQ')  : null,
      kpi200: kpi200.status === 'fulfilled' ? parseIndex(kpi200.value, 'KPI200')  : null,
      usdkrw: usdkrw.status === 'fulfilled' ? usdkrw.value : null,
      jpykrw: jpyNorm,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
