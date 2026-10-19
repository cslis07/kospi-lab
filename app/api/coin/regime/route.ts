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

/** 포지셔닝(레이어3) — Bitget 펀딩·OI + Binance 롱숏비율. 펀딩은 연율 %로 환산(8h 간격 가정). */
async function getPositioning(): Promise<
  (PositioningInput & { fundingRate: number | null; oiEth: number | null; priceUsd: number | null }) | null
> {
  try {
    const [bg, ls] = await Promise.all([
      fetch('https://api.bitget.com/api/v2/mix/market/ticker?symbol=ETHUSDT&productType=usdt-futures', {
        next: { revalidate: 60 }, signal: AbortSignal.timeout(7000),
      })
        .then((r) => r.json())
        .catch(() => null),
      fetch('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=ETHUSDT&period=1h&limit=1', {
        next: { revalidate: 300 }, signal: AbortSignal.timeout(7000),
      })
        .then((r) => r.json())
        .catch(() => null),
    ]);
    const d = (bg?.data?.[0] ?? null) as { fundingRate?: string; holdingAmount?: string; lastPr?: string } | null;
    const fundingRate = d?.fundingRate != null ? Number(d.fundingRate) : null;
    const longShortRatio = Array.isArray(ls) && ls[0]?.longShortRatio != null ? Number(ls[0].longShortRatio) : null;
    // 연율 % = 간격당 요율 × 하루 3회(8h) × 365 × 100
    const fundingPctAnnual = fundingRate != null ? fundingRate * 3 * 365 * 100 : null;
    return {
      fundingRate,
      fundingPctAnnual,
      longShortRatio,
      oiEth: d?.holdingAmount != null ? Number(d.holdingAmount) : null,
      priceUsd: d?.lastPr != null ? Number(d.lastPr) : null,
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
