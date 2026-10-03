/**
 * 코인 기초 공부법(/study) 그림용 데이터 — 전부 **설명용 가상 데이터**(실제 시세 아님).
 * 모양은 기준점(waypoint)으로 정하고, 고정 시드 잡음을 얹어 실제 차트처럼 보이게 한다(매번 같은 그림).
 * 지표는 앱이 실제로 쓰는 공식(lib/indicators)으로 계산 — 손으로 그린 선이 아니다.
 * 각 그림이 설명하려는 성질(예: 다이버전스가 실제로 생긴다)은 tests/study.test.ts 가 고정한다.
 */
import { calcMA, calcRSI, calcMACD, calcBB } from './indicators';

export interface Candle { o: number; h: number; l: number; c: number }

/** 고정 시드 난수(LCG) — 그림이 매번 같게 */
export function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * 기준점 [인덱스, 가격, 잡음폭?] 사이를 부드럽게(코사인) 잇고 잡음을 얹은 종가열.
 * 잡음폭은 기준점끼리 선형 보간(구간마다 변동성을 다르게 — 볼린저 스퀴즈 등).
 */
export function pathSeries(points: [number, number, number?][], seed = 1, defaultNoise = 0.6): number[] {
  const r = rng(seed);
  const n = points[points.length - 1][0] + 1;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let k = 0;
    while (k < points.length - 2 && i > points[k + 1][0]) k++;
    const [x0, y0, z0 = defaultNoise] = points[k];
    const [x1, y1, z1 = defaultNoise] = points[k + 1];
    const t = x1 === x0 ? 0 : (i - x0) / (x1 - x0);
    const e = (1 - Math.cos(Math.PI * t)) / 2;
    const noise = (z0 + (z1 - z0) * t) * (r() - 0.5) * 2;
    out.push(y0 + (y1 - y0) * e + noise);
  }
  return out;
}

/** 종가열 → 캔들(시가 = 직전 종가, 꼬리는 고정 시드) */
export function toCandles(closes: number[], wick = 0.8, seed = 7): Candle[] {
  const r = rng(seed);
  return closes.map((c, i) => {
    const o = i === 0 ? c : closes[i - 1];
    return { o, c, h: Math.max(o, c) + r() * wick, l: Math.min(o, c) - r() * wick };
  });
}

/** 거래량 — 기본값 × 잡음, spikes 인덱스는 배수 */
export function volumes(n: number, base: number, spikes: Record<number, number> = {}, seed = 11): number[] {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => base * (0.6 + r() * 0.8) * (spikes[i] ?? 1));
}

// ───────────────────────── 피보나치 ─────────────────────────

/** 되돌림 비율 — 0%=고점(상승 기준), 100%=저점. 50%는 피보나치 수열 비율은 아니지만 관행적으로 함께 쓴다 */
export const FIB_RETRACE = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
/** 확장 비율 — 1.272(=√1.618)·1.618(황금비)이 가장 많이 쓰인다 */
export const FIB_EXTEND = [1, 1.272, 1.618] as const;
/** 골든 포켓 — 0.618~0.65 되돌림 구간 */
export const GOLDEN_POCKET: [number, number] = [0.618, 0.65];

/**
 * 상승 구간(저점 low → 고점 high)의 되돌림 가격. 가격 = 고점 − 비율 × (고점 − 저점).
 * 하락 구간이면 반대로: 가격 = 저점 + 비율 × (고점 − 저점).
 */
export function fibRetracement(low: number, high: number, dir: 'up' | 'down' = 'up'): { ratio: number; price: number }[] {
  const range = high - low;
  return FIB_RETRACE.map((ratio) => ({ ratio, price: dir === 'up' ? high - ratio * range : low + ratio * range }));
}

/** 3점 추세 확장(A→B 움직임을 C에서 다시 투영). 상승: 가격 = C + 비율 × (B − A) */
export function fibExtension(a: number, b: number, c: number): { ratio: number; price: number }[] {
  return FIB_EXTEND.map((ratio) => ({ ratio, price: c + ratio * (b - a) }));
}

// ───────────────────────── 보조 계산 ─────────────────────────

/** a 가 b 를 위로(golden)/아래로(dead) 뚫은 인덱스 */
export function crossings(a: (number | null)[], b: (number | null)[]): { i: number; kind: 'golden' | 'dead' }[] {
  const out: { i: number; kind: 'golden' | 'dead' }[] = [];
  for (let i = 1; i < a.length; i++) {
    const a0 = a[i - 1], b0 = b[i - 1], a1 = a[i], b1 = b[i];
    if (a0 == null || b0 == null || a1 == null || b1 == null) continue;
    if (a0 <= b0 && a1 > b1) out.push({ i, kind: 'golden' });
    else if (a0 >= b0 && a1 < b1) out.push({ i, kind: 'dead' });
  }
  return out;
}

/** 구간 [from, to] 에서 최댓값 인덱스 */
export function argMax(arr: (number | null)[], from: number, to: number): number {
  let best = from;
  for (let i = from; i <= to; i++) if ((arr[i] ?? -Infinity) > (arr[best] ?? -Infinity)) best = i;
  return best;
}
export function argMin(arr: (number | null)[], from: number, to: number): number {
  let best = from;
  for (let i = from; i <= to; i++) if ((arr[i] ?? Infinity) < (arr[best] ?? Infinity)) best = i;
  return best;
}

// ───────────────────────── 그림별 데이터셋 ─────────────────────────

/** 추세 + 저항→지지 역할 전환: 118 에서 두 번 막힌 뒤 돌파, 되돌아와 118 에서 지지 */
export function dsTrend() {
  const closes = pathSeries([[0, 100], [10, 111], [16, 105], [25, 117.4], [31, 109], [39, 117.6], [44, 112], [53, 128], [58, 118.6], [66, 134]], 3, 0.7);
  return { closes, candles: toCandles(closes, 0.9, 5), level: 118 };
}

/** 이동평균 교차: 상승 → 하락(데드크로스) → 재상승(골든크로스). 20일·60일선 */
export function dsMovingAverage() {
  const closes = pathSeries([[0, 100], [45, 128], [100, 92], [160, 132]], 4, 1.4);
  const ma20 = calcMA(closes, 20);
  const ma60 = calcMA(closes, 60);
  return { closes, candles: toCandles(closes, 1.1, 9), ma20, ma60, crosses: crossings(ma20, ma60), from: 59 };
}

/** 거래량: 박스권에서 거래량 없는 가짜 돌파(18) → 복귀, 거래량 실린 진짜 돌파(36) */
export function dsVolume() {
  const closes = pathSeries([[0, 103, 1], [14, 107, 1], [18, 111.2, 0.4], [22, 105, 1], [33, 107, 1], [36, 112.5, 0.5], [50, 121, 1]], 6, 1);
  const vol = volumes(closes.length, 100, { 18: 0.7, 36: 3.4, 37: 2.6, 38: 1.9 }, 13);
  return { closes, candles: toCandles(closes, 0.7, 8), vol, top: 110, bottom: 101.5, fakeAt: 18, breakAt: 36 };
}

/** RSI·MACD 공용: 급등(과매수) → 급락(과매도) → 회복 */
export function dsCycle() {
  const closes = pathSeries([[0, 100, 0.8], [20, 101, 0.8], [36, 128, 0.6], [46, 120, 0.8], [62, 96, 0.6], [74, 104, 0.8], [96, 118, 0.8]], 8, 0.8);
  return { closes, candles: toCandles(closes, 0.9, 10), rsi: calcRSI(closes, 14), macd: calcMACD(closes), from: 26 };
}

/** 볼린저: 좁은 박스(스퀴즈) → 상방 확장, 상단 밴드 타고 오르기 */
export function dsBollinger() {
  const closes = pathSeries([[0, 104, 2.2], [18, 100, 2], [24, 101, 0.35], [50, 101.5, 0.3], [56, 106, 0.6], [80, 124, 0.8]], 12, 1);
  const bb = calcBB(closes, 20, 2);
  return { closes, candles: toCandles(closes, 0.6, 12), bb, from: 19, squeeze: [26, 50] as [number, number] };
}

/** 하락 다이버전스: 가격은 고점을 높이는데(1차 급등 → 2차 완만) RSI 고점은 낮아짐 */
export function dsDivergence() {
  const closes = pathSeries([[0, 100, 0.8], [20, 100, 0.8], [32, 130, 0.3], [40, 120, 0.6], [58, 133, 0.3], [72, 114, 0.7]], 14, 0.6);
  const rsi = calcRSI(closes, 14);
  const p1 = argMax(closes, 26, 38);
  const p2 = argMax(closes, 50, 64);
  return { closes, candles: toCandles(closes, 0.8, 15), rsi, p1, p2, from: 14 };
}

/** 피보나치: 저점 100(A) → 고점 160(B) → 61.8% 근처(C≈122.9)까지 되돌림 → 확장 1.272 근처까지 재상승 */
export function dsFibonacci() {
  const low = 100, high = 160;
  const c = high - 0.618 * (high - low); // 122.92
  const closes = pathSeries([[0, 109], [8, low, 0.2], [38, high, 0.3], [52, c + 0.6, 0.3], [82, 198.5, 0.5], [92, 190]], 21, 1.1);
  closes[8] = low; closes[38] = high;   // 스윙 지점은 정확히(그리는 기준점)
  closes[52] = c + 0.4;
  return { closes, candles: toCandles(closes, 1.2, 22), low, high, c, ia: 8, ib: 38, ic: 52 };
}

/** 차트 패턴(종가선만) */
export function dsPatterns() {
  return {
    doubleTop: pathSeries([[0, 100], [12, 120], [20, 110], [30, 120.4], [42, 98]], 31, 0.5),
    headShoulders: pathSeries([[0, 100], [8, 114], [14, 108], [22, 124], [30, 108.4], [38, 114.5], [48, 96]], 32, 0.5),
    triangle: pathSeries([[0, 100], [8, 120], [14, 104], [20, 119.6], [26, 108], [31, 119.8], [35, 112], [38, 120], [46, 133]], 33, 0.4),
  };
}
