/**
 * 경제지표 발표 전후 분석(이벤트 스터디) — /event-lab 의 계산. 순수 함수(테스트: tests/eventStudy.test.ts).
 *
 * ⚠ 과거 분석 전용이다. 결과에는 발표 **이후** 데이터가 들어 있으므로 발표 전 매매 판단에 쓰면 미래 정보가 섞인다.
 *   실시간 진입 판단은 lib/riskControl 의 관망 규칙(발표 시각만 사용)이 담당한다.
 *  - 기준가('발표 직전') = 발표 시각에 끝나는 1분봉의 종가(발표 시각 이후 체결 미포함).
 *  - 각 시점 가격 = 그 시각에 '끝나는' 봉의 종가. 해당 봉이 없으면 null(빈칸) — 보간하지 않는다.
 *  - 실제로 받은 봉만 쓴다. 일부만 있으면 있는 구간만 계산한다.
 */

export interface Bar { ts: number; o: number; h: number; l: number; c: number; v: number }
export interface OiPoint { ts: number; oi: number }
export interface FundingPoint { ts: number; rate: number }

export const CHECKPOINTS = [
  { key: 'm60', label: '발표 1시간 전', min: -60 },
  { key: 'pre', label: '발표 직전', min: 0 },
  { key: 'p5', label: '5분 후', min: 5 },
  { key: 'p15', label: '15분 후', min: 15 },
  { key: 'p60', label: '1시간 후', min: 60 },
  { key: 'p240', label: '4시간 후', min: 240 },
  { key: 'p1440', label: '24시간 후', min: 1440 },
] as const;
export type CheckpointKey = (typeof CHECKPOINTS)[number]['key'];

const M = 60_000;

/** ts 시각에 '끝나는' 봉의 종가(봉 길이 stepMs). 없으면 null */
export function closeEndingAt(bars: Bar[], ts: number, stepMs: number): number | null {
  const b = bars.find((x) => x.ts === ts - stepMs);
  return b ? b.c : null;
}

export interface CheckpointRow { key: CheckpointKey; label: string; min: number; price: number | null; pctFromPre: number | null }
/** 1분봉(4시간 이내 시점)과 5분봉(24시간 시점·1분봉 빈 곳 보완)으로 시점별 가격과 '발표 직전' 대비 % */
export function checkpoints(eventTs: number, m1: Bar[], m5: Bar[]): CheckpointRow[] {
  const priceAt = (min: number) => {
    const ts = eventTs + min * M;
    const a = Math.abs(min) <= 240 ? closeEndingAt(m1, ts, M) : null;
    return a ?? (min % 5 === 0 ? closeEndingAt(m5, ts, 5 * M) : null);
  };
  const pre = priceAt(0);
  return CHECKPOINTS.map((c) => {
    const price = priceAt(c.min);
    return { key: c.key, label: c.label, min: c.min, price, pctFromPre: price != null && pre != null && pre > 0 ? ((price - pre) / pre) * 100 : null };
  });
}

export interface Excursion { maxUpPct: number; maxUpAtMin: number; maxDownPct: number; maxDownAtMin: number; coveredMin: number }
/** 발표 후 [0, windowMin) 동안 '발표 직전' 대비 최대 상승·하락(고가·저가 기준)과 도달 시각(분). 봉이 없으면 null */
export function excursion(eventTs: number, bars: Bar[], stepMs: number, windowMin: number, pre: number | null): Excursion | null {
  if (pre == null || !(pre > 0)) return null;
  const win = bars.filter((b) => b.ts >= eventTs && b.ts < eventTs + windowMin * M);
  if (!win.length) return null;
  let up = -Infinity, dn = Infinity, upAt = 0, dnAt = 0;
  for (const b of win) {
    const hi = ((b.h - pre) / pre) * 100, lo = ((b.l - pre) / pre) * 100;
    if (hi > up) { up = hi; upAt = (b.ts - eventTs) / M; }
    if (lo < dn) { dn = lo; dnAt = (b.ts - eventTs) / M; }
  }
  const last = win[win.length - 1];
  return { maxUpPct: up, maxUpAtMin: upAt, maxDownPct: dn, maxDownAtMin: dnAt, coveredMin: (last.ts + stepMs - eventTs) / M };
}

export interface VolumeChange { pre60: number | null; post15: number | null; post60: number | null; ratio15: number | null; ratio60: number | null }
/**
 * 거래량 — 발표 전 60분 합계를 기준으로 발표 후 15분(15분 환산 비교)·60분 합계 비율.
 * ratio15 = (발표 후 15분 합) ÷ (발표 전 60분 합 ÷ 4). 구간에 1분봉이 다 없으면 그 값은 null.
 */
export function volumeChange(eventTs: number, m1: Bar[]): VolumeChange {
  const sum = (from: number, to: number) => {
    const xs = m1.filter((b) => b.ts >= eventTs + from * M && b.ts < eventTs + to * M);
    return xs.length === to - from ? xs.reduce((a, b) => a + b.v, 0) : null;
  };
  const pre60 = sum(-60, 0), post15 = sum(0, 15), post60 = sum(0, 60);
  return {
    pre60, post15, post60,
    ratio15: pre60 && post15 != null ? post15 / (pre60 / 4) : null,
    ratio60: pre60 && post60 != null ? post60 / pre60 : null,
  };
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const a = [...xs].sort((x, y) => x - y), m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

export interface Stabilization { baselinePct: number; minutes: number | null; searchedMin: number }
/**
 * 변동성 안정화까지 걸린 시간 — 기준 = 발표 5~60분 전 1분봉 변동폭((고−저)/종가) 중앙값.
 * 발표 후 k분부터 15분 창의 중앙값이 기준 × mult 이하가 되는 첫 k(분). 확보 구간 안에 없으면 null.
 * 정의가 임의(창 15분·배수 1.5)라 '참고용 측정'이다.
 */
export function stabilization(eventTs: number, m1: Bar[], mult = 1.5, win = 15): Stabilization | null {
  const rng = (b: Bar) => (b.c > 0 ? ((b.h - b.l) / b.c) * 100 : 0);
  const base = m1.filter((b) => b.ts >= eventTs - 60 * M && b.ts < eventTs - 5 * M).map(rng);
  if (base.length < 30) return null;
  const baselinePct = median(base);
  const post = m1.filter((b) => b.ts >= eventTs).sort((a, b) => a.ts - b.ts);
  const byTs = new Map(post.map((b) => [b.ts, b]));
  const lastMin = post.length ? (post[post.length - 1].ts - eventTs) / M : -1;
  for (let k = 0; k + win - 1 <= lastMin; k++) {
    const xs: number[] = [];
    for (let j = k; j < k + win; j++) { const b = byTs.get(eventTs + j * M); if (b) xs.push(rng(b)); }
    if (xs.length < win) continue; // 빈 봉이 있는 창은 판단하지 않음
    if (median(xs) <= baselinePct * mult) return { baselinePct, minutes: k, searchedMin: lastMin + 1 };
  }
  return { baselinePct, minutes: null, searchedMin: lastMin + 1 };
}

export interface OiChange { pre: number | null; p60: number | null; p240: number | null; p1440: number | null; pct60: number | null; pct240: number | null; pct1440: number | null }
/** OI(5분 간격 기록) — 발표 시각 직전(≤) 값 대비 1·4·24시간 뒤(정확히 그 시각 이전 마지막 값, 10분 이내) 변화 % */
export function oiChange(eventTs: number, oi: OiPoint[]): OiChange {
  const at = (ts: number) => {
    let r: OiPoint | null = null;
    for (const p of oi) if (p.ts <= ts && ts - p.ts <= 10 * M && (!r || p.ts > r.ts)) r = p;
    return r?.oi ?? null;
  };
  const pre = at(eventTs), p60 = at(eventTs + 60 * M), p240 = at(eventTs + 240 * M), p1440 = at(eventTs + 1440 * M);
  const pct = (x: number | null) => (x != null && pre != null && pre > 0 ? ((x - pre) / pre) * 100 : null);
  return { pre, p60, p240, p1440, pct60: pct(p60), pct240: pct(p240), pct1440: pct(p1440) };
}

/** 펀딩 — 발표 직전 마지막 정산과 발표 후 첫·둘째 정산 */
export function fundingAround(eventTs: number, f: FundingPoint[]): { before: FundingPoint | null; after: FundingPoint[] } {
  const sorted = [...f].sort((a, b) => a.ts - b.ts);
  let before: FundingPoint | null = null;
  for (const p of sorted) if (p.ts <= eventTs) before = p;
  return { before, after: sorted.filter((p) => p.ts > eventTs).slice(0, 2) };
}

export interface StudyResult {
  eventTs: number;
  checkpoints: CheckpointRow[];
  ex4h: Excursion | null;
  ex24h: Excursion | null;
  volume: VolumeChange;
  stab: Stabilization | null;
  /** 실제로 받은 봉 수(부분 데이터 표시용) */
  coverage: { m1: number; m1Expected: number; m5: number; m5Expected: number };
}
export function studyEvent(eventTs: number, m1: Bar[], m5: Bar[]): StudyResult {
  const cps = checkpoints(eventTs, m1, m5);
  const pre = cps.find((c) => c.key === 'pre')!.price;
  return {
    eventTs, checkpoints: cps,
    ex4h: excursion(eventTs, m1, M, 240, pre),
    ex24h: excursion(eventTs, m5, 5 * M, 1440, pre),
    volume: volumeChange(eventTs, m1),
    stab: stabilization(eventTs, m1),
    coverage: { m1: m1.length, m1Expected: 305, m5: m5.length, m5Expected: 300 },
  };
}

/** 과거 같은 지표 사례 요약 — 시점별 평균·중앙값과 표본 수(값이 있는 사례만) */
export interface CompareSummary { key: CheckpointKey; n: number; mean: number | null; median: number | null; absMean: number | null }
export function compareSummary(results: StudyResult[]): CompareSummary[] {
  return CHECKPOINTS.filter((c) => c.min > 0).map((c) => {
    const xs = results.map((r) => r.checkpoints.find((x) => x.key === c.key)?.pctFromPre).filter((v): v is number => v != null);
    return {
      key: c.key, n: xs.length,
      mean: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null,
      median: xs.length ? median(xs) : null,
      absMean: xs.length ? xs.reduce((a, b) => a + Math.abs(b), 0) / xs.length : null,
    };
  });
}
