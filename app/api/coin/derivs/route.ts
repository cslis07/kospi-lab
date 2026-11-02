import { NextResponse } from 'next/server';
import { withCdn } from '@/lib/cdn';
import {
  type Venue, type VenueSnap, VENUES, num, venueSymbols, nextHour, fundingNorm, premiumPct, fundingSummary,
  sumAligned, changeOver, oiPriceQuadrant, longPctOf, crowdGap,
} from '@/lib/derivsMulti';

/**
 * 거래소별 파생 수급 — ?symbol=BTCUSDT
 * 바이낸스·바이비트·OKX·비트겟·하이퍼리퀴드 공개 무키 API. 한 거래소가 막혀도 나머지로 계산(venues[].ok=false).
 * 바이낸스·바이비트는 미국 IP 차단 → icn1 고정. 계산은 lib/derivsMulti(테스트 고정).
 */
export const preferredRegion = 'icn1';
export const maxDuration = 15;

const UA = { 'User-Agent': 'Mozilla/5.0' };
async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: UA, cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}
async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { ...UA, 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}
const val = <T,>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null);
const H = 3600_000;

type Row = Record<string, string>;
type LS = { longShortRatio: string; timestamp: number }[];

async function handler(req: Request) {
  const symbol = (new URL(req.url).searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
  if (!/^[A-Z0-9]{2,12}USDT$/.test(symbol)) return NextResponse.json({ error: 'symbol 형식 오류' }, { status: 400 });
  const s = venueSymbols(symbol);
  const B = 'https://fapi.binance.com', Y = 'https://api.bybit.com/v5/market', O = 'https://www.okx.com/api/v5', G = 'https://api.bitget.com/api/v2/mix/market';
  const now = Date.now();

  const [
    bnPrem, bnOi, bnOiH, bnGlobal, bnTopPos, bnTopAcc, bnKl,
    byTk, byOiH, byLs,
    okFund, okOi, okOiH, okMark, okIdx, okLs,
    bgTk, bgFund,
    hlCtx, hlPred,
  ] = await Promise.allSettled([
    get<Row>(`${B}/fapi/v1/premiumIndex?symbol=${s.binance}`),
    get<Row>(`${B}/fapi/v1/openInterest?symbol=${s.binance}`),
    get<Row[]>(`${B}/futures/data/openInterestHist?symbol=${s.binance}&period=1h&limit=25`),
    get<LS>(`${B}/futures/data/globalLongShortAccountRatio?symbol=${s.binance}&period=1h&limit=25`),
    get<LS>(`${B}/futures/data/topLongShortPositionRatio?symbol=${s.binance}&period=1h&limit=25`),
    get<LS>(`${B}/futures/data/topLongShortAccountRatio?symbol=${s.binance}&period=1h&limit=1`),
    get<(string | number)[][]>(`${B}/fapi/v1/klines?symbol=${s.binance}&interval=1h&limit=26`),
    get<{ result: { list: Row[] } }>(`${Y}/tickers?category=linear&symbol=${s.bybit}`),
    get<{ result: { list: Row[] } }>(`${Y}/open-interest?category=linear&symbol=${s.bybit}&intervalTime=1h&limit=25`),
    get<{ result: { list: Row[] } }>(`${Y}/account-ratio?category=linear&symbol=${s.bybit}&period=1h&limit=1`),
    get<{ data: Row[] }>(`${O}/public/funding-rate?instId=${s.okx}`),
    get<{ data: Row[] }>(`${O}/public/open-interest?instType=SWAP&instId=${s.okx}`),
    get<{ data: string[][] }>(`${O}/rubik/stat/contracts/open-interest-history?instId=${s.okx}&period=1H&limit=25`),
    get<{ data: Row[] }>(`${O}/public/mark-price?instType=SWAP&instId=${s.okx}`),
    get<{ data: Row[] }>(`${O}/market/index-tickers?instId=${s.base}-USDT`),
    get<{ data: string[][] }>(`${O}/rubik/stat/contracts/long-short-account-ratio?ccy=${s.base}&period=1H`),
    get<{ data: Row[] }>(`${G}/ticker?symbol=${s.bitget}&productType=USDT-FUTURES`),
    get<{ data: Row[] }>(`${G}/current-fund-rate?symbol=${s.bitget}&productType=USDT-FUTURES`),
    post<[{ universe: { name: string }[] }, Row[]]>('https://api.hyperliquid.xyz/info', { type: 'metaAndAssetCtxs' }),
    post<[string, [string, { fundingRate: string; nextFundingTime: number; fundingIntervalHours: number }][]][]>('https://api.hyperliquid.xyz/info', { type: 'predictedFundings' }),
  ]);

  // 하이퍼리퀴드가 알려주는 바이낸스·바이비트 정산 주기(4h 로 바뀐 종목 대응)
  const pred = val(hlPred)?.find((x) => x[0] === s.base)?.[1] ?? [];
  const predInt = (v: string) => pred.find((p) => p[0] === v)?.[1].fundingIntervalHours ?? null;

  const snaps: VenueSnap[] = [];

  const bp = val(bnPrem);
  if (bp) {
    snaps.push({ venue: 'binance', fundingRate: num(bp.lastFundingRate), intervalH: predInt('BinPerp') ?? 8, nextFundingTime: num(bp.nextFundingTime), oiCoins: num(val(bnOi)?.openInterest), mark: num(bp.markPrice), index: num(bp.indexPrice) });
  }
  const yt = val(byTk)?.result?.list?.[0];
  if (yt) {
    snaps.push({ venue: 'bybit', fundingRate: num(yt.fundingRate), intervalH: num(yt.fundingIntervalHour) ?? predInt('BybitPerp') ?? 8, nextFundingTime: num(yt.nextFundingTime), oiCoins: num(yt.singleOpenInterest) ?? (num(yt.openInterest) != null ? num(yt.openInterest)! / 2 : null), mark: num(yt.markPrice), index: num(yt.indexPrice) });
  }
  const of = val(okFund)?.data?.[0];
  if (of) {
    const ft = num(of.fundingTime), nft = num(of.nextFundingTime);
    snaps.push({ venue: 'okx', fundingRate: num(of.fundingRate), intervalH: ft && nft && nft > ft ? Math.round((nft - ft) / H) : 8, nextFundingTime: ft, oiCoins: num(val(okOi)?.data?.[0]?.oiCcy), mark: num(val(okMark)?.data?.[0]?.markPx), index: num(val(okIdx)?.data?.[0]?.idxPx) });
  }
  const gt = val(bgTk)?.data?.[0];
  if (gt) {
    const gf = val(bgFund)?.data?.[0];
    snaps.push({ venue: 'bitget', fundingRate: num(gf?.fundingRate ?? gt.fundingRate), intervalH: num(gf?.fundingRateInterval) ?? 8, nextFundingTime: num(gf?.nextUpdate), oiCoins: num(gt.holdingAmount), mark: num(gt.markPrice), index: num(gt.indexPrice) });
  }
  const hl = val(hlCtx);
  const hi = hl ? hl[0].universe.findIndex((u) => u.name === s.base) : -1;
  if (hl && hi >= 0) {
    const c = hl[1][hi];
    snaps.push({ venue: 'hyperliquid', fundingRate: num(c.funding), intervalH: 1, nextFundingTime: nextHour(now), oiCoins: num(c.openInterest), mark: num(c.markPx), index: num(c.oraclePx) });
  }

  const venues = VENUES.map((v) => {
    const sn = snaps.find((x) => x.venue === v);
    if (!sn) return { venue: v, ok: false };
    const f = fundingNorm(sn.fundingRate, sn.intervalH);
    const px = sn.mark ?? sn.index;
    return { venue: v, ok: true, fundingRate: sn.fundingRate, intervalH: sn.intervalH, nextFundingTime: sn.nextFundingTime, per8hPct: f?.per8hPct ?? null, annualPct: f?.annualPct ?? null, premiumPct: premiumPct(sn.mark, sn.index), oiCoins: sn.oiCoins, oiUsd: sn.oiCoins != null && px ? sn.oiCoins * px : null };
  });

  // OI 시계열(코인 수량) — 바이낸스·바이비트·OKX 합산. 비트겟·하이퍼리퀴드는 공개 이력이 없어 현재값만
  const hist: { venue: Venue; m: Map<number, number> }[] = [];
  const bh = val(bnOiH);
  if (Array.isArray(bh) && bh.length) hist.push({ venue: 'binance', m: new Map(bh.map((r) => [Number(r.timestamp), Number(r.sumOpenInterest)] as [number, number]).filter(([, v]) => v > 0)) });
  const yh = val(byOiH)?.result?.list;
  if (yh?.length) hist.push({ venue: 'bybit', m: new Map(yh.map((r) => [Number(r.timestamp), Number(r.singleOpenInterest ?? Number(r.openInterest) / 2)] as [number, number]).filter(([, v]) => v > 0)) });
  const oh = val(okOiH)?.data;
  if (oh?.length) hist.push({ venue: 'okx', m: new Map(oh.map((r) => [Number(r[0]), Number(r[2])] as [number, number]).filter(([, v]) => v > 0)) });
  const oiSeries = sumAligned(hist.map((h) => h.m));
  // 그 시각 가격 = 그 시각에 시작한 1h 봉의 시가(바이낸스 → 실패 시 바이비트 마크 기준 없음)
  const opens = new Map((val(bnKl) ?? []).map((k) => [Number(k[0]), Number(k[1])] as [number, number]));
  const pts = oiSeries.filter((p) => opens.has(p.ts));
  const oiPts = pts.map((p) => ({ ts: p.ts, v: p.sum }));
  const pxPts = pts.map((p) => ({ ts: p.ts, v: opens.get(p.ts)! }));
  const chg = (h: number) => ({ oiPct: changeOver(oiPts, h), pricePct: changeOver(pxPts, h) });
  const c1 = chg(1), c24 = chg(24);

  // 롱숏 — 바이낸스 전체 계정·상위 계정·상위 포지션, 바이비트·OKX 전체 계정
  const last = (r: PromiseSettledResult<LS>) => { const a = val(r); return Array.isArray(a) && a.length ? a[a.length - 1] : null; };
  const ago = (r: PromiseSettledResult<LS>) => { const a = val(r), l = last(r); return Array.isArray(a) && l ? a.find((x) => Number(x.timestamp) === Number(l.timestamp) - 24 * H) ?? null : null; };
  const lp = (x: { longShortRatio: string } | null) => longPctOf(num(x?.longShortRatio));
  const globalNow = lp(last(bnGlobal)), topPosNow = lp(last(bnTopPos));
  const globalAgo = lp(ago(bnGlobal)), topPosAgo = lp(ago(bnTopPos));
  const yls = val(byLs)?.result?.list?.[0];
  const ols = val(okLs)?.data?.[0];

  return NextResponse.json({
    symbol, base: s.base, asOf: new Date(now).toISOString(),
    venues,
    funding: fundingSummary(snaps),
    oi: {
      totalCoins: snaps.reduce((a, x) => a + (x.oiCoins ?? 0), 0) || null,
      totalUsd: venues.reduce((a, v) => a + (('oiUsd' in v && v.oiUsd) || 0), 0) || null,
      histVenues: hist.filter((h) => h.m.size > 0).map((h) => h.venue),
      series: pts.map((p) => ({ ts: p.ts, coins: p.sum, price: opens.get(p.ts)! })),
      h1: { ...c1, quadrant: oiPriceQuadrant(c1.pricePct, c1.oiPct, '1h') },
      h24: { ...c24, quadrant: oiPriceQuadrant(c24.pricePct, c24.oiPct, '24h') },
    },
    longShort: {
      binanceGlobal: globalNow, binanceTopPos: topPosNow, binanceTopAcc: lp(last(bnTopAcc)),
      gapNow: crowdGap(topPosNow, globalNow), gap24h: crowdGap(topPosAgo, globalAgo),
      bybit: yls ? num(yls.buyRatio) != null ? num(yls.buyRatio)! * 100 : null : null,
      okx: ols ? longPctOf(num(ols[1])) : null,
    },
  });
}

// 1시간 봉 기반 통계 + 실시간 펀딩 — 60초 신선 · 3분 stale(심볼별로만 공유, 개인정보 없음)
export const GET = withCdn(handler, 60, 180);
