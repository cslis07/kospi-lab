/**
 * 매매 비용 분석 — 수수료·펀딩이 손익에서 차지하는 비중(참고: TraderSync 'Commissions & Fees').
 * 순수함수(테스트 대상). 입력은 거래소 청산 포지션(app/api/bitget/history ClosedPosition)의 부분집합.
 *
 * 부호 규칙(Bitget 그대로): 순손익 = 매매손익(gross) + 수수료(fee, 보통 음수) + 펀딩(funding, 받으면 +·내면 −).
 * 월별 보고서(lib/tradeReport)는 월 합계만 보여 주므로, 여기선 '비율'로 본다 — 번 돈 중 비용 몫, 비용 때문에 뒤집힌 매매, 실효 수수료율.
 */

import { HOLD_BANDS, holdBandIndex } from './tradeBreakdown';

export interface CostPosition {
  grossPnl: number;
  fee: number;
  funding: number;
  netProfit: number;
  size: number;      // 계약 수량(코인 단위)
  openAvg: number;
  closeAvg: number;
  openTs?: number;   // 보유시간별 비용용(없으면 그 분석에서 빠짐)
  closeTs?: number;
}

export interface CostBreakdown {
  n: number;
  gross: number;          // 매매손익 합(수수료·펀딩 전)
  fees: number;           // 수수료 합(보통 음수)
  funding: number;        // 펀딩 합(+ 받음 / − 냄)
  net: number;            // 순손익 합
  /** 총비용 = −(수수료 + 펀딩). 양수 = 비용으로 나간 돈 */
  cost: number;
  /** 이익 난 매매들의 매매손익 합 */
  grossWin: number;
  /** 번 돈(grossWin) 중 비용 비율 % */
  costOfGrossWinPct: number | null;
  /** 매매로는 이겼는데(gross>0) 비용 때문에 순손익이 0 이하가 된 건수 */
  flipped: number;
  /** 건당 평균 수수료(양수) */
  avgFee: number | null;
  /** 진입+청산 체결 대금 합 */
  turnover: number;
  /** 실효 수수료율 % = 수수료 ÷ 체결 대금(체결 1회당) */
  feeRatePct: number | null;
}

export function costBreakdown(ps: CostPosition[]): CostBreakdown {
  const ok = ps.filter((p) => [p.grossPnl, p.fee, p.funding, p.netProfit].every(Number.isFinite));
  const sum = (f: (p: CostPosition) => number) => ok.reduce((a, p) => a + f(p), 0);
  const gross = sum((p) => p.grossPnl);
  const fees = sum((p) => p.fee);
  const funding = sum((p) => p.funding);
  const net = sum((p) => p.netProfit);
  const cost = -(fees + funding);
  const grossWin = sum((p) => Math.max(0, p.grossPnl));
  const turnover = sum((p) => (Number.isFinite(p.size) && p.size > 0 ? Math.abs(p.size) * (Math.abs(p.openAvg) + Math.abs(p.closeAvg)) : 0));
  return {
    n: ok.length, gross, fees, funding, net, cost, grossWin,
    costOfGrossWinPct: grossWin > 0 ? (cost / grossWin) * 100 : null,
    flipped: ok.filter((p) => p.grossPnl > 0 && p.netProfit <= 0).length,
    avgFee: ok.length ? -fees / ok.length : null,
    turnover,
    feeRatePct: turnover > 0 ? (-fees / turnover) * 100 : null,
  };
}

export interface HoldCostRow {
  key: string;
  label: string;
  order: number;
  n: number;
  gross: number;        // 매매손익(비용 전)
  cost: number;         // 수수료+펀딩 비용(양수 = 나감)
  net: number;
  avgCost: number;      // 건당 비용
  /** 매매손익이 플러스일 때 그중 비용 비율 %. 매매손익이 0 이하면 null(비율 의미 없음) */
  costOfGrossPct: number | null;
  /** 매매로는 벌었는데(gross>0) 구간 순손익이 0 이하 = 비용이 이익을 다 먹음 */
  eaten: boolean;
}

/**
 * 보유시간 구간별 비용 — 짧게 자주 할수록 같은 요율이라도 이익에서 비용 몫이 커지는지 본다(참고: TraderSync).
 * 구간은 손익 분해 표와 같은 HOLD_BANDS. 진입·청산 시각이 없거나 보유 0 이하인 매매는 뺀다.
 */
export function costByHoldBand(ps: CostPosition[]): HoldCostRow[] {
  const map = new Map<number, CostPosition[]>();
  for (const p of ps) {
    if (p.openTs == null || p.closeTs == null || p.closeTs <= p.openTs) continue;
    if (![p.grossPnl, p.fee, p.funding, p.netProfit].every(Number.isFinite)) continue;
    const i = holdBandIndex(p.closeTs - p.openTs);
    const arr = map.get(i);
    if (arr) arr.push(p); else map.set(i, [p]);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([i, list]) => {
    const gross = list.reduce((a, p) => a + p.grossPnl, 0);
    const cost = -list.reduce((a, p) => a + p.fee + p.funding, 0);
    const net = list.reduce((a, p) => a + p.netProfit, 0);
    return {
      key: `hb${i}`, label: HOLD_BANDS[i].label, order: i, n: list.length,
      gross, cost, net, avgCost: cost / list.length,
      costOfGrossPct: gross > 0 ? (cost / gross) * 100 : null,
      eaten: gross > 0 && net <= 0,
    };
  });
}
