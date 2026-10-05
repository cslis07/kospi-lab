/**
 * 매매 해부 — 진입/손절이 그 순간의 차트 구조·변동성에 비춰 잘 실행됐는가를 사후 계산한다.
 * ⚠ 예측이 아니다. 전부 진입 이후를 아는 상태의 실행 품질 평가(백워드-룩킹).
 *  - 손절 폭 vs ATR: 너무 타이트하면 노이즈에 털린다
 *  - 진입 위치: 룩백 고/저 어디서 들어갔나(추격 vs 눌림)
 *  - MAE/MFE: 진입 직후 얼마나 역행/순행했나(R 단위) → 타이밍·익절 규율 진단
 */
export interface Candle { ts: number; o: number; h: number; l: number; c: number }
export interface AutopsyInput {
  entry: number; stop: number; target1?: number | null;
  direction: 'long' | 'short'; entryTs: number; exitTs?: number | null;
  result?: 'open' | 'win' | 'loss' | 'even';
}
export interface Finding { key: string; severity: 'good' | 'warn' | 'bad'; title: string; fix?: string }
export interface Autopsy {
  risk: number; atr: number | null; stopInAtr: number | null;
  entryLocationPct: number | null; maeR: number | null; mfeR: number | null;
  lookbackN: number; forwardN: number; findings: Finding[];
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Wilder ATR — 진입 직전 캔들들로 계산 */
export function atr(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    trs.push(Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c)));
  }
  const last = trs.slice(-period);
  return last.reduce((a, v) => a + v, 0) / period;
}

/** 보유 구간 캔들의 최대 역행(adverse)·최대 순행(favor) — 가격 차이(0 이상). MAE/MFE 의 단일 정의 */
export function priceExcursion(entry: number, long: boolean, held: Candle[]): { adverse: number; favor: number } | null {
  if (!held.length) return null;
  const minL = Math.min(...held.map((c) => c.l)), maxH = Math.max(...held.map((c) => c.h));
  return {
    adverse: Math.max(0, long ? entry - minL : maxH - entry),
    favor: Math.max(0, long ? maxH - entry : entry - minL),
  };
}

// ───────────── 거래소 청산 매매의 MAE/MFE (진입·청산 시각을 아는 경우) ─────────────

/** Bitget history-candles 가 받는 봉 단위와 길이(ms). 한 번에 최대 200봉 */
export const GRANULARITIES: [string, number][] = [
  ['1m', 60_000], ['5m', 300_000], ['15m', 900_000], ['30m', 1_800_000],
  ['1H', 3_600_000], ['4H', 14_400_000], ['12H', 43_200_000], ['1D', 86_400_000],
];
export const CANDLE_LIMIT = 200;
/** 진입 전 봉(ATR·진입 위치 계산용) */
export const LOOKBACK_BARS = 30;

/** 보유 구간 + 진입 전 30봉이 200봉 안에 들어가는 가장 촘촘한 봉 단위 */
export function pickGranularity(holdMs: number): { g: string; ms: number; limit: number } {
  for (const [g, ms] of GRANULARITIES) {
    const bars = Math.ceil(Math.max(holdMs, 1) / ms) + 1 + LOOKBACK_BARS;
    if (bars <= CANDLE_LIMIT) return { g, ms, limit: bars };
  }
  const [g, ms] = GRANULARITIES[GRANULARITIES.length - 1];
  return { g, ms, limit: CANDLE_LIMIT };
}

export interface ExcursionInput {
  side: 'long' | 'short';
  entry: number;         // 평균 진입가
  exit: number;          // 평균 청산가
  size: number;          // 수량(코인)
  openTs: number;
  closeTs: number;
  stop?: number | null;  // 손절가(있을 때만 R 환산)
}
export interface Excursion {
  maePct: number; mfePct: number;      // 진입가 대비 %
  maeUsdt: number; mfeUsdt: number;    // 수량 × 가격 차이(수수료 전)
  maeR: number | null; mfeR: number | null;
  /** 청산 시점 순행 % (+ 유리하게 청산, − 불리하게 청산) */
  exitPct: number;
  /** 최대 순행 중 실제로 챙긴 비율 % (MFE 가 0이면 null). 음수 = 순행했다가 손실로 청산 */
  capturePct: number | null;
  bars: number;
  /** 보유 시간이 봉 3개보다 짧아 봉 전체 범위가 섞인 근사 */
  rough: boolean;
}

/**
 * 거래소 청산 매매 하나의 MAE/MFE. 봉이 보유 구간과 겹치면 포함(진입·청산 봉은 봉 전체 범위 → 약간 과대 가능).
 * 청산가는 실제로 거친 가격이므로 MAE/MFE 는 최소한 청산 시점의 역행/순행 이상이 되게 맞춘다.
 */
export function tradeExcursion(inp: ExcursionInput, candles: Candle[], barMs: number): Excursion | null {
  const long = inp.side === 'long';
  if (!(inp.entry > 0)) return null;
  const held = candles.filter((c) => c.ts + barMs > inp.openTs && c.ts <= inp.closeTs);
  const ex = priceExcursion(inp.entry, long, held);
  if (!ex) return null;
  const exitMove = long ? inp.exit - inp.entry : inp.entry - inp.exit; // + 유리
  const adverse = Math.max(ex.adverse, -exitMove, 0);
  const favor = Math.max(ex.favor, exitMove, 0);
  const risk = inp.stop != null && inp.stop > 0 ? Math.abs(inp.entry - inp.stop) : 0;
  const size = Number.isFinite(inp.size) ? Math.abs(inp.size) : 0;
  return {
    maePct: r2((adverse / inp.entry) * 100),
    mfePct: r2((favor / inp.entry) * 100),
    maeUsdt: r2(adverse * size),
    mfeUsdt: r2(favor * size),
    maeR: risk > 0 ? r2(adverse / risk) : null,
    mfeR: risk > 0 ? r2(favor / risk) : null,
    exitPct: r2((exitMove / inp.entry) * 100),
    capturePct: favor > 0 ? Math.round((exitMove / favor) * 100) : null,
    bars: held.length,
    rough: inp.closeTs - inp.openTs < 3 * barMs,
  };
}

export interface ExcursionSummary {
  n: number;
  avgMaePct: number | null;
  avgMfePct: number | null;
  /** 이익 매매가 최대 순행 중 평균 몇 % 를 챙겼나 */
  winnersCapturePct: number | null;
  winners: number;
  losers: number;
  /** 손실 매매 중, 한때 '최종 손실만큼 이상' 이익 중이던 매매(이익을 지켰다면 손실은 아니었을 매매) */
  gaveBack: number;
  /** 손절가가 있는 매매 수와, 그중 손절가를 넘어 역행(MAE ≥ 1R)한 수 */
  withStop: number;
  beyondStop: number;
}

/** 손실로 끝났지만 보유 중 한때 '최종 손실폭 이상' 이익 중이던 매매인가(요약의 gaveBack 과 같은 정의) */
export function isGaveBack(ex: Excursion, net: number): boolean {
  return net < 0 && ex.mfePct > 0 && ex.mfePct >= Math.abs(ex.exitPct);
}
/** 보유 중 가장 유리했던 가격 — 롱은 진입가 위, 숏은 진입가 아래(MFE % 로 환산, 봉 고저 기준 근사) */
export function peakPrice(entry: number, side: 'long' | 'short', mfePct: number): number {
  return side === 'long' ? entry * (1 + mfePct / 100) : entry * (1 - mfePct / 100);
}

/** 여러 매매의 MAE/MFE 요약(참고: Edgewonk 'MAE/MFE analysis'). net = 순손익(이익/손실 판정) */
export function excursionSummary(list: { ex: Excursion; net: number }[]): ExcursionSummary {
  const avg = (vs: number[]) => (vs.length ? vs.reduce((a, v) => a + v, 0) / vs.length : null);
  const win = list.filter((x) => x.net > 0), loss = list.filter((x) => x.net < 0);
  const stopped = list.filter((x) => x.ex.maeR != null);
  return {
    n: list.length,
    avgMaePct: avg(list.map((x) => x.ex.maePct)),
    avgMfePct: avg(list.map((x) => x.ex.mfePct)),
    winnersCapturePct: avg(win.map((x) => x.ex.capturePct).filter((v): v is number => v != null)),
    winners: win.length,
    losers: loss.length,
    gaveBack: loss.filter((x) => isGaveBack(x.ex, x.net)).length,
    withStop: stopped.length,
    beyondStop: stopped.filter((x) => (x.ex.maeR ?? 0) >= 1).length,
  };
}

export function analyzeTrade(inp: AutopsyInput, candles: Candle[], opts?: { forwardMs?: number; lookbackN?: number }): Autopsy {
  const cs = [...candles].sort((a, b) => a.ts - b.ts);
  const long = inp.direction === 'long';
  const risk = Math.abs(inp.entry - inp.stop);
  const lookbackN = opts?.lookbackN ?? 24;
  const forwardMs = opts?.forwardMs ?? 5 * 86_400_000;

  const before = cs.filter((c) => c.ts <= inp.entryTs);
  const a = atr(before.length >= 15 ? before : cs.slice(0, Math.max(15, before.length)));
  const stopInAtr = a && a > 0 ? risk / a : null;

  // 진입 위치: 진입 전 lookbackN 캔들의 [저,고] 중 진입가 위치(0~1)
  const lb = before.slice(-lookbackN);
  let entryLocationPct: number | null = null;
  if (lb.length >= 4) {
    const lo = Math.min(...lb.map((c) => c.l)), hi = Math.max(...lb.map((c) => c.h));
    if (hi > lo) entryLocationPct = Math.max(0, Math.min(1, (inp.entry - lo) / (hi - lo)));
  }

  // MAE/MFE: 진입 후 보유 구간(exit 또는 forward 한도)에서 최대 역행/순행
  const end = inp.exitTs ?? inp.entryTs + forwardMs;
  const fwd = cs.filter((c) => c.ts >= inp.entryTs && c.ts <= end);
  let maeR: number | null = null, mfeR: number | null = null;
  const ex = priceExcursion(inp.entry, long, fwd);
  if (ex && risk > 0) {
    maeR = r2(ex.adverse / risk);
    mfeR = r2(ex.favor / risk);
  }

  const f: Finding[] = [];
  // 손절 폭 vs ATR
  if (stopInAtr != null) {
    if (stopInAtr < 0.8) f.push({ key: 'stop-tight', severity: 'bad', title: `손절이 ${r1(stopInAtr)} ATR로 타이트 — 정상 변동성에 털릴 위험`, fix: '손절을 1.2~1.5 ATR로 넓히고 수량을 줄여 1R(허용손실)을 그대로 유지하세요.' });
    else if (stopInAtr > 3.5) f.push({ key: 'stop-wide', severity: 'warn', title: `손절이 ${r1(stopInAtr)} ATR로 매우 넓음 — 1R이 커 부담`, fix: '진입을 손절 가까이 당기거나 수량을 줄이세요. 넓은 손절엔 작은 수량이 원칙.' });
    else f.push({ key: 'stop-ok', severity: 'good', title: `손절 폭 ${r1(stopInAtr)} ATR — 변동성 대비 적정` });
  }
  // 진입 위치
  if (entryLocationPct != null) {
    const p = Math.round(entryLocationPct * 100);
    const chase = long ? entryLocationPct > 0.85 : entryLocationPct < 0.15;
    const dip = long ? entryLocationPct < 0.25 : entryLocationPct > 0.75;
    if (chase) f.push({ key: 'chase', severity: 'warn', title: `최근 ${lookbackN}봉 ${long ? '고점' : '저점'} 부근(${long ? '상위' : '하위'} ${long ? p : 100 - p}%) 추격 진입`, fix: '되돌림(피보 0.382~0.618)이나 이평/VWAP 회귀를 기다렸다 분할 진입하면 손절 여유가 커집니다.' });
    else if (dip) f.push({ key: 'dip', severity: 'good', title: `${long ? '저점' : '고점'} 부근 진입 — 손절까지 여유가 확보된 자리` });
  }
  // MAE — 진입 직후 역행 = 타이밍
  if (maeR != null) {
    if (maeR >= 0.9) f.push({ key: 'mae-high', severity: 'warn', title: `진입 직후 −${maeR}R까지 역행 — 진입이 일렀음(눌림 전 진입)`, fix: '진입존을 지지/이평까지 낮춰 분할하거나, 즉시 역행 시 손절 후 재진입 규칙을 두세요.' });
    else if (maeR < 0.3) f.push({ key: 'mae-low', severity: 'good', title: `진입 직후 역행 ${maeR}R로 미미 — 타이밍 양호` });
  }
  // MFE vs 결과 — 익절/트레일 규율
  if (mfeR != null && inp.result === 'loss' && mfeR >= 1.5)
    f.push({ key: 'gave-back', severity: 'bad', title: `최대 +${mfeR}R까지 순행했으나 손실 마감 — 이익을 되돌려줌`, fix: '+1R 도달 시 절반 부분익절 + 나머지 본전 손절 이동(트레일) 규칙을 세우세요.' });

  return { risk: r2(risk), atr: a == null ? null : r2(a), stopInAtr: stopInAtr == null ? null : r2(stopInAtr), entryLocationPct, maeR, mfeR, lookbackN, forwardN: fwd.length, findings: f };
}
