import { NextResponse } from 'next/server';
import { withCdn } from '@/lib/cdn';
import { getSupplyLayer } from '@/lib/coinSupply';
import { getDemandLayer } from '@/lib/coinPremium';
import { getOptionsLayer } from '@/lib/coinOptions';
import { getRegimeEdge } from '@/lib/regimeEdge';
import { synthesizeRegime, type PositioningInput } from '@/lib/coinRegime';
import { readMacroBias } from '@/lib/coinMacroContext';
import { coinMacroRates } from '@/lib/brief';

/**
 * ETH 체제 보드 집계(공개) — 4레이어(공급·수요·포지셔닝·거시) + 옵션 + 과거 base rate 를 한 번에.
 * synthesizeRegime 으로 종합(confluence·태그). 전부 무키 무료 소스. '예측 신호 아님'.
 */

interface PositioningOut extends PositioningInput {
  fundingRate: number | null;
  oiEth: number | null;
  priceUsd: number | null;
  fundingDeltaAnnual: number | null; // 연율 펀딩 Δ(방금 vs 직전 정산)
  lsDelta: number | null; // 롱숏비율 Δ(1h)
  oi24hChgPct: number | null; // OI 24h 변화율 %
}

const annual = (rate: number) => rate * 3 * 365 * 100; // 간격당 요율 → 연율 %(8h 3회·365)

/** 포지셔닝(레이어3) — Bitget 펀딩·OI + Binance 롱숏비율 + 방금 vs 어제 Δ. */
async function getPositioning(): Promise<PositioningOut | null> {
  try {
    const [bg, ls, fundHist, oiHist] = await Promise.all([
      fetch('https://api.bitget.com/api/v2/mix/market/ticker?symbol=ETHUSDT&productType=usdt-futures', {
        next: { revalidate: 60 }, signal: AbortSignal.timeout(7000),
      }).then((r) => r.json()).catch(() => null),
      fetch('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=ETHUSDT&period=1h&limit=2', {
        next: { revalidate: 300 }, signal: AbortSignal.timeout(7000),
      }).then((r) => r.json()).catch(() => null),
      fetch('https://api.bitget.com/api/v2/mix/market/history-fund-rate?symbol=ETHUSDT&productType=usdt-futures&pageSize=2', {
        next: { revalidate: 300 }, signal: AbortSignal.timeout(7000),
      }).then((r) => r.json()).catch(() => null),
      fetch('https://fapi.binance.com/futures/data/openInterestHist?symbol=ETHUSDT&period=1h&limit=25', {
        next: { revalidate: 300 }, signal: AbortSignal.timeout(7000),
      }).then((r) => r.json()).catch(() => null),
    ]);

    const d = (bg?.data?.[0] ?? null) as { fundingRate?: string; holdingAmount?: string; lastPr?: string } | null;
    const fundingRate = d?.fundingRate != null ? Number(d.fundingRate) : null;
    const fundingPctAnnual = fundingRate != null ? annual(fundingRate) : null;

    // 롱숏 Δ: [0]=과거, [1]=최신(바이낸스 오름차순)
    const lsNow = Array.isArray(ls) && ls.length ? Number(ls[ls.length - 1]?.longShortRatio) : NaN;
    const lsPrev = Array.isArray(ls) && ls.length >= 2 ? Number(ls[ls.length - 2]?.longShortRatio) : NaN;
    const longShortRatio = Number.isFinite(lsNow) ? lsNow : null;
    const lsDelta = Number.isFinite(lsNow) && Number.isFinite(lsPrev) ? lsNow - lsPrev : null;

    // 펀딩 Δ: Bitget 히스토리(최신순) [0]=최신, [1]=직전
    const fh = (fundHist?.data ?? []) as { fundingRate?: string }[];
    const fundPrev = fh.length >= 2 ? Number(fh[1]?.fundingRate) : NaN;
    const fundingDeltaAnnual =
      fundingRate != null && Number.isFinite(fundPrev) ? annual(fundingRate) - annual(fundPrev) : null;

    // OI 24h 변화%: openInterestHist(오름차순, sumOpenInterest)
    const oh = (Array.isArray(oiHist) ? oiHist : []) as { sumOpenInterest?: string }[];
    const oiNow = oh.length ? Number(oh[oh.length - 1]?.sumOpenInterest) : NaN;
    const oi24hAgo = oh.length >= 25 ? Number(oh[0]?.sumOpenInterest) : NaN;
    const oi24hChgPct =
      Number.isFinite(oiNow) && Number.isFinite(oi24hAgo) && oi24hAgo ? (oiNow / oi24hAgo - 1) * 100 : null;

    return {
      fundingRate,
      fundingPctAnnual,
      longShortRatio,
      oiEth: d?.holdingAmount != null ? Number(d.holdingAmount) : null,
      priceUsd: d?.lastPr != null ? Number(d.lastPr) : null,
      fundingDeltaAnnual,
      lsDelta,
      oi24hChgPct,
    };
  } catch {
    return null;
  }
}

async function macroContext() {
  try {
    const m = await coinMacroRates();
    const realYieldChangePp =
      m?.realYield && m.realYield.prev != null
        ? Math.round((m.realYield.value - m.realYield.prev) * 100) / 100
        : null;
    return readMacroBias({
      us10ChangePp: m?.us10?.change ?? null,
      dxyChangePct: m?.dxy?.change ?? null,
      realYieldChangePp,
    });
  } catch {
    return null;
  }
}

async function handler() {
  const [supply, demand, options, edge, positioning, macro] = await Promise.all([
    getSupplyLayer(),
    getDemandLayer(),
    getOptionsLayer(),
    getRegimeEdge(2),
    getPositioning(),
    macroContext(),
  ]);

  const regime = synthesizeRegime({
    supply,
    demand,
    macro,
    positioning: positioning
      ? { fundingPctAnnual: positioning.fundingPctAnnual, longShortRatio: positioning.longShortRatio }
      : null,
  });

  return NextResponse.json({ regime, supply, demand, options, positioning, macro, edge, asof: Date.now() });
}

export const GET = withCdn(handler, 60, 300);
export const maxDuration = 30;
