/**
 * 매매당 손실 크기 vs 계좌 자본 — "한 번에 자본의 몇 %를 잃었나". 순수 함수(테스트: tests/riskSize.test.ts).
 *
 *  - 기준 자본은 '지금' 선물 계좌 자본(Bitget usdtEquity/accountEquity)이다. 과거 매매를 오늘 자본으로 나누는
 *    근사라, 그 사이 손익·입출금만큼 실제 당시 비율과 다르다.
 *  - 보조로 '당시 자본 추정' = 지금 자본 − (그 매매 청산 시각 이후 청산된 매매의 순손익 합, 그 매매 포함)도 준다.
 *    실현손익만 되돌린 값이고 입출금·현물↔선물 이체·미실현손익은 반영하지 않는다(역시 근사).
 *  - 큰 손실(기본 2% 초과)이 '크게 걸어서'(진입 금액 상위 25%)인지 '크게 역행해서'(진입가→청산가 불리 이동 %
 *    상위 25%, 손실 매매 중)인지 건수로 나눠 본다. 방향 예측 없음 — 기록 복기.
 */

export const RISK_LIMIT_PCT = 2;

export interface RiskTrade {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  openAvg: number;
  closeAvg: number;
  size: number;
  netProfit: number;
  openTs: number;
  closeTs: number;
}

export interface RiskRow {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  closeTs: number;
  /** 손실(양수 USDT) */
  loss: number;
  /** 지금 자본 대비 % */
  lossPct: number;
  /** 당시 자본 추정 대비 %(추정 자본이 0 이하면 null) */
  lossPctThen: number | null;
  equityThen: number | null;
  notional: number;
  /** 진입가→청산가 불리한 이동 %(0 이상) */
  movePct: number;
  /** 전체 매매 중 진입 금액 분위(0=하위25% … 3=상위25%), 4건 미만이면 null */
  sizeQuartile: number | null;
  /** 손실 매매 중 역행 % 상위 25% 여부 */
  bigMove: boolean;
  over: boolean;
}

export type RiskDriver = 'size' | 'move' | 'both' | 'neither';

export interface RiskSummary {
  equity: number;
  limitPct: number;
  losers: number;
  totalLoss: number;
  rows: RiskRow[];
  overCount: number;
  /** 당시 자본 추정 기준 초과 건수 */
  overCountThen: number;
  largest: RiskRow | null;
  /** 전체 손실 중 한도 초과 매매에서 나온 몫(%) */
  overLossSharePct: number | null;
  /** 한도 초과 매매 중 진입 금액 상위 25% / 역행 상위 25% 건수 */
  overBigSize: number;
  overBigMove: number;
  driver: RiskDriver | null;
}

/** 오름차순 배열의 q 분위 값(가장 가까운 순위) */
function quantile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

export function riskSize(trades: RiskTrade[], equity: number, limitPct = RISK_LIMIT_PCT): RiskSummary | null {
  if (!(equity > 0)) return null;
  const notional = (t: RiskTrade) => Math.abs(t.size) * t.openAvg;
  const all = trades.filter((t) => t.openAvg > 0);
  const ns = all.map(notional).filter((n) => n > 0).sort((a, b) => a - b);
  const qEdges = ns.length >= 4 ? [quantile(ns, 0.25), quantile(ns, 0.5), quantile(ns, 0.75)] : null;
  const sizeQ = (n: number) => (qEdges ? (n < qEdges[0] ? 0 : n < qEdges[1] ? 1 : n < qEdges[2] ? 2 : 3) : null);

  // 당시 자본 추정 — 청산 시각 내림차순 누적 순손익
  const byClose = [...all].sort((a, b) => b.closeTs - a.closeTs);
  const laterSum = new Map<string, number>();
  let acc = 0;
  for (const t of byClose) { acc += t.netProfit; laterSum.set(t.id, acc); }

  const losers = all.filter((t) => t.netProfit < 0);
  const move = (t: RiskTrade) => {
    const m = t.side === 'long' ? (t.openAvg - t.closeAvg) / t.openAvg : (t.closeAvg - t.openAvg) / t.openAvg;
    return Math.max(0, m * 100);
  };
  const moves = losers.map(move).sort((a, b) => a - b);
  const moveEdge = moves.length >= 4 ? quantile(moves, 0.75) : null;

  const rows: RiskRow[] = losers.map((t) => {
    const loss = -t.netProfit;
    const eqThen = equity - (laterSum.get(t.id) ?? 0);
    const mp = move(t);
    const n = notional(t);
    const lossPct = (loss / equity) * 100;
    return {
      id: t.id, symbol: t.symbol, side: t.side, closeTs: t.closeTs, loss,
      lossPct,
      lossPctThen: eqThen > 0 ? (loss / eqThen) * 100 : null,
      equityThen: eqThen > 0 ? eqThen : null,
      notional: n, movePct: mp,
      sizeQuartile: sizeQ(n),
      bigMove: moveEdge != null && mp >= moveEdge,
      over: lossPct > limitPct,
    };
  }).sort((a, b) => b.loss - a.loss);

  const totalLoss = rows.reduce((a, r) => a + r.loss, 0);
  const over = rows.filter((r) => r.over);
  const overLoss = over.reduce((a, r) => a + r.loss, 0);
  const overBigSize = over.filter((r) => r.sizeQuartile === 3).length;
  const overBigMove = over.filter((r) => r.bigMove).length;
  let driver: RiskDriver | null = null;
  if (over.length) {
    if (overBigSize > overBigMove) driver = 'size';
    else if (overBigMove > overBigSize) driver = 'move';
    else driver = overBigSize > 0 ? 'both' : 'neither';
  }

  return {
    equity, limitPct, losers: rows.length, totalLoss, rows,
    overCount: over.length,
    overCountThen: rows.filter((r) => r.lossPctThen != null && r.lossPctThen > limitPct).length,
    largest: rows[0] ?? null,
    overLossSharePct: totalLoss > 0 ? (overLoss / totalLoss) * 100 : null,
    overBigSize, overBigMove, driver,
  };
}

export const DRIVER_TEXT: Record<RiskDriver, string> = {
  size: '큰 손실은 주로 크게 건 매매(진입 금액 상위 25%)에서 나왔습니다 — 수량을 손절 폭에 맞춰 줄이는 쪽이 먼저입니다.',
  move: '큰 손실은 주로 크게 역행한 매매(불리한 가격 이동 상위 25%)에서 나왔습니다 — 손절 주문으로 역행 폭을 끊는 쪽이 먼저입니다.',
  both: '큰 손실은 크게 건 것과 크게 역행한 것이 겹친 매매에서 나왔습니다 — 수량과 손절 둘 다 점검이 필요합니다.',
  neither: '큰 손실이 규모·역행 상위 25%에 몰리지 않았습니다 — 계좌 대비 기본 수량 자체가 큰 편일 수 있습니다.',
};
