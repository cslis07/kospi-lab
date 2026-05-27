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

/**
 * Frankfurter (api.frankfurter.app) — ECB 공개 FX API, 인증 불필요
 * 지난 7일치 데이터를 한 번에 받아 최신 2영업일 비교로 당일 변동 계산
 * USD base → KRW, JPY 동시 조회 후 cross-rate로 JPY/KRW 산출
 */
async function fetchFxRates(): Promise<{ usdkrw: FxRate | null; jpykrw: FxRate | null }> {
  try {
    const from = new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10);
    const res = await fetch(
      `https://api.frankfurter.app/${from}..?from=USD&to=KRW,JPY`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) throw new Error(`frankfurter ${res.status}`);

    const data: { rates: Record<string, { KRW: number; JPY: number }> } = await res.json();
    const dates = Object.keys(data.rates).sort();
    if (!dates.length) throw new Error('empty');

    const todayR = data.rates[dates[dates.length - 1]];
    const prevR  = dates.length >= 2 ? data.rates[dates[dates.length - 2]] : null;

    /* USD/KRW */
    const usdVal    = todayR.KRW;
    const usdChg    = prevR ? usdVal - prevR.KRW : 0;
    const usdChgPct = prevR ? (usdChg / prevR.KRW) * 100 : 0;

    /* JPY/KRW cross-rate: KRW/JPY = (KRW per USD) ÷ (JPY per USD) */
    const jpyVal1  = todayR.KRW / todayR.JPY;           // per 1 JPY
    const jpyPrev1 = prevR ? prevR.KRW / prevR.JPY : jpyVal1;
    const jpyChg1  = jpyVal1 - jpyPrev1;
    const jpyChgPct = jpyPrev1 ? (jpyChg1 / jpyPrev1) * 100 : 0;

    return {
      usdkrw: { value: usdVal,        change: usdChg,    changeRate: usdChgPct },
      jpykrw: { value: jpyVal1 * 100, change: jpyChg1 * 100, changeRate: jpyChgPct },
    };
  } catch (e) {
    console.error('[FX] frankfurter failed:', e);
    return { usdkrw: null, jpykrw: null };
  }
}

export async function GET() {
  try {
    const [kospi, kosdaq, kpi200, fx] = await Promise.allSettled([
      fetchMarketIndex('KOSPI'),
      fetchMarketIndex('KOSDAQ'),
      fetchMarketIndex('KPI200'),
      fetchFxRates(),
    ]);

    const fxData = fx.status === 'fulfilled' ? fx.value : { usdkrw: null, jpykrw: null };

    return NextResponse.json({
      kospi:  kospi.status  === 'fulfilled' ? parseIndex(kospi.value,  'KOSPI')  : null,
      kosdaq: kosdaq.status === 'fulfilled' ? parseIndex(kosdaq.value, 'KOSDAQ') : null,
      kpi200: kpi200.status === 'fulfilled' ? parseIndex(kpi200.value, 'KPI200') : null,
      usdkrw: fxData.usdkrw,
      jpykrw: fxData.jpykrw,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
