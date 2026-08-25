/**
 * 통합 리스크 집계 — "지금 내 계좌 전체가 얼마나 위험한가"를 한 숫자로 답한다.
 *
 * 왜 필요한가: 이 앱의 리스크 도구는 전부 **종목 단위**였다(이 매매의 손절·사이징·청산가).
 * 그런데 실제로 계좌를 터뜨리는 건 종목 하나가 아니라 **동시에 다 틀리는 것**이다.
 * 코인 4종목을 나눠 담아도 BTC 가 빠지면 같이 빠지므로, 종목별로는 1%씩 걸었어도
 * 계좌 관점에서는 한 방향에 4%를 건 것이다. 그 사실을 숫자로 보여준다.
 *
 * 순수 함수 — tests/engine.test.ts 로 고정한다(돈이 걸린 계산).
 * 통화는 전부 원화로 환산해 합산하고, 사용한 환율을 함께 반환해 검증 가능하게 한다.
 */

export interface FuturesPositionLike {
  symbol: string;
  side: 'long' | 'short';
  /** 계약 수량 */
  size: number;
  markPrice: number;
  leverage: number;
  marginSize: number;
  unrealizedPL: number;
  liquidationPrice: number;
  liqDistPct: number | null;
}

/** 계획 손절이 살아 있는 열린 매매 기록 */
export interface OpenPlanLike {
  symbol: string;
  direction: 'long' | 'short' | 'wait';
  entry: number;
  stop: number;
  notionUsdt?: number | null;
  seedUsdt?: number | null;
  riskPct?: number | null;
  result: 'open' | 'win' | 'loss' | 'even';
}

export interface EquityHoldingLike {
  ticker: string;
  name?: string;
  quantity: number;
  avgPrice: number;
  /** 현재가 (없으면 평단으로 대체 — 그 경우 priced=false 로 표시) */
  price?: number | null;
  currency: 'KRW' | 'USD';
}

export interface RiskInput {
  futures: FuturesPositionLike[];
  openPlans: OpenPlanLike[];
  holdings: EquityHoldingLike[];
  /** 선물 계좌 자기자본(USDT) */
  futuresEquity: number | null;
  usdkrw: number;
}

export interface RiskWarning {
  level: 'high' | 'mid' | 'low';
  title: string;
  detail: string;
}

export interface RiskSummary {
  usdkrw: number;
  /** 명목 익스포저(원) — 레버리지 반영된 실제 시장 노출 */
  grossExposureKrw: number;
  futuresNotionalKrw: number;
  equityValueKrw: number;
  /** 방향 편중: 롱 − 숏 (원) */
  netDirectionKrw: number;
  longKrw: number;
  shortKrw: number;
  /** 계획 손절이 전부 체결되면 잃는 금액(원). 손절 없는 포지션은 제외하고 별도로 센다 */
  plannedStopLossKrw: number;
  plansWithoutStop: number;
  /** 미실현 손익(원) */
  unrealizedKrw: number;
  /** 청산까지 가장 가까운 포지션 */
  nearestLiq: { symbol: string; distPct: number } | null;
  /** 단일 종목 최대 비중(%) */
  topConcentration: { label: string; pct: number } | null;
  /** 자기자본 대비 총 익스포저 배수 — 실효 레버리지 */
  effectiveLeverage: number | null;
  warnings: RiskWarning[];
  /** 가격을 못 구해 평단으로 대체한 보유 종목 수 — 수치 신뢰도 고지용 */
  unpricedHoldings: number;
}

const krw = (v: number, cur: 'KRW' | 'USD', fx: number) => (cur === 'USD' ? v * fx : v);

/** 코인은 서로 거의 같이 움직인다 — 분산으로 세면 안 되는 자산군 */
const CRYPTO_CORRELATED = /^(BTC|ETH|XRP|SOL|BNB|DOGE|ADA)/i;

export function aggregateRisk(input: RiskInput): RiskSummary {
  const fx = input.usdkrw > 0 ? input.usdkrw : 1400;
  const warnings: RiskWarning[] = [];

  /* ── 선물 ── */
  let futNotionalUsdt = 0, longUsdt = 0, shortUsdt = 0, unrealUsdt = 0;
  let nearestLiq: RiskSummary['nearestLiq'] = null;
  for (const p of input.futures) {
    const notional = Math.abs(p.size * p.markPrice);
    futNotionalUsdt += notional;
    if (p.side === 'long') longUsdt += notional; else shortUsdt += notional;
    unrealUsdt += p.unrealizedPL;
    if (p.liqDistPct != null && p.liqDistPct > 0) {
      if (!nearestLiq || p.liqDistPct < nearestLiq.distPct) nearestLiq = { symbol: p.symbol, distPct: p.liqDistPct };
    }
  }

  /* ── 주식·현물 보유 ── */
  let equityKrw = 0, unpriced = 0;
  const holdingValue: { label: string; krw: number }[] = [];
  for (const h of input.holdings) {
    const px = h.price != null && h.price > 0 ? h.price : h.avgPrice;
    if (!(h.price != null && h.price > 0)) unpriced++;
    const v = krw(px * h.quantity, h.currency, fx);
    if (!(v > 0)) continue;
    equityKrw += v;
    holdingValue.push({ label: h.name || h.ticker, krw: v });
  }
  // 주식 보유는 롱 방향 노출이다
  const longTotalKrw = longUsdt * fx + equityKrw;
  const shortTotalKrw = shortUsdt * fx;

  const futNotionalKrw = futNotionalUsdt * fx;
  const grossExposureKrw = futNotionalKrw + equityKrw;

  /* ── 동시 손절 시 손실 ── */
  let plannedStopLossUsdt = 0, plansWithoutStop = 0;
  for (const pl of input.openPlans) {
    if (pl.result !== 'open' || pl.direction === 'wait') continue;
    if (!(pl.stop > 0) || !(pl.entry > 0)) { plansWithoutStop++; continue; }
    // 1순위: 사용자가 설정한 1회 허용손실, 2순위: 노션 × 손절거리
    const byRisk = pl.seedUsdt != null && pl.riskPct != null && pl.seedUsdt > 0 && pl.riskPct > 0
      ? (pl.seedUsdt * pl.riskPct) / 100 : null;
    const dist = Math.abs(pl.entry - pl.stop) / pl.entry;
    const byNotional = pl.notionUsdt != null && pl.notionUsdt > 0 ? pl.notionUsdt * dist : null;
    const loss = byRisk ?? byNotional;
    if (loss == null) { plansWithoutStop++; continue; }
    plannedStopLossUsdt += loss;
  }

  /* ── 집중도 ── */
  const buckets = new Map<string, number>();
  for (const h of holdingValue) buckets.set(h.label, (buckets.get(h.label) ?? 0) + h.krw);
  for (const p of input.futures) {
    const label = p.symbol.replace(/USDT.*$/i, '');
    buckets.set(label, (buckets.get(label) ?? 0) + Math.abs(p.size * p.markPrice) * fx);
  }
  let topConcentration: RiskSummary['topConcentration'] = null;
  if (grossExposureKrw > 0) {
    for (const [label, v] of buckets) {
      const pct = (v / grossExposureKrw) * 100;
      if (!topConcentration || pct > topConcentration.pct) topConcentration = { label, pct };
    }
  }

  const equityKrwBase = input.futuresEquity != null ? input.futuresEquity * fx : null;
  const effectiveLeverage = equityKrwBase && equityKrwBase > 0 ? grossExposureKrw / equityKrwBase : null;

  /* ── 경고 (숫자에서 자동으로 유도 — 임의 문구 아님) ── */
  if (nearestLiq && nearestLiq.distPct < 15) {
    warnings.push({
      level: nearestLiq.distPct < 8 ? 'high' : 'mid',
      title: `청산까지 ${nearestLiq.distPct.toFixed(1)}% — ${nearestLiq.symbol}`,
      detail: '손절선보다 청산선이 가까우면 손절이 작동하기 전에 강제 청산됩니다. 레버리지를 낮추거나 증거금을 더 넣으세요.',
    });
  }
  if (effectiveLeverage != null && effectiveLeverage > 3) {
    warnings.push({
      level: effectiveLeverage > 6 ? 'high' : 'mid',
      title: `실효 레버리지 ${effectiveLeverage.toFixed(1)}배`,
      detail: '자기자본 대비 시장 노출 배수입니다. 시장이 반대로 가면 손실도 그 배수만큼 커집니다.',
    });
  }
  const cryptoKrw = input.futures
    .filter((p) => CRYPTO_CORRELATED.test(p.symbol))
    .reduce((a, p) => a + Math.abs(p.size * p.markPrice) * fx, 0);
  if (cryptoKrw > 0 && grossExposureKrw > 0 && cryptoKrw / grossExposureKrw > 0.5 && input.futures.length > 1) {
    warnings.push({
      level: 'mid',
      title: `코인 익스포저가 전체의 ${((cryptoKrw / grossExposureKrw) * 100).toFixed(0)}%`,
      detail: '주요 코인은 서로 거의 같이 움직입니다(상관 0.8~0.95). 종목을 나눠 담아도 분산 효과는 거의 없고, 사실상 한 방향에 몰아 건 것과 같습니다.',
    });
  }
  if (topConcentration && topConcentration.pct > 40) {
    warnings.push({
      level: topConcentration.pct > 60 ? 'high' : 'mid',
      title: `${topConcentration.label} 한 종목이 ${topConcentration.pct.toFixed(0)}%`,
      detail: '한 종목의 악재가 계좌 전체를 좌우합니다.',
    });
  }
  const netAbs = Math.abs(longTotalKrw - shortTotalKrw);
  if (grossExposureKrw > 0 && netAbs / grossExposureKrw > 0.8 && input.futures.length + input.holdings.length > 1) {
    warnings.push({
      level: 'low',
      title: `방향 편중 ${longTotalKrw >= shortTotalKrw ? '롱' : '숏'} ${((netAbs / grossExposureKrw) * 100).toFixed(0)}%`,
      detail: '전체가 한 방향입니다. 시장이 반대로 가면 모든 포지션이 동시에 손실입니다.',
    });
  }
  if (plansWithoutStop > 0) {
    warnings.push({
      level: 'mid',
      title: `손절 계획이 없는 열린 기록 ${plansWithoutStop}건`,
      detail: '손절가나 사이징이 비어 있어 최대 손실을 계산할 수 없습니다. 계산되지 않은 위험은 아래 합계에 빠져 있습니다.',
    });
  }

  return {
    usdkrw: fx,
    grossExposureKrw,
    futuresNotionalKrw: futNotionalKrw,
    equityValueKrw: equityKrw,
    netDirectionKrw: longTotalKrw - shortTotalKrw,
    longKrw: longTotalKrw,
    shortKrw: shortTotalKrw,
    plannedStopLossKrw: plannedStopLossUsdt * fx,
    plansWithoutStop,
    unrealizedKrw: unrealUsdt * fx,
    nearestLiq,
    topConcentration,
    effectiveLeverage,
    warnings: warnings.sort((a, b) => ({ high: 0, mid: 1, low: 2 })[a.level] - ({ high: 0, mid: 1, low: 2 })[b.level]),
    unpricedHoldings: unpriced,
  };
}
