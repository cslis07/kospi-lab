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

/** 해외 지수 — Yahoo chart meta(무키). NASDAQ=^IXIC. 종가·전일종가로 변동 계산 */
async function fetchYahooIndex(symbol: string, name: string): Promise<MarketIndex | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store', signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    const m = (await res.json())?.chart?.result?.[0]?.meta;
    if (!m?.regularMarketPrice) return null;
    const value = Number(m.regularMarketPrice);
    const prev = Number(m.chartPreviousClose ?? m.previousClose ?? value);
    const change = value - prev;
    return { name, value, change, changeRate: prev ? (change / prev) * 100 : 0, status: 'CLOSE' };
  } catch { return null; }
}

/** USDT/KRW — 업비트 KRW-USDT 티커(공개, 인증 불필요). 김치 프리미엄 반영 실거래가 */
async function fetchUsdtKrw(): Promise<FxRate | null> {
  try {
    const res = await fetch('https://api.upbit.com/v1/ticker?markets=KRW-USDT', {
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`upbit ${res.status}`);
    const arr = await res.json();
    const t = Array.isArray(arr) ? arr[0] : null;
    if (!t) return null;
    return {
      value: Number(t.trade_price),
      change: Number(t.signed_change_price),
      changeRate: Number(t.signed_change_rate) * 100,
    };
  } catch (e) {
    console.error('[FX] upbit USDT failed:', e);
    return null;
  }
}

export async function GET() {
  try {
    const [kospi, kosdaq, kpi200, nasdaq, fx, usdt] = await Promise.allSettled([
      fetchMarketIndex('KOSPI'),
      fetchMarketIndex('KOSDAQ'),
      fetchMarketIndex('KPI200'),
      fetchYahooIndex('^IXIC', 'NASDAQ'),
      fetchFxRates(),
      fetchUsdtKrw(),
    ]);

    const fxData = fx.status === 'fulfilled' ? fx.value : { usdkrw: null, jpykrw: null };

    return NextResponse.json({
      kospi:  kospi.status  === 'fulfilled' ? parseIndex(kospi.value,  'KOSPI')  : null,
      kosdaq: kosdaq.status === 'fulfilled' ? parseIndex(kosdaq.value, 'KOSDAQ') : null,
      kpi200: kpi200.status === 'fulfilled' ? parseIndex(kpi200.value, 'KPI200') : null,
      nasdaq: nasdaq.status === 'fulfilled' ? nasdaq.value : null,
      usdkrw: fxData.usdkrw,
      jpykrw: fxData.jpykrw,
      usdtkrw: usdt.status === 'fulfilled' ? usdt.value : null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
