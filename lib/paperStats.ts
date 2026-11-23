/**
 * 선행 테스트 보조 통계(KL-015) — 표시 전용. 판정 규칙(lib/paperJudge: 승률 이항·평균 R 단측, n≥30)은 바꾸지 않는다.
 *  - 평균 R 의 95% 신뢰구간(정규 근사) — 30건은 '중간 점검'이지 유의성 확정이 아님을 수치로 보여 준다.
 *  - 비용 차감 추정 R — 채점 R 은 수수료·슬리피지 미반영이라, 앱 표준 비용(테이커 0.06%·메이커 0.02%·시장가 슬리피지 0.05%)을
 *    거래마다 R 단위로 빼 본다. 진입: 시장가 = 테이커+슬리피지, 지정가 = 메이커 · 청산: 목표(지정가) = 메이커, 손절(시장가) = 테이커+슬리피지.
 */
import { STD_MAKER, STD_SLIPPAGE, STD_TAKER } from './positionSizing';

export interface CostTradeLike { type: 'market' | 'limit'; entry: number; stop: number }
export interface JudgedLike { trade: CostTradeLike; status: string; r: number | null; exitPrice?: number }

/** 한 거래의 추정 비용(R 단위, ≥0). 위험(|진입−손절|)이 0이면 0 */
export function costR(t: CostTradeLike, status: 'win' | 'loss', exitPrice: number): number {
  const risk = Math.abs(t.entry - t.stop);
  if (!(risk > 0) || !(t.entry > 0) || !(exitPrice > 0)) return 0;
  const inCost = t.entry * (t.type === 'market' ? STD_TAKER + STD_SLIPPAGE : STD_MAKER);
  const outCost = exitPrice * (status === 'win' ? STD_MAKER : STD_TAKER + STD_SLIPPAGE);
  return (inCost + outCost) / risk;
}

/** 확정(win·loss) 거래의 비용 차감 추정 R 목록 */
export function netRs(js: JudgedLike[]): number[] {
  return js.filter((j) => (j.status === 'win' || j.status === 'loss') && j.r != null)
    .map((j) => (j.r as number) - costR(j.trade, j.status as 'win' | 'loss', j.exitPrice ?? (j.status === 'loss' ? j.trade.stop : j.trade.entry)));
}

export interface MeanCI { n: number; mean: number; lo: number | null; hi: number | null }
/** 평균과 95% 신뢰구간(정규 근사, 표본 표준편차). n<2 면 구간 없음 */
export function meanCI(rs: number[], z = 1.96): MeanCI {
  const n = rs.length;
  if (!n) return { n, mean: 0, lo: null, hi: null };
  const mean = rs.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { n, mean, lo: null, hi: null };
  const sd = Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const half = z * sd / Math.sqrt(n);
  return { n, mean, lo: mean - half, hi: mean + half };
}

const f = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}`;
/** '평균 +0.21R (95% 구간 −0.35 ~ +0.77) — 0을 포함: 우위 불명' 같은 한 줄 */
export function ciText(c: MeanCI): string {
  if (!c.n) return '확정 거래 없음';
  if (c.lo == null || c.hi == null) return `평균 ${f(c.mean)}R (표본 ${c.n}건 — 구간 계산 불가)`;
  const verdict = c.lo > 0 ? '0보다 큼' : c.hi < 0 ? '0보다 작음' : '0을 포함 — 우위 불명';
  return `평균 ${f(c.mean)}R (95% 구간 ${f(c.lo)} ~ ${f(c.hi)}) — ${verdict}`;
}
