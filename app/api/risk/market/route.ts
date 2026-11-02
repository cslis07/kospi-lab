import { NextResponse } from 'next/server';
import { withCdn } from '@/lib/cdn';
import { analyzeTimeframe, tfTrend, srZones, type Candle } from '@/lib/coinAnalysis';
import type { MarketContext } from '@/lib/riskControl';

/**
 * 진입 판정용 시장 맥락 — ?symbol=BTCUSDT (BTC·ETH 중심, USDT 무기한).
 * Bitget(내 거래소) 공개 시세: 호가·마크·펀딩·4H/1D/1H/5m 봉 + 바이낸스 OI(코인 수량) 24h 변화.
 * 실패한 항목은 null 과 errors 에 남긴다(임의 값 채우지 않음). 마감 안 된 봉은 쓰지 않는다.
 * 시세 신선도 판정을 위해 CDN 캐시는 15초만.
 */
export const preferredRegion = 'icn1';
export const maxDuration = 15;

const G = 'https://api.bitget.com/api/v2/mix/market';
const UA = { 'User-Agent': 'Mozilla/5.0' };
async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: UA, cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}
type BG<T> = { code: string; msg?: string; data: T };
const okData = <T,>(j: BG<T>): T => { if (j.code !== '00000') throw new Error(j.msg ?? j.code); return j.data; };
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : null; };
const H = 3600_000;
const STEP: Record<string, number> = { '5m': 5 * 60_000, '1H': H, '4H': 4 * H, '1D': 24 * H };
const median = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y), m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

async function candles(symbol: string, g: string, limit: number, now: number): Promise<Candle[]> {
  const rows = okData(await get<BG<string[][]>>(`${G}/candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=${g}&limit=${limit}`));
  return rows.map((r) => ({ ts: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5], qv: +r[6] }))
    .filter((c) => Number.isFinite(c.c) && c.ts + STEP[g] <= now) // 마감된 봉만
    .sort((a, b) => a.ts - b.ts);
}

async function handler(req: Request) {
  const symbol = (new URL(req.url).searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
  if (!/^[A-Z0-9]{2,12}USDT$/.test(symbol)) return NextResponse.json({ error: 'symbol 형식 오류' }, { status: 400 });
  const now = Date.now();
  const errors: string[] = [];
  const [tk, fr, c4, c1d, c1h, c5, oi] = await Promise.allSettled([
    get<BG<Record<string, string>[]>>(`${G}/ticker?symbol=${symbol}&productType=USDT-FUTURES`).then(okData),
    get<BG<Record<string, string>[]>>(`${G}/current-fund-rate?symbol=${symbol}&productType=USDT-FUTURES`).then(okData),
    candles(symbol, '4H', 200, now),
    candles(symbol, '1D', 200, now),
    candles(symbol, '1H', 60, now),
    candles(symbol, '5m', 72, now),
    get<{ sumOpenInterest: string; timestamp: number }[]>(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=25`),
  ]);
  const v = <T,>(r: PromiseSettledResult<T>, name: string): T | null => {
    if (r.status === 'fulfilled') return r.value;
    errors.push(`${name}(${String((r.reason as Error)?.message ?? r.reason).slice(0, 60)})`);
    return null;
  };
  const t = v(tk, '시세')?.[0] ?? null;
  const f = v(fr, '펀딩')?.[0] ?? null;
  const k4 = v(c4, '4H봉'), kd = v(c1d, '1D봉'), kh = v(c1h, '1H봉'), k5 = v(c5, '5분봉');
  const oiRows = v(oi, '바이낸스 OI');

  const price = t ? n(t.lastPr) : null;
  const trendOf = (cs: Candle[] | null, tf: string) => (cs && cs.length >= 60 ? tfTrend(analyzeTimeframe(tf, cs)) : null);

  let support: number | null = null, resistance: number | null = null;
  if (k4 && k4.length >= 60 && price) {
    const a = analyzeTimeframe('4H', k4);
    for (const z of srZones(k4, price, a.atr)) {
      if (z.price < price && (support == null || z.price > support)) support = z.price;
      if (z.price > price && (resistance == null || z.price < resistance)) resistance = z.price;
    }
  }

  let volumeRatio1h: number | null = null, volSpike1h: number | null = null;
  if (kh && kh.length >= 26) {
    const last = kh[kh.length - 1], prev = kh.slice(-21, -1), prev24 = kh.slice(-25, -1);
    const avgV = prev.reduce((a, c) => a + c.v, 0) / prev.length;
    volumeRatio1h = avgV > 0 ? last.v / avgV : null;
    const med = median(prev24.map((c) => c.h - c.l));
    volSpike1h = med > 0 ? (last.h - last.l) / med : null;
  }

  let oiChange24hPct: number | null = null;
  if (oiRows && oiRows.length >= 25) {
    const s = [...oiRows].sort((a, b) => a.timestamp - b.timestamp);
    const a = Number(s[0].sumOpenInterest), b = Number(s[s.length - 1].sumOpenInterest);
    if (a > 0 && Number.isFinite(b) && s[s.length - 1].timestamp - s[0].timestamp === 24 * H) oiChange24hPct = ((b - a) / a) * 100;
  }

  const body: MarketContext = {
    symbol, fetchedAt: now,
    price, priceTs: t ? n(t.ts) : null,
    bid: t ? n(t.bidPr) : null, ask: t ? n(t.askPr) : null,
    fundingRate: f ? n(f.fundingRate) : t ? n(t.fundingRate) : null,
    fundingIntervalH: f ? n(f.fundingRateInterval) : null,
    trend4h: trendOf(k4, '4H'), trend1d: trendOf(kd, '1D'),
    last4hCloseTs: k4?.length ? k4[k4.length - 1].ts + STEP['4H'] : null,
    last1dCloseTs: kd?.length ? kd[kd.length - 1].ts + STEP['1D'] : null,
    support, resistance,
    volumeRatio1h, volSpike1h, oiChange24hPct,
    priceChange24hPct: t && n(t.change24h) != null ? n(t.change24h)! * 100 : null,
    m5: k5 ? k5.map((c) => ({ ts: c.ts, range: c.c > 0 ? ((c.h - c.l) / c.c) * 100 : 0 })) : null,
    errors,
  };
  return NextResponse.json(body);
}

export const GET = withCdn(handler, 15, 30);
