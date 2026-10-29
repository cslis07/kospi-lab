/**
 * 복기 대시보드(/review) 계산 — 순수 함수만(테스트: tests/reviewDash.test.ts).
 *  · scalpImpact  — 1시간 미만 매매를 안 했다면 순손익(가장 큰 비용 구멍을 숫자 하나로)
 *  · weekRules    — 이번 주 vs 지난주 규칙 3줄(비용 비중·1시간 미만 건수·손절 주문 비율) — 주간 복기 텔레그램과 같은 기준
 *  · lossGauge    — 오늘·최근 7일 실현손익 vs 손실 한도(서킷브레이커·가드와 같은 기준: 한도 미설정 시 오늘 = 평가금 3% 가정)
 *  · cumSeries    — 타일 추세선용 누적 합(청산 시각순)
 *  · dayCost      — 날짜(KST, 진입 기준)별 수수료·순손익
 * 모두 청산 시각 기준(dayCost 만 달력과 같은 진입 기준). 손익 = 거래소 netProfit(수수료·펀딩 반영).
 */
import { kstDateKey } from './journalAnalytics';

export interface DashPos { openTs: number; closeTs: number; netProfit: number; grossPnl: number; fee: number; funding: number; stop?: number | null }

export const SCALP_MS = 3_600_000;
const DAY = 86_400_000, KST = 9 * 3_600_000;
const isScalp = (p: DashPos) => p.openTs > 0 && p.closeTs >= p.openTs && p.closeTs - p.openTs < SCALP_MS;
const kstDayStart = (ts: number) => Math.floor((ts + KST) / DAY) * DAY - KST;

export function scalpImpact(ps: DashPos[]): { n: number; net: number; fee: number; netAll: number; netWithout: number } {
  const s = ps.filter(isScalp);
  const netAll = ps.reduce((a, p) => a + p.netProfit, 0);
  const net = s.reduce((a, p) => a + p.netProfit, 0);
  return { n: s.length, net, fee: s.reduce((a, p) => a + p.fee, 0), netAll, netWithout: netAll - net };
}

export interface RuleWeek {
  n: number;
  /** 이익 매매의 매매손익 중 비용(수수료+낸 펀딩) 비율 % — 번 돈 대비 */
  costPct: number | null;
  scalpN: number;
  /** 거래소 손절 주문 기록이 있는 매매 비율 % */
  slRate: number | null;
}
function ruleOf(ps: DashPos[]): RuleWeek {
  const grossWin = ps.reduce((a, p) => a + Math.max(0, p.grossPnl), 0);
  const cost = -ps.reduce((a, p) => a + p.fee + p.funding, 0);
  return {
    n: ps.length,
    costPct: grossWin > 0 ? Math.round((cost / grossWin) * 100) : null,
    scalpN: ps.filter(isScalp).length,
    slRate: ps.length ? Math.round((ps.filter((p) => p.stop != null).length / ps.length) * 100) : null,
  };
}
/** 이번 주 = 최근 7일(청산 시각, now 포함) · 지난주 = 그 전 7일 */
export function weekRules(ps: DashPos[], now: number): { cur: RuleWeek; prev: RuleWeek } {
  const W = 7 * DAY;
  return {
    cur: ruleOf(ps.filter((p) => p.closeTs > now - W && p.closeTs <= now)),
    prev: ruleOf(ps.filter((p) => p.closeTs > now - 2 * W && p.closeTs <= now - W)),
  };
}

export interface LossGauge {
  today: number; week: number;
  dailyLimit: number | null; dailyAssumed: boolean;
  weeklyLimit: number | null;
}
/** 오늘(KST 자정부터)·최근 7일(오늘 포함, 서킷브레이커와 같은 창) 실현 순손익과 한도 */
export function lossGauge(ps: DashPos[], now: number, limits: { dailyLossLimitUsdt: number | null; weeklyLossLimitUsdt: number | null }, equity: number | null): LossGauge {
  const today0 = kstDayStart(now), week0 = today0 - 6 * DAY;
  const sum = (from: number) => ps.filter((p) => p.closeTs >= from && p.closeTs <= now).reduce((a, p) => a + p.netProfit, 0);
  const assumed = limits.dailyLossLimitUsdt == null && equity != null && equity > 0;
  return {
    today: sum(today0), week: sum(week0),
    dailyLimit: limits.dailyLossLimitUsdt ?? (assumed ? Math.round(equity! * 0.03 * 100) / 100 : null),
    dailyAssumed: assumed,
    weeklyLimit: limits.weeklyLossLimitUsdt,
  };
}

/** 누적 합 — 청산 시각순. 점이 1개뿐이면 0 에서 시작하게 앞에 0 을 붙인다 */
export function cumSeries(ps: DashPos[], pick: (p: DashPos) => number): number[] {
  const asc = [...ps].sort((a, b) => a.closeTs - b.closeTs);
  let acc = 0;
  const out = asc.map((p) => (acc += pick(p)));
  return out.length === 1 ? [0, ...out] : out;
}

/** 날짜(KST, 진입 기준 — 달력과 같은 기준)별 수수료·순손익 */
export function dayCost(ps: DashPos[]): Map<string, { fee: number; net: number }> {
  const m = new Map<string, { fee: number; net: number }>();
  for (const p of ps) {
    const k = kstDateKey(p.openTs || p.closeTs);
    const r = m.get(k) ?? { fee: 0, net: 0 };
    r.fee += p.fee; r.net += p.netProfit;
    m.set(k, r);
  }
  return m;
}
