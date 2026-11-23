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

/**
 * 손절 시 비용 모델(전부 비율, 0.0006 = 0.06%) — 진입·손절 체결 수수료, 시장가 슬리피지, 보유 중 낼 펀딩(명목가 대비).
 * 표준값은 Bitget VIP0 테이커 0.06%·메이커 0.02%·시장가 슬리피지 0.05%(= /risk-control 기본 설정).
 */
export interface StopCostModel { entryFee: number; exitFee: number; entrySlip?: number; exitSlip?: number; fund?: number }
export const STD_TAKER = 0.0006;
export const STD_MAKER = 0.0002;
export const STD_SLIPPAGE = 0.0005;
/** 시장가 진입 + 시장가 손절(가장 흔한 경우) 표준 비용 */
export const STD_MARKET_COSTS: StopCostModel = { entryFee: STD_TAKER, exitFee: STD_TAKER, entrySlip: STD_SLIPPAGE, exitSlip: STD_SLIPPAGE };

/**
 * 손절(스톱 마켓) 예상 체결가 — 불리한 쪽으로 미끄러진다. 롱(손절가 < 진입가)은 아래로, 숏은 위로.
 * 방향은 손절가가 진입가보다 아래면 롱으로 본다(같으면 롱 — 그 경우 호출부가 입력 오류로 걸러야 한다).
 */
export function stopFillPrice(entry: number, stop: number, slip = 0): number {
  return stop < entry || stop === entry ? stop * (1 - slip) : stop * (1 + slip);
}

/**
 * 코인 1개당 손절 시 순손실 = |진입가 − 예상 손절 체결가| + 진입 수수료 + 손절 수수료(체결가 기준) + 진입 슬리피지 + 낼 펀딩
 * — /risk-control·계산기·코인 분석 공통(단일 공식). 2026-11-23 KL-001: 손절 수수료를 손절가가 아니라 미끄러진 체결가에 매기게 맞춤
 * (예전엔 숏에서 손절가×슬리피지×수수료만큼 과소 추정). 손절 슬리피지는 체결가에 들어가 |진입−체결|로 반영된다.
 */
export function perUnitStopLoss(entry: number, stop: number, c: StopCostModel): number {
  const fill = stopFillPrice(entry, stop, c.exitSlip ?? 0);
  return Math.abs(entry - fill) + entry * c.entryFee + fill * c.exitFee
    + entry * (c.entrySlip ?? 0) + entry * Math.max(0, c.fund ?? 0);
}

/**
 * 손절에 걸렸을 때 '수수료·슬리피지·펀딩까지 포함한 순손실'이 riskUsdt 가 되는 포지션 명목가(USDT).
 * 예전 코인 분석은 가격거리만으로 노션을 잡아(notionForRisk) 화면의 '손절 시 손실 −10'이 실제로는 −11~−12였다.
 * 연속값(수량 단위 내림 전) — 실제 주문 수량은 sizeByRisk 로 거래소 단위에 내림해 다시 확인한다.
 */
export function notionalForNetRisk(riskUsdt: number, entry: number, stop: number, c: StopCostModel): number {
  if (!(riskUsdt > 0) || !(entry > 0) || !(stop > 0) || entry === stop) return 0;
  return (riskUsdt / perUnitStopLoss(entry, stop, c)) * entry;
}

/* ── 거래소 수량 단위 반영 사이징(KL-001) ─────────────────────────────
 * 선형 USDT 무기한 전용(수량 = 기초자산 개수). 역계약·현물은 공식이 달라 다루지 않는다 → contractType 이 다르면 계산하지 않는다.
 * 순서: 입력 검증 → 1개당 순손실 → 위험 예산 ÷ 1개당 손실 → 수량 단위로 '내림' → (가용 증거금 상한) → 최소 수량·최소 주문금액 확인
 * → 내림한 수량으로 손실을 다시 계산해 예산 이하인지 재확인. 주문은 내지 않는다(표시·기록용). */

/** 거래소 상품 규격(Bitget /api/v2/mix/market/contracts) — 없으면 null 로 넘겨 '수량 단위 미확인'으로 표시 */
export interface ContractSpec { qtyStep: number; minQty: number; minNotional?: number }

export type SizeStatus = 'OK' | 'REJECT_INPUT' | 'BLOCK_MIN_QTY' | 'BLOCK_MIN_NOTIONAL' | 'UNSUPPORTED';
export interface SizeInput {
  side: 'long' | 'short';
  entry: number; stop: number;
  /** 위험 예산(USDT, 손절 시 비용 포함 최대 손실) */
  riskBudget: number;
  costs: StopCostModel;
  /** 1개당 예상 펀딩(USDT, 내는 쪽이면 양수) — costs.fund(명목가 대비 비율)와 별개로 더해진다 */
  fundingPerUnit?: number;
  leverage: number;
  spec?: ContractSpec | null;
  /** 가용 증거금(USDT) — 주면 증거금이 이를 넘지 않게 수량을 줄인다 */
  availableMargin?: number | null;
  contractType?: 'linear_usdt_perpetual' | 'inverse' | 'spot';
}
export interface SizeResult {
  status: SizeStatus; reason: string | null;
  stopFill: number; perUnitLoss: number;
  /** 연속값(내림 전) */
  rawQty: number;
  /** 거래소 단위로 내림한 수량(규격 없으면 rawQty) */
  qty: number; notional: number; margin: number;
  /** 내림한 수량 기준 손절 시 예상 손실(비용 포함) */
  estLoss: number;
  stepApplied: boolean; marginCapped: boolean;
}

/** 소수 자릿수(1e-4 → 4, 0.001 → 3) */
function stepDecimals(step: number): number {
  const s = String(step);
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/**
 * x 를 step 의 배수로 '내림' — 부동소수 오차로 한 단계 덜 내리거나(0.0045 → 0.0044) 더 올리는 일이 없게
 * 정수 칸 수로 계산하고, 경계에서는 원래 조건(x 이하)을 다시 확인한다.
 */
export function floorToStep(x: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(x) || x <= 0) return Math.max(0, Number.isFinite(x) ? x : 0);
  const d = stepDecimals(step);
  let n = Math.floor(x / step);
  if ((n + 1) * step <= x * (1 + 1e-12)) n += 1;           // x/step 이 49.99999… 로 떨어진 경우
  while (n > 0 && n * step > x * (1 + 1e-12)) n -= 1;      // 50.0000…1 로 올라간 경우
  return Number((n * step).toFixed(d));
}

const EMPTY = (status: SizeStatus, reason: string, stopFill = 0, perUnitLoss = 0): SizeResult =>
  ({ status, reason, stopFill, perUnitLoss, rawQty: 0, qty: 0, notional: 0, margin: 0, estLoss: 0, stepApplied: false, marginCapped: false });

export function sizeByRisk(p: SizeInput): SizeResult {
  if (p.contractType && p.contractType !== 'linear_usdt_perpetual') return EMPTY('UNSUPPORTED', '선형 USDT 무기한만 계산합니다(역계약·현물 공식 다름).');
  if (!(p.entry > 0) || !(p.stop > 0) || !Number.isFinite(p.entry) || !Number.isFinite(p.stop)) return EMPTY('REJECT_INPUT', '진입가·손절가가 올바르지 않습니다.');
  if (p.stop === p.entry) return EMPTY('REJECT_INPUT', '손절가가 진입가와 같습니다.');
  if (p.side === 'long' ? p.stop > p.entry : p.stop < p.entry) return EMPTY('REJECT_INPUT', p.side === 'long' ? '롱인데 손절가가 진입가보다 높습니다.' : '숏인데 손절가가 진입가보다 낮습니다.');
  if (!(p.leverage > 0)) return EMPTY('REJECT_INPUT', '레버리지가 없습니다.');
  if (!(p.riskBudget > 0)) return EMPTY('REJECT_INPUT', '위험 예산이 0입니다.');
  const c = p.costs;
  // 받는 펀딩(음수)은 손실을 줄이는 쪽으로 상계하지 않는다(확정 수익 아님) — 아래에서 0으로 본다
  if ([c.entryFee, c.exitFee, c.entrySlip ?? 0, c.exitSlip ?? 0, c.fund ?? 0].some((v) => !(v >= 0)) || !Number.isFinite(p.fundingPerUnit ?? 0)) {
    return EMPTY('REJECT_INPUT', '비용 입력이 올바르지 않습니다.');
  }

  const stopFill = stopFillPrice(p.entry, p.stop, c.exitSlip ?? 0);
  const perUnitLoss = perUnitStopLoss(p.entry, p.stop, c) + Math.max(0, p.fundingPerUnit ?? 0);
  const rawQty = p.riskBudget / perUnitLoss;

  let qty = p.spec ? floorToStep(rawQty, p.spec.qtyStep) : rawQty;
  let marginCapped = false;
  if (p.availableMargin != null && p.availableMargin >= 0) {
    const maxByMargin = (p.availableMargin * p.leverage) / p.entry;
    if (qty > maxByMargin) { qty = p.spec ? floorToStep(maxByMargin, p.spec.qtyStep) : maxByMargin; marginCapped = true; }
  }
  // 내림 뒤 재검증 — 예산을 넘으면 한 단계씩 더 내린다(부동소수 경계 방어)
  if (p.spec) {
    const d = stepDecimals(p.spec.qtyStep);
    while (qty > 0 && qty * perUnitLoss > p.riskBudget * (1 + 1e-12)) qty = Number((qty - p.spec.qtyStep).toFixed(d));
  }
  const notional = qty * p.entry;
  const res: SizeResult = {
    status: 'OK', reason: null, stopFill, perUnitLoss, rawQty, qty, notional,
    margin: notional / p.leverage, estLoss: qty * perUnitLoss, stepApplied: !!p.spec, marginCapped,
  };
  if (p.spec) {
    if (qty < p.spec.minQty || qty <= 0) return { ...res, status: 'BLOCK_MIN_QTY', reason: `위험 예산으로는 최소 수량(${p.spec.minQty})을 살 수 없습니다 — 진입하지 않거나 손절을 좁히는 대신 기다리세요.` };
    if (p.spec.minNotional != null && notional < p.spec.minNotional) return { ...res, status: 'BLOCK_MIN_NOTIONAL', reason: `주문 금액 ${notional.toFixed(2)} USDT가 최소 주문 금액(${p.spec.minNotional} USDT)보다 작습니다.` };
  }
  return res;
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
