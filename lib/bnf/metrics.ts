/**
 * BNF형 연구 — 성과 집계·월별 수익률·판정(결과 보기 전 고정한 기준). 규격: docs/bnf/STRATEGY.md §6~§7
 */
import { DAY } from './data';
import type { RunResult, Trade, ExitReason } from './engine';

export const MIN_TRADES = 30;

export interface Summary {
  trades: number; wins: number; winRate: number | null;
  pf: number | null;               // 손실 거래가 없으면 null(무한대)
  avgR: number | null; avgHoldH: number | null;
  maxLossUsdt: number | null; maxLossR: number | null;
  mddPct: number; totalReturnPct: number; finalEquity: number;
  maxConsecLoss: number; feesTotal: number; slipTotal: number;
  fundingTotal: number | null;     // 거래별 펀딩 합(이력 결측 거래가 있으면 null)
  exitReasons: Record<ExitReason, number>;
  worstMaePct: number | null; cappedTrades: number;
  skipped: RunResult['skipped']; signalsInWindow: number;
  sufficient: boolean;             // 거래 30회 이상
}

/** MTM 자산 경로의 고점 대비 최대 하락(%) */
export function maxDrawdownPct(points: [number, number][]): number {
  let peak = -Infinity, mdd = 0;
  for (const [, e] of points) {
    if (e > peak) peak = e;
    if (peak > 0) mdd = Math.max(mdd, (peak - e) / peak);
  }
  return mdd * 100;
}

export function maxConsecutiveLosses(trades: Trade[]): number {
  let run = 0, best = 0;
  for (const t of trades) { if (t.net <= 0) { run++; best = Math.max(best, run); } else run = 0; }
  return best;
}

export function summarize(run: RunResult, initial: number): Summary {
  const T = run.trades;
  const n = T.length;
  const wins = T.filter((t) => t.net > 0).length;
  const gp = T.filter((t) => t.net > 0).reduce((a, t) => a + t.net, 0);
  const gl = -T.filter((t) => t.net <= 0).reduce((a, t) => a + t.net, 0);
  const finalEquity = n ? T[n - 1].equityAfter : initial;
  const reasons: Record<ExitReason, number> = { target: 0, stop: 0, stop_gap: 0, time: 0, data_end: 0 };
  for (const t of T) reasons[t.reason]++;
  const worst = n ? T.reduce((a, t) => (t.net < a.net ? t : a), T[0]) : null;
  return {
    trades: n, wins, winRate: n ? (wins / n) * 100 : null,
    pf: n === 0 ? null : gl > 0 ? gp / gl : null,
    avgR: n ? T.reduce((a, t) => a + t.r, 0) / n : null,
    avgHoldH: n ? T.reduce((a, t) => a + t.holdH, 0) / n : null,
    maxLossUsdt: worst && worst.net < 0 ? worst.net : null,
    maxLossR: worst && worst.net < 0 ? worst.r : null,
    mddPct: maxDrawdownPct(run.equity),
    totalReturnPct: (finalEquity / initial - 1) * 100, finalEquity,
    maxConsecLoss: maxConsecutiveLosses(T),
    feesTotal: T.reduce((a, t) => a + t.fees, 0),
    slipTotal: T.reduce((a, t) => a + t.slipCost, 0),
    fundingTotal: T.some((t) => t.funding == null) ? null : T.reduce((a, t) => a + (t.funding ?? 0), 0),
    exitReasons: reasons,
    worstMaePct: n ? Math.min(...T.map((t) => t.maePct)) : null,
    cappedTrades: T.filter((t) => t.capped).length,
    skipped: run.skipped, signalsInWindow: run.signalsInWindow,
    sufficient: n >= MIN_TRADES,
  };
}

const monthKey = (t: number) => new Date(t).toISOString().slice(0, 7);
function monthStart(t: number) { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); }
function nextMonth(t: number) { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); }

/** 시각 T 이하 마지막 자산 점 — 점들은 시각 오름차순 */
export function equityAt(points: [number, number][], T: number, initial: number): number {
  let lo = 0, hi = points.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (points[mid][0] <= T) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans < 0 ? initial : points[ans][1];
}

/** UTC 월말 MTM 자산 기준 월별 수익률(%) — fromT 가 속한 달부터 toT 가 속한 달까지 */
export function monthlyReturns(points: [number, number][], initial: number, fromT: number, toT: number): { month: string; retPct: number; endEquity: number }[] {
  const out: { month: string; retPct: number; endEquity: number }[] = [];
  let prev = initial;
  for (let m = monthStart(fromT); m < toT; m = nextMonth(m)) {
    const end = Math.min(nextMonth(m), toT);
    const e = equityAt(points, end, initial);
    out.push({ month: monthKey(m), retPct: (e / prev - 1) * 100, endEquity: e });
    prev = e;
  }
  return out;
}

/** 페이지용 주간 자산 곡선(7일 간격 표본) */
export function sampleCurve(points: [number, number][], initial: number, fromT: number, toT: number, stepMs = 7 * DAY): [number, number][] {
  const out: [number, number][] = [];
  for (let t = fromT; t < toT; t += stepMs) out.push([t, +equityAt(points, t, initial).toFixed(2)]);
  out.push([toT, +equityAt(points, toT, initial).toFixed(2)]);
  return out;
}

export type VerdictCode = 'insufficient' | 'negative' | 'drawdown' | 'weak' | 'inconsistent' | 'funding_negative' | 'candidate';
export const VERDICT_LABEL: Record<VerdictCode, string> = {
  insufficient: '판단 불가 (OOS 거래 30회 미만)',
  negative: '사용 부적합 (기대수익 음수)',
  drawdown: '사용 부적합 (낙폭 과다)',
  weak: '사용 부적합 (우위 미약)',
  inconsistent: '사용 부적합 (기간 간 불일치)',
  funding_negative: '사용 부적합 (펀딩 반영 시 음수)',
  candidate: '추가 검증 후보 (실거래 적합 아님)',
};

/** §7 판정 — OOS 기준, 수수료·슬리피지 반영·펀딩 제외. fundingOos 는 펀딩 반영 OOS(없으면 null=미적용) */
export function verdict(oos: Summary, dev: Summary, fundingOos: Summary | null): VerdictCode {
  if (!oos.sufficient) return 'insufficient';
  if (oos.pf == null ? (oos.avgR ?? 0) <= 0 : oos.pf < 1 || (oos.avgR ?? 0) <= 0) return 'negative';
  if (oos.mddPct > 10) return 'drawdown';
  if (oos.pf != null && oos.pf < 1.2) return 'weak';
  if (dev.sufficient && (dev.avgR ?? 0) <= 0) return 'inconsistent';
  if (fundingOos && (fundingOos.avgR ?? 0) <= 0) return 'funding_negative';
  return 'candidate';
}

/** 거래 → CSV 한 줄용 */
export function tradeRow(t: Trade): (string | number)[] {
  const iso = (x: number) => new Date(x).toISOString().replace('.000Z', 'Z');
  return [iso(t.signalT), iso(t.entryT), iso(t.exitT), t.reason, t.rawOpen, +t.entry.toFixed(4), +t.stop.toFixed(4), +t.target.toFixed(4),
    +(t.stopDist * 100).toFixed(3), +t.atr.toFixed(4), +t.qty.toFixed(6), +t.notional.toFixed(2), +t.margin.toFixed(2), t.capped ? 1 : 0,
    +t.exit.toFixed(4), +t.fees.toFixed(4), +t.slipCost.toFixed(4), t.funding == null ? '' : +t.funding.toFixed(4),
    +t.net.toFixed(4), +t.r.toFixed(4), +t.holdH.toFixed(2), +t.maePct.toFixed(3), +t.mfePct.toFixed(3), +t.equityBefore.toFixed(4), +t.equityAfter.toFixed(4)];
}
export const TRADE_COLUMNS = ['signal_bar_open_utc', 'entry_utc', 'exit_utc', 'exit_reason', 'entry_bar_open', 'entry_fill', 'stop', 'target',
  'stop_dist_pct', 'atr4h14', 'qty_eth', 'notional_usdt', 'margin_usdt', 'margin_capped', 'exit_fill', 'fees_usdt', 'slippage_usdt',
  'funding_usdt', 'net_usdt', 'net_r', 'hold_h', 'mae_pct', 'mfe_pct', 'equity_before', 'equity_after'];
