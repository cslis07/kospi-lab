/**
 * 포지션 사이징·청산가·분할 매수 — 돈에 직접 닿는 순수 계산.
 * UI(RiskPanel)와 테스트(tests/engine.test.ts)가 같은 코드를 쓴다.
 */

/**
 * 노션 = (시드 × 허용손실% − 예상비용) ÷ 손절거리% — 리스크는 손절거리가 결정.
 * costUsdt를 주면 수수료·미끄러짐을 손실 예산에서 먼저 빼므로 더 보수적인(작은) 포지션이 나온다.
 * (개인 매매 진단: 수량=(최대허용손실−예상비용)÷|진입가−손절가|)
 */
export function notionForRisk(seedUsdt: number, riskPct: number, stopPct: number, costUsdt = 0): number {
  if (stopPct <= 0) return 0;
  const budget = seedUsdt * riskPct / 100 - costUsdt;
  return budget > 0 ? budget / (stopPct / 100) : 0;
}

/** 왕복 수수료가 1R(손절 시 손실)의 이 비율 이상이면 경고 — 가드 💸 알림과 같은 기준 */
export const FEE_RISK_WARN = 0.25;
export interface FeeVsRisk { ratio: number; breakEvenWinPct: number; minStopPct: number }
/**
 * 진입 전 비용 미리보기 — 수량과 무관하게 '왕복 수수료율 ÷ 손절 거리'로 정해진다.
 * ratio = 왕복 수수료 ÷ 1R, breakEvenWinPct = 1:1 매매 본전 승률((1+ratio)/2), minStopPct = ratio 를 경고선 아래로 두는 최소 손절 거리 %.
 */
export function feeVsRisk(stopPct: number, roundTripRate: number, warn = FEE_RISK_WARN): FeeVsRisk | null {
  if (!(stopPct > 0) || !(roundTripRate >= 0)) return null;
  const ratio = roundTripRate / (stopPct / 100);
  return { ratio, breakEvenWinPct: ((1 + ratio) / 2) * 100, minStopPct: (roundTripRate / warn) * 100 };
}

/**
 * 격리 청산가 — Bitget 고립마진 공식: 진입가 × (1 ∓ 1/lev) ÷ (1 ∓ (MMR + 테이커수수료)).
 * 청산 시 수수료는 청산 명목가에 비례 부과되므로 유지증거금률(MMR)에 선형으로 합쳐진다.
 * MMR은 거래소·심볼·포지션 티어별로 달라 근사치. taker 0이면 수수료 제외(안전 비율용).
 */
export function isolatedLiqPrice(entry: number, lev: number, isShort: boolean, mmr = 0.005, taker = 0): number {
  const r = mmr + taker;
  return isShort ? entry * (1 + 1 / lev) / (1 + r) : entry * (1 - 1 / lev) / (1 - r);
}

/** 청산여유 ÷ 손절거리 — 2 미만이면 손절 전에 청산될 수 있음 */
export function liqSafety(entry: number, stopPct: number, lev: number, isShort: boolean, mmr = 0.005, taker = 0): number {
  if (entry <= 0 || stopPct <= 0) return 0;
  const liq = isolatedLiqPrice(entry, lev, isShort, mmr, taker);
  const liqDistPct = (Math.abs(liq - entry) / entry) * 100;
  return liqDistPct / stopPct;
}

export interface TrancheRow { price: number; notion: number; margin: number; weight: number }
export interface TranchePlan { rows: TrancheRow[]; avg: number }

/**
 * 분할 매수 3분할 (가중 40/35/25 — 진입가 근처에 더 무겁게)
 * - pullback 존이 있으면 존 안에서 계단 (롱: 위→아래, 숏: 아래→위)
 * - 아니면 진입가→손절 방향으로 1/4·1/2 지점 계단 (마지막도 손절 안쪽)
 *
 * 불변식: 모든 차수의 지정가는 손절선 **안쪽**이어야 한다. 손절 밖 지정가는
 * 스톱 발동 후에만 체결되므로 의도치 않은 재진입이 된다. 호출부(coinAnalysis)가
 * 이미 존을 클램프하지만, 이 함수 단독으로도 불변식을 보장한다.
 */
export function tranches3(
  notion: number, lev: number, entry: number, stop: number, isLong: boolean,
  zone: { type: 'now' | 'pullback' | 'wait'; zoneLow: number; zoneHigh: number },
): TranchePlan {
  const weights = [0.4, 0.35, 0.25];
  let prices: number[];
  const zoneSpan = Math.abs(zone.zoneHigh - zone.zoneLow) / (entry || 1);
  if (zone.type === 'pullback' && zoneSpan > 0.0005) {
    const hi = zone.zoneHigh, lo = zone.zoneLow;
    prices = isLong ? [hi, (hi + lo) / 2, lo] : [lo, (hi + lo) / 2, hi];
  } else {
    const dist = Math.abs(entry - stop);
    prices = isLong
      ? [entry, entry - dist * 0.25, entry - dist * 0.5]
      : [entry, entry + dist * 0.25, entry + dist * 0.5];
  }
  // 손절 안쪽으로 강제 (손절폭의 10%를 최소 완충으로 남김)
  const guard = Math.abs(entry - stop) * 0.1;
  prices = prices.map((p) => (isLong ? Math.max(p, stop + guard) : Math.min(p, stop - guard)));
  const rows = prices.map((p, i) => ({
    price: p, notion: notion * weights[i], margin: lev > 0 ? (notion * weights[i]) / lev : 0, weight: weights[i],
  }));
  const filled = rows.reduce((a, x) => a + x.notion, 0);
  const avg = filled > 0 ? rows.reduce((a, x) => a + x.price * x.notion, 0) / filled : entry;
  return { rows, avg };
}
