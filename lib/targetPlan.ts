/**
 * 목표 수익률 역산 엔진 — 예측 0, 산수 100.
 * "월 X%"를 회당 기대값(R)·매매 빈도·회당 리스크로 역산하고, 내 실측 기대값과 대조해
 * 도달 가능/불가를 판정한다. 무엇을 얼마나 바꿔야 하는지(레버)도 숫자로 낸다.
 * ⚠ 이 엔진은 방향을 맞히지 않는다. 수익률은 예측이 아니라 기대값×빈도×리스크의 곱이다.
 */
export interface TargetSettings { seedUsdt: number; monthlyTargetPct: number; riskPct: number; tradesPerMonth: number }
export const DEFAULT_TARGET: TargetSettings = { seedUsdt: 1000, monthlyTargetPct: 5, riskPct: 1, tradesPerMonth: 20 };
/** 회당 리스크 하드 상한 — 이 위로는 드로다운이 목표를 삼킨다 */
export const HARD_MAX_RISK_PCT = 2;

export interface EdgeRow { ts: number; result: 'open' | 'win' | 'loss' | 'even'; resultR: number | null; realizedUsdt?: number | null }
export interface MeasuredEdge {
  avgR: number | null;      // 실측 기대값(R) — 계획(R) 기록 매매만
  winRate: number | null;   // % (승/(승+패))
  avgWinR: number | null;   // 평균 익절 R
  avgLossR: number | null;  // 평균 손절 R (양수 크기)
  rCount: number;           // R 표본 수
  tradesLast30d: number;    // 최근 30일 청산 건수(빈도 실측)
}
const DAY = 86_400_000;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function measureEdge(rows: EdgeRow[], now = Date.now()): MeasuredEdge {
  const closed = rows.filter((r) => r.result !== 'open');
  const rs = closed.map((r) => r.resultR).filter((x): x is number => x != null);
  const wins = rs.filter((x) => x > 0), losses = rs.filter((x) => x < 0);
  const decided = closed.filter((r) => r.result === 'win' || r.result === 'loss');
  const w = decided.filter((r) => r.result === 'win').length;
  return {
    avgR: rs.length ? rs.reduce((a, v) => a + v, 0) / rs.length : null,
    winRate: decided.length ? (w / decided.length) * 100 : null,
    avgWinR: wins.length ? wins.reduce((a, v) => a + v, 0) / wins.length : null,
    avgLossR: losses.length ? Math.abs(losses.reduce((a, v) => a + v, 0) / losses.length) : null,
    rCount: rs.length,
    tradesLast30d: closed.filter((r) => now - r.ts <= 30 * DAY).length,
  };
}

/** 월 목표를 달성하려면 회당 평균 몇 R이 필요한가 = 목표% / (월 매매수 × 회당리스크%) */
export function requiredAvgR(s: TargetSettings): number {
  return s.tradesPerMonth > 0 && s.riskPct > 0 ? s.monthlyTargetPct / (s.tradesPerMonth * s.riskPct) : Infinity;
}
/** 현재 조건으로 기대되는 월 수익률(%) — 복리 무시(월 단위 근사) */
export function projectedMonthlyPct(riskPct: number, avgR: number, trades: number): number {
  return riskPct * avgR * trades;
}
/** 손익비 고정 시 필요한 승률(%) : E = pW − (1−p)L → p = (E+L)/(W+L) */
export function neededWinRate(requiredR: number, avgWinR: number, avgLossR: number): number | null {
  const d = avgWinR + avgLossR; if (d <= 0) return null;
  return clamp(((requiredR + avgLossR) / d) * 100, 0, 100);
}
/** 승률 고정 시 필요한 평균 익절 R : W = (E + (1−p)L)/p */
export function neededRR(requiredR: number, winRatePct: number, avgLossR: number): number | null {
  const p = winRatePct / 100; if (p <= 0) return null;
  return (requiredR + (1 - p) * avgLossR) / p;
}
export function neededTrades(targetPct: number, riskPct: number, avgR: number): number | null {
  return avgR > 0 && riskPct > 0 ? Math.ceil(targetPct / (riskPct * avgR)) : null;
}
export function neededRiskPct(targetPct: number, trades: number, avgR: number): number | null {
  return avgR > 0 && trades > 0 ? targetPct / (trades * avgR) : null;
}

export interface Lever { key: string; label: string; from: string; to: string; feasible: boolean; note?: string }
export interface TargetAssessment {
  requiredR: number; actualR: number | null; projectedPct: number | null;
  /** unknown=표본<10, negative=기대값 음수, gap=부족, on-track=충족 */
  status: 'unknown' | 'negative' | 'gap' | 'on-track';
  gapR: number | null; levers: Lever[];
}
export function assessTarget(s: TargetSettings, e: MeasuredEdge): TargetAssessment {
  const requiredR = requiredAvgR(s);
  const actualR = e.avgR;
  const projectedPct = actualR == null ? null : projectedMonthlyPct(s.riskPct, actualR, s.tradesPerMonth);
  let status: TargetAssessment['status'] = 'unknown';
  if (e.rCount >= 10 && actualR != null) status = actualR < 0 ? 'negative' : actualR >= requiredR ? 'on-track' : 'gap';
  const gapR = actualR == null ? null : requiredR - actualR;
  const levers: Lever[] = [];
  if (e.winRate != null && e.avgWinR != null && e.avgLossR != null) {
    const p = neededWinRate(requiredR, e.avgWinR, e.avgLossR);
    if (p != null) levers.push({ key: 'winrate', label: '승률', from: `${e.winRate.toFixed(0)}%`, to: `${p.toFixed(0)}%`, feasible: p <= 65, note: '손익비 유지 시' });
    const W = neededRR(requiredR, e.winRate, e.avgLossR);
    if (W != null) levers.push({ key: 'rr', label: '평균 익절', from: `${e.avgWinR.toFixed(2)}R`, to: `${W.toFixed(2)}R`, feasible: W <= 3, note: '승률 유지 시' });
  }
  if (actualR != null && actualR > 0) {
    const n = neededTrades(s.monthlyTargetPct, s.riskPct, actualR);
    if (n != null) levers.push({ key: 'trades', label: '월 매매 수', from: `${s.tradesPerMonth}회`, to: `${n}회`, feasible: n <= 60, note: '현재 기대값 유지 시' });
    const rp = neededRiskPct(s.monthlyTargetPct, s.tradesPerMonth, actualR);
    if (rp != null) levers.push({ key: 'risk', label: '회당 리스크', from: `${s.riskPct}%`, to: `${rp.toFixed(2)}%`, feasible: rp <= HARD_MAX_RISK_PCT, note: rp > HARD_MAX_RISK_PCT ? `상한 ${HARD_MAX_RISK_PCT}% 초과 — 드로다운이 목표를 삼킴` : '드로다운도 같이 커짐' });
  }
  return { requiredR, actualR, projectedPct, status, gapR, levers };
}

export interface MonthProgress { realizedUsdt: number; pct: number; rSum: number; trades: number; realizedCount: number }
/** 이달 진행률 — 실현손익(입력된 건)·R 합·건수. 정직하게: 결과 없는 건은 세지 않는다 */
export function monthToDate(rows: EdgeRow[], seed: number, now = Date.now()): MonthProgress {
  const d = new Date(now); const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const m = rows.filter((r) => r.ts >= start && r.result !== 'open');
  const withUsdt = m.filter((r) => r.realizedUsdt != null);
  const realizedUsdt = withUsdt.reduce((a, r) => a + (r.realizedUsdt ?? 0), 0);
  const rSum = m.map((r) => r.resultR).filter((x): x is number => x != null).reduce((a, v) => a + v, 0);
  return { realizedUsdt, pct: seed > 0 ? (realizedUsdt / seed) * 100 : 0, rSum, trades: m.length, realizedCount: withUsdt.length };
}
