/**
 * 위험관리 복기 — 진입 시점 판정(/risk-control)과 실제 결과(거래소 청산 포지션·매매일지)를 잇는 데이터 구조와 집계.
 * 순수 함수(테스트: tests/riskReview.test.ts). 기존 /journal·/review 화면과 저장 형식은 바꾸지 않는다:
 *  - 판정 기록은 새 키(kospi-lab-risk-decisions)에 따로 쌓고, 매매일지(kospi-lab-coin-journal)는 읽기만 한다(fromJournal).
 *  - 실제 결과는 Bitget 청산 포지션(ClosedPosition)을 심볼·방향·진입 시각으로 짝지어 채운다(matchClosed).
 *
 * 무엇을 보나 — 수익률보다 **규칙 준수와 손실 제어**:
 *  평균 R, 수수료·펀딩 차감 후 기대값, 최대 낙폭, 최장 연속 손실, 손절 규칙 준수율(계획 손실의 110% 이내),
 *  발표 직전·직후 거래 성과, 5배 vs 10배, 롱 vs 숏, 추세장 vs 횡보장.
 */
import type { Verdict, Direction, Trend } from './riskControl';

/** /risk-control 에서 '이 판정 기록'을 누를 때 저장되는 한 건 */
export interface RiskDecisionRecord {
  id: string;
  ts: number;                     // 판정 시각
  symbol: string;                 // BTCUSDT
  direction: Direction;
  verdict: Verdict;
  reasonCodes: string[];          // BLOCK·WAIT 사유 코드(규칙 위반 판별용)
  leverage: number;
  entry: number; stop: number; target: number | null;
  equity: number;
  plannedLossUsdt: number;        // 손절 시 예상 순손실(수수료·슬리피지·펀딩 포함)
  plannedNetRR: number | null;
  plannedGrossRR: number | null;
  feeEstUsdt: number;             // 진입+손절 청산 수수료 추정
  slippageEstUsdt: number;
  fundingEstUsdt: number;
  eventWindow: 'pre' | 'post' | 'settling' | 'clear' | null; // 진입 시점 발표 구간
  trend4h: Trend | null; trend1d: Trend | null;
  entryReason: string;
  /** 실제로 진입했는가(사용자 표시). null = 모름 */
  taken: boolean | null;
  outcome?: TradeOutcome | null;
}

export interface TradeOutcome {
  source: 'bitget' | 'manual';
  positionId?: string;
  openTs: number; closeTs: number;
  openAvg: number; closeAvg: number;
  netProfit: number; grossPnl: number; fee: number; funding: number;
}

/** 집계 단위 한 행 — 판정 기록·매매일지 어디서 왔든 같은 모양 */
export interface ReviewRow {
  ts: number;
  side: Direction;
  leverage: number | null;
  plannedLossUsdt: number | null;
  net: number | null;               // 실현 순손익(수수료·펀딩 반영)
  fee: number | null;               // 낸 수수료(양수)
  funding: number | null;           // 펀딩(+받음 / −냄)
  r: number | null;                 // 실현 R = 순손익 ÷ 계획 손실
  verdict: Verdict | null;          // 진입 시점 판정
  ruleViolation: boolean | null;    // BLOCK·WAIT 인데 진입 / 손절 초과
  stopRespected: boolean | null;    // 손실이 계획 손실의 110% 이내
  eventWindow: RiskDecisionRecord['eventWindow'];
  regime: 'trend' | 'range' | null; // 4H 기준 추세장/횡보장
}

export const STOP_TOLERANCE = 1.1;

export function rMultiple(net: number | null, plannedLoss: number | null): number | null {
  return net == null || plannedLoss == null || !(plannedLoss > 0) ? null : net / plannedLoss;
}
/** 손절 규칙 준수 — 손실이면 계획 손실의 tol 배 이내, 이익·본전이면 준수 */
export function stopRespected(net: number | null, plannedLoss: number | null, tol = STOP_TOLERANCE): boolean | null {
  if (net == null || plannedLoss == null || !(plannedLoss > 0)) return null;
  return net >= 0 || -net <= plannedLoss * tol;
}

export function rowFromDecision(d: RiskDecisionRecord): ReviewRow | null {
  if (d.taken === false) return null;
  const o = d.outcome ?? null;
  const net = o ? o.netProfit : null;
  const respected = stopRespected(net, d.plannedLossUsdt);
  const violatedVerdict = d.taken === true || o ? d.verdict !== 'ALLOW' : null;
  return {
    ts: o?.openTs ?? d.ts, side: d.direction, leverage: d.leverage, plannedLossUsdt: d.plannedLossUsdt,
    net, fee: o ? Math.abs(o.fee) : null, funding: o ? o.funding : null,
    r: rMultiple(net, d.plannedLossUsdt), verdict: d.verdict,
    ruleViolation: violatedVerdict == null && respected == null ? null : Boolean(violatedVerdict) || respected === false,
    stopRespected: respected,
    eventWindow: d.eventWindow,
    regime: d.trend4h == null ? null : d.trend4h === 'flat' ? 'range' : 'trend',
  };
}

/** 기존 매매일지(읽기 전용) → 행. 판정 기록이 없으므로 verdict·eventWindow·regime 은 null */
export interface JournalLite {
  ts: number; direction: 'long' | 'short' | 'wait'; entry: number; stop: number; leverage: number;
  result: 'open' | 'win' | 'loss' | 'even'; resultR: number | null; realizedUsdt?: number | null;
  seedUsdt?: number | null; riskPct?: number | null; notionUsdt?: number | null;
}
export function rowFromJournal(j: JournalLite): ReviewRow | null {
  if (j.direction === 'wait' || j.result === 'open') return null;
  const stopDist = j.entry > 0 && j.stop > 0 ? Math.abs(j.entry - j.stop) / j.entry : null;
  const planned = j.notionUsdt && stopDist ? j.notionUsdt * stopDist : j.seedUsdt && j.riskPct ? (j.seedUsdt * j.riskPct) / 100 : null;
  const net = j.realizedUsdt ?? null;
  const respected = net != null ? stopRespected(net, planned) : j.resultR != null ? j.resultR >= -STOP_TOLERANCE : null;
  return {
    ts: j.ts, side: j.direction, leverage: j.leverage > 0 ? j.leverage : null, plannedLossUsdt: planned,
    net, fee: null, funding: null,
    r: j.resultR ?? rMultiple(net, planned), verdict: null,
    ruleViolation: respected == null ? null : !respected, stopRespected: respected,
    eventWindow: null, regime: null,
  };
}

/** 판정 기록 ↔ 거래소 청산 포지션 짝짓기 — 같은 심볼·방향, 진입이 판정 −30분~+6시간 안, 가장 가까운 것. 한 포지션은 한 번만 */
export interface ClosedLite { positionId: string; symbol: string; side: Direction; openAvg: number; closeAvg: number; netProfit: number; grossPnl: number; fee: number; funding: number; openTs: number; closeTs: number }
export function matchClosed(decisions: RiskDecisionRecord[], closed: ClosedLite[], fromMs = 30 * 60_000, toMs = 6 * 3600_000): Map<string, TradeOutcome> {
  const used = new Set<string>(decisions.map((d) => d.outcome?.positionId).filter((x): x is string => !!x));
  const out = new Map<string, TradeOutcome>();
  const norm = (s: string) => s.toUpperCase().replace(/_.*$/, '');
  for (const d of [...decisions].sort((a, b) => a.ts - b.ts)) {
    if (d.outcome || d.taken === false) continue;
    const cand = closed
      .filter((c) => !used.has(c.positionId) && norm(c.symbol) === norm(d.symbol) && c.side === d.direction && c.openTs >= d.ts - fromMs && c.openTs <= d.ts + toMs)
      .sort((a, b) => Math.abs(a.openTs - d.ts) - Math.abs(b.openTs - d.ts))[0];
    if (!cand) continue;
    used.add(cand.positionId);
    out.set(d.id, { source: 'bitget', positionId: cand.positionId, openTs: cand.openTs, closeTs: cand.closeTs, openAvg: cand.openAvg, closeAvg: cand.closeAvg, netProfit: cand.netProfit, grossPnl: cand.grossPnl, fee: cand.fee, funding: cand.funding });
  }
  return out;
}

/* ── 집계 ─────────────────────────────────────────────── */
export interface GroupStat { n: number; avgR: number | null; rN: number; expectancy: number | null; netSum: number; feeSum: number; wins: number; losses: number; winRate: number | null }
export function groupStat(rows: ReviewRow[]): GroupStat {
  const done = rows.filter((r) => r.net != null || r.r != null);
  const rs = done.map((r) => r.r).filter((v): v is number => v != null);
  const nets = done.map((r) => r.net).filter((v): v is number => v != null);
  const sign = (r: ReviewRow) => (r.net ?? r.r ?? 0);
  const wins = done.filter((r) => sign(r) > 0).length, losses = done.filter((r) => sign(r) < 0).length;
  return {
    n: done.length,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null, rN: rs.length,
    expectancy: nets.length ? nets.reduce((a, b) => a + b, 0) / nets.length : null,
    netSum: nets.reduce((a, b) => a + b, 0),
    feeSum: done.reduce((a, r) => a + (r.fee ?? 0), 0),
    wins, losses, winRate: wins + losses ? wins / (wins + losses) : null,
  };
}

/** 순손익 누적 곡선의 최대 낙폭(USDT, 양수) — 시간순 */
export function maxDrawdown(rows: ReviewRow[]): number {
  let eq = 0, peak = 0, mdd = 0;
  for (const r of [...rows].sort((a, b) => a.ts - b.ts)) {
    if (r.net == null) continue;
    eq += r.net; peak = Math.max(peak, eq); mdd = Math.max(mdd, peak - eq);
  }
  return mdd;
}
/** 최장 연속 손실(순손익 또는 R 기준, 본전은 끊지 않고 건너뜀) */
export function maxLossStreak(rows: ReviewRow[]): number {
  let cur = 0, best = 0;
  for (const r of [...rows].sort((a, b) => a.ts - b.ts)) {
    const v = r.net ?? r.r;
    if (v == null || v === 0) continue;
    if (v < 0) { cur++; best = Math.max(best, cur); } else cur = 0;
  }
  return best;
}

export interface ReviewSummary {
  all: GroupStat;
  mdd: number;
  maxLossStreak: number;
  stopRespectRate: number | null; stopRespectN: number;
  violationRate: number | null; violationN: number;
  byLeverage: { label: string; stat: GroupStat }[];  // ≤5배 / 6~10배 / 10배 초과
  bySide: { label: string; stat: GroupStat }[];
  byEvent: { label: string; stat: GroupStat }[];      // 발표 전후(관망 구간) vs 그 밖
  byRegime: { label: string; stat: GroupStat }[];
}
export function summarizeReview(rows: ReviewRow[]): ReviewSummary {
  const sr = rows.filter((r) => r.stopRespected != null);
  const vr = rows.filter((r) => r.ruleViolation != null);
  const lev = (lo: number, hi: number) => rows.filter((r) => r.leverage != null && r.leverage > lo && r.leverage <= hi);
  return {
    all: groupStat(rows),
    mdd: maxDrawdown(rows),
    maxLossStreak: maxLossStreak(rows),
    stopRespectRate: sr.length ? sr.filter((r) => r.stopRespected).length / sr.length : null, stopRespectN: sr.length,
    violationRate: vr.length ? vr.filter((r) => r.ruleViolation).length / vr.length : null, violationN: vr.length,
    byLeverage: [
      { label: '5배 이하', stat: groupStat(lev(0, 5)) },
      { label: '6~10배', stat: groupStat(lev(5, 10)) },
      { label: '10배 초과', stat: groupStat(lev(10, Infinity)) },
    ],
    bySide: [
      { label: '롱', stat: groupStat(rows.filter((r) => r.side === 'long')) },
      { label: '숏', stat: groupStat(rows.filter((r) => r.side === 'short')) },
    ],
    byEvent: [
      { label: '발표 전후 관망 구간', stat: groupStat(rows.filter((r) => r.eventWindow === 'pre' || r.eventWindow === 'post' || r.eventWindow === 'settling')) },
      { label: '그 밖', stat: groupStat(rows.filter((r) => r.eventWindow === 'clear')) },
    ],
    byRegime: [
      { label: '추세장(4H)', stat: groupStat(rows.filter((r) => r.regime === 'trend')) },
      { label: '횡보장(4H)', stat: groupStat(rows.filter((r) => r.regime === 'range')) },
    ],
  };
}
