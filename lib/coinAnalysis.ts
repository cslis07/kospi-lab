/**
 * 코인 선물 단타 분석 엔진
 *
 * 방법론 출처(사용자 제공 교육자료 3종 요약):
 *  - 순서 고정: 1H 큰 방향 → 15m 구조·지지저항 → 5m 진입 타이밍
 *  - 이동평균(EMA 20/60/200)·VWAP은 "진입 신호"가 아니라 방향 필터
 *  - 거래량 미동반 돌파는 신뢰 금지, 돌파-리테스트-반응 순서 확인
 *  - RSI는 30/70 역매매 금지 — 추세 내 40~50(롱)/50~60(숏) 눌림 확인용
 *  - 손절폭은 ATR 1~1.5배 이상 + 구조상 무효화 지점, 레버리지는 증거금 효율 변수
 *  - 포지션 노션 = 시드 × 1회 허용손실률 ÷ 손절거리
 *  - 피보나치 되돌림 38.2/50/61.8 = 관찰 구간(단독 신호 아님), 확장 127.2/161.8 = 익절 후보
 *  - 펀딩 직전 5~10분·이벤트 구간 회피, 과도한 펀딩 쏠림은 체제 신호
 */

/* ── 타입 ─────────────────────────────────────────────── */
export interface Candle {
  ts: number; o: number; h: number; l: number; c: number; v: number; qv: number;
}

export interface TimeframeAnalysis {
  tf: string;
  close: number;
  ema20: number; ema60: number; ema200: number | null;
  vwap: number | null;
  rsi: number;
  macd: { line: number; signal: number; hist: number; histSlope: number };
  bb: { upper: number; mid: number; lower: number; bandwidth: number; squeeze: boolean };
  atr: number; atrPct: number;
  volumeRatio: number;           // 마지막 봉 거래량 / 20봉 평균
  structure: '상승' | '하락' | '횡보';
  emaAlign: '정배열' | '역배열' | '혼조';
  priceVsEma20: 'above' | 'below';
  priceVsVwap: 'above' | 'below' | null;
  lastCandle: {
    longLowerWick: boolean; longUpperWick: boolean;
    strongBull: boolean; strongBear: boolean;
    microBreakUp: boolean; microBreakDown: boolean;
  };
}

export interface SRZone { price: number; touches: number; kind: 'support' | 'resistance' }

export interface FibLevels {
  direction: 'up' | 'down';        // 마지막 주요 스윙 방향
  swingLow: number; swingHigh: number;
  r382: number; r50: number; r618: number;
  e1272: number; e1618: number;
  nearest: string | null;          // 현재가가 관찰 구간(±0.4%) 안이면 그 라벨
}

export type TfTrend = 'up' | 'down' | 'flat';

export interface Verdict {
  state: string;
  score: number;                    // -100(숏 강) ~ +100(롱 강)
  direction: 'long' | 'short' | 'wait';
  entryOk: boolean;
  entryNote: string;
  leverage: { conservative: number; aggressive: number; max: number; note: string };
  entry: number; stop: number; stopPct: number;
  target1: number; target2: number; rr: number;
  reasons: string[];
  warnings: string[];
  checklist: { label: string; pass: boolean; note: string }[];
  /** 상위 타임프레임(4H·1D) 레짐. htf 미제공 시 null */
  regime: { h4: TfTrend; d1: TfTrend; label: string; aligned: boolean | null } | null;
  /** 진입 자리 품질 — 목표까지 방해물(반대 S/R) 없이 확보된 여유 */
  entryQuality: { roomPct: number; rrToObstacle: number; roomOk: boolean; obstacle: number | null };
}

function trendKo(t: TfTrend): string {
  return t === 'up' ? '상승' : t === 'down' ? '하락' : '횡보';
}

/** 한 타임프레임을 상승/하락/횡보로 요약 (레짐 필터용) */
export function tfTrend(tf: TimeframeAnalysis): TfTrend {
  const above200 = tf.ema200 === null ? null : tf.close >= tf.ema200;
  if (tf.emaAlign === '정배열' && tf.priceVsEma20 === 'above' && above200 !== false) return 'up';
  if (tf.emaAlign === '역배열' && tf.priceVsEma20 === 'below' && above200 !== true) return 'down';
  return 'flat';
}

/* ── 기본 지표 ────────────────────────────────────────── */
export function emaSeries(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / Math.min(period, values.length);
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgG = gain / period, avgL = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}

function macdCalc(closes: number[]) {
  const e12 = emaSeries(closes, 12);
  const e26 = emaSeries(closes, 26);
  const line = closes.map((_, i) => e12[i] - e26[i]);
  const signal = emaSeries(line, 9);
  const hist = line.map((v, i) => v - signal[i]);
  const n = hist.length;
  const histSlope = n >= 4 ? hist[n - 1] - hist[n - 4] : 0;
  return { line: line[n - 1], signal: signal[n - 1], hist: hist[n - 1], histSlope };
}

function bollinger(closes: number[], period = 20, mult = 2) {
  const bandwidths: number[] = [];
  let upper = 0, mid = 0, lower = 0;
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const m = slice.reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(slice.reduce((a, b) => a + (b - m) ** 2, 0) / period);
    const u = m + mult * sd, l = m - mult * sd;
    bandwidths.push(m > 0 ? (u - l) / m : 0);
    if (i === closes.length - 1) { upper = u; mid = m; lower = l; }
  }
  const bw = bandwidths[bandwidths.length - 1] ?? 0;
  // 문서: 밴드폭이 최근 평균의 하위 20% 수준이면 압축(돌파 대기)
  const recent = bandwidths.slice(-100);
  const sorted = [...recent].sort((a, b) => a - b);
  const p20 = sorted[Math.floor(sorted.length * 0.2)] ?? 0;
  return { upper, mid, lower, bandwidth: bw, squeeze: bw <= p20 && bw > 0 };
}

export function atr(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    trs.push(Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c)));
  }
  let a = trs.slice(0, period).reduce((x, y) => x + y, 0) / period;
  for (let i = period; i < trs.length; i++) a = (a * (period - 1) + trs[i]) / period;
  return a;
}

/** 당일(UTC 00:00 앵커) VWAP */
function vwapCalc(candles: Candle[]): number | null {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const todays = candles.filter((c) => c.ts >= dayStart.getTime());
  if (todays.length < 3) return null;
  let pv = 0, vol = 0;
  for (const c of todays) {
    const typical = (c.h + c.l + c.c) / 3;
    pv += typical * c.v; vol += c.v;
  }
  return vol > 0 ? pv / vol : null;
}

/* ── 스윙·구조·지지저항·피보나치 ─────────────────────── */
interface Swing { idx: number; price: number; kind: 'high' | 'low' }

function findSwings(candles: Candle[], k = 3): Swing[] {
  const out: Swing[] = [];
  for (let i = k; i < candles.length - k; i++) {
    let isH = true, isL = true;
    for (let j = 1; j <= k; j++) {
      if (candles[i].h < candles[i - j].h || candles[i].h < candles[i + j].h) isH = false;
      if (candles[i].l > candles[i - j].l || candles[i].l > candles[i + j].l) isL = false;
    }
    if (isH) out.push({ idx: i, price: candles[i].h, kind: 'high' });
    if (isL) out.push({ idx: i, price: candles[i].l, kind: 'low' });
  }
  return out;
}

/** HH/HL vs LH/LL 시장구조 */
function classifyStructure(swings: Swing[]): '상승' | '하락' | '횡보' {
  const highs = swings.filter((s) => s.kind === 'high').slice(-3);
  const lows  = swings.filter((s) => s.kind === 'low').slice(-3);
  if (highs.length < 2 || lows.length < 2) return '횡보';
  const hh = highs[highs.length - 1].price > highs[highs.length - 2].price;
  const hl = lows[lows.length - 1].price  > lows[lows.length - 2].price;
  const lh = highs[highs.length - 1].price < highs[highs.length - 2].price;
  const ll = lows[lows.length - 1].price  < lows[lows.length - 2].price;
  if (hh && hl) return '상승';
  if (lh && ll) return '하락';
  return '횡보';
}

/** 스윙 클러스터링 → 지지/저항 구간(터치 수 포함) */
export function srZones(candles: Candle[], price: number, atrVal: number): SRZone[] {
  const swings = findSwings(candles, 3);
  const tol = Math.max(atrVal * 0.6, price * 0.0015);
  const clusters: { sum: number; n: number }[] = [];
  for (const s of swings) {
    const hit = clusters.find((c) => Math.abs(c.sum / c.n - s.price) <= tol);
    if (hit) { hit.sum += s.price; hit.n += 1; }
    else clusters.push({ sum: s.price, n: 1 });
  }
  return clusters
    .filter((c) => c.n >= 2)
    .map((c) => {
      const p = c.sum / c.n;
      return { price: p, touches: c.n, kind: (p <= price ? 'support' : 'resistance') as SRZone['kind'] };
    })
    .sort((a, b) => b.touches - a.touches)
    .slice(0, 8)
    .sort((a, b) => b.price - a.price);
}

/** 마지막 주요 스윙 기준 피보나치 되돌림·확장 */
export function fibonacci(candles: Candle[], price: number): FibLevels | null {
  const swings = findSwings(candles, 4);
  if (swings.length < 2) return null;
  // 최근 스윙 고점·저점 중 더 최근 것이 방향 결정
  const lastHigh = [...swings].reverse().find((s) => s.kind === 'high');
  const lastLow  = [...swings].reverse().find((s) => s.kind === 'low');
  if (!lastHigh || !lastLow) return null;
  const direction: 'up' | 'down' = lastHigh.idx > lastLow.idx ? 'up' : 'down';
  const hi = Math.max(lastHigh.price, lastLow.price);
  const lo = Math.min(lastHigh.price, lastLow.price);
  const range = hi - lo;
  if (range <= 0) return null;

  let r382: number, r50: number, r618: number, e1272: number, e1618: number;
  if (direction === 'up') {
    // 상승 스윙: 저점→고점, 눌림 구간 확인
    r382 = hi - range * 0.382; r50 = hi - range * 0.5; r618 = hi - range * 0.618;
    e1272 = lo + range * 1.272; e1618 = lo + range * 1.618;
  } else {
    // 하락 스윙: 고점→저점, 반등 구간 확인
    r382 = lo + range * 0.382; r50 = lo + range * 0.5; r618 = lo + range * 0.618;
    e1272 = hi - range * 1.272; e1618 = hi - range * 1.618;
  }
  const tol = price * 0.004;
  let nearest: string | null = null;
  if (Math.abs(price - r382) <= tol) nearest = '38.2% 되돌림';
  else if (Math.abs(price - r50) <= tol) nearest = '50% 되돌림';
  else if (Math.abs(price - r618) <= tol) nearest = '61.8% 되돌림';
  return { direction, swingLow: lo, swingHigh: hi, r382, r50, r618, e1272, e1618, nearest };
}

/* ── RSI 다이버전스 (15m 권장) ───────────────────────── */
function rsiSeries(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(50);
  if (closes.length < period + 1) return out;
  let avgG = 0, avgL = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) avgG += d; else avgL -= d;
  }
  avgG /= period; avgL /= period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

/**
 * RSI 다이버전스: 가격 저점 하락 + RSI 저점 상승 = bullish / 반대 = bearish
 * 최근 두 스윙 저점(또는 고점) 비교. 큰 지지·저항 근처에서만 참고(교육자료 원칙).
 */
export function detectRsiDivergence(candles: Candle[]): 'bullish' | 'bearish' | null {
  if (candles.length < 40) return null;
  const closes = candles.map((c) => c.c);
  const rsis = rsiSeries(closes);
  const swings = findSwings(candles, 3).filter((s) => s.idx >= 14 && s.idx < candles.length - 1);
  const lows  = swings.filter((s) => s.kind === 'low').slice(-2);
  const highs = swings.filter((s) => s.kind === 'high').slice(-2);
  if (lows.length === 2) {
    const [a, b] = lows;
    if (b.price < a.price && rsis[b.idx] > rsis[a.idx] + 2 && rsis[b.idx] < 45) return 'bullish';
  }
  if (highs.length === 2) {
    const [a, b] = highs;
    if (b.price > a.price && rsis[b.idx] < rsis[a.idx] - 2 && rsis[b.idx] > 55) return 'bearish';
  }
  return null;
}

/* ── 최근 급변 캔들 이벤트 (청산 연쇄·돌파 추정용) ────── */
export interface CandleEvent { ts: number; kind: '급등' | '급락'; rangePct: number; volRatio: number }

export function recentBigCandles(candles: Candle[], lookback = 12): CandleEvent[] {
  const n = candles.length;
  if (n < 30) return [];
  const atrVal = atr(candles);
  const vols = candles.map((c) => c.v);
  const avgVol = vols.slice(-31, -1).reduce((a, b) => a + b, 0) / 30;
  const out: CandleEvent[] = [];
  for (let i = Math.max(0, n - lookback); i < n; i++) {
    const c = candles[i];
    const range = c.h - c.l;
    if (atrVal > 0 && range >= atrVal * 2.2) {
      out.push({
        ts: c.ts,
        kind: c.c >= c.o ? '급등' : '급락',
        rangePct: c.c > 0 ? (range / c.c) * 100 : 0,
        volRatio: avgVol > 0 ? c.v / avgVol : 1,
      });
    }
  }
  return out.slice(-3);
}

/* ── 타임프레임 분석 ─────────────────────────────────── */
export function analyzeTimeframe(tf: string, candles: Candle[]): TimeframeAnalysis {
  const closes = candles.map((c) => c.c);
  const n = closes.length;
  const close = closes[n - 1];
  const e20 = emaSeries(closes, 20)[n - 1];
  const e60 = emaSeries(closes, 60)[n - 1];
  const e200 = n >= 200 ? emaSeries(closes, 200)[n - 1] : null;
  const vwap = vwapCalc(candles);
  const atrVal = atr(candles);
  const vols = candles.map((c) => c.v);
  const avgVol = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  const swings = findSwings(candles, 3);

  // 마지막 확정 봉(진행 중 봉 제외)의 캔들 반응
  const lc = candles[n - 2];
  const range = lc.h - lc.l || 1e-9;
  const body = Math.abs(lc.c - lc.o);
  const lowerWick = Math.min(lc.o, lc.c) - lc.l;
  const upperWick = lc.h - Math.max(lc.o, lc.c);
  const prevHighs = Math.max(...candles.slice(n - 6, n - 2).map((c) => c.h));
  const prevLows  = Math.min(...candles.slice(n - 6, n - 2).map((c) => c.l));

  return {
    tf, close,
    ema20: e20, ema60: e60, ema200: e200, vwap,
    rsi: rsi(closes),
    macd: macdCalc(closes),
    bb: bollinger(closes),
    atr: atrVal, atrPct: close > 0 ? (atrVal / close) * 100 : 0,
    volumeRatio: avgVol > 0 ? vols[n - 2] / avgVol : 1,
    structure: classifyStructure(swings),
    emaAlign: e20 > e60 ? '정배열' : e20 < e60 ? '역배열' : '혼조',
    priceVsEma20: close >= e20 ? 'above' : 'below',
    priceVsVwap: vwap === null ? null : close >= vwap ? 'above' : 'below',
    lastCandle: {
      longLowerWick: lowerWick / range > 0.5,
      longUpperWick: upperWick / range > 0.5,
      strongBull: body / range > 0.65 && lc.c > lc.o,
      strongBear: body / range > 0.65 && lc.c < lc.o,
      microBreakUp: lc.c > prevHighs,
      microBreakDown: lc.c < prevLows,
    },
  };
}

/* ── 종합 판단 (룰 엔진) ─────────────────────────────── */
/** 추가 수급·이벤트 신호 (모두 선택적 — 백테스트에서는 생략) */
export interface VerdictExtras {
  /** 최근 30분 테이커 매수/매도 비율 (1보다 크면 매수 우위) */
  takerRatio?: number | null;
  /** 가격-주문흐름 다이버전스 */
  takerDivergence?: 'bullish' | 'bearish' | null;
  /** OI 1시간 변화율(%) — 가격 방향과 조합해 4분면 해석 */
  oiChange1hPct?: number | null;
  priceChange1hPct?: number | null;
  /** 포지션 금액 기준 롱숏 비율 (계정 수 기준과의 격차 = 큰손 vs 개미) */
  positionRatio?: number | null;
  /** 임박한 고중요도 경제 이벤트 */
  event?: { title: string; hoursUntil: number } | null;
  /** 상위 타임프레임 분석 (레짐 필터용). 백테스트에서는 생략 */
  htf?: { h4: TimeframeAnalysis | null; d1: TimeframeAnalysis | null } | null;
}

export function buildVerdict(
  h1: TimeframeAnalysis, m15: TimeframeAnalysis, m5: TimeframeAnalysis,
  fundingRate: number, nextFundingTs: number | null,
  fib: FibLevels | null, zones: SRZone[],
  longShortRatio: number | null = null,
  extras: VerdictExtras = {},
): Verdict {
  const price = m5.close;
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  /* 1) 1H 방향 필터 (가장 큰 가중치) */
  if (h1.emaAlign === '정배열' && h1.priceVsEma20 === 'above') {
    score += 25; reasons.push('1H: EMA20>EMA60 정배열 + 가격이 EMA20 위 → 상승 바이어스');
  } else if (h1.emaAlign === '역배열' && h1.priceVsEma20 === 'below') {
    score -= 25; reasons.push('1H: EMA20<EMA60 역배열 + 가격이 EMA20 아래 → 하락 바이어스');
  } else {
    reasons.push('1H: EMA 혼조 — 큰 방향 불명확');
  }
  if (h1.structure === '상승') { score += 10; reasons.push('1H 시장구조: 고점·저점 동반 상승(HH·HL)'); }
  else if (h1.structure === '하락') { score -= 10; reasons.push('1H 시장구조: 고점·저점 동반 하락(LH·LL)'); }

  /* 2) 15m 구조 확인 */
  if (m15.priceVsEma20 === 'above') score += 8; else score -= 8;
  if (m15.structure === '상승') score += 8; else if (m15.structure === '하락') score -= 8;
  if (m15.priceVsVwap === 'above') { score += 6; reasons.push('15m: 가격이 당일 VWAP 위(매수 우위 세션)'); }
  else if (m15.priceVsVwap === 'below') { score -= 6; reasons.push('15m: 가격이 당일 VWAP 아래(매도 우위 세션)'); }

  // RSI: 문서 규칙 — 상승장 40~50 눌림 반등 / 하락장 50~60 반등 실패 확인
  if (score > 0 && m15.rsi >= 38 && m15.rsi <= 55) {
    score += 6; reasons.push(`15m RSI ${m15.rsi.toFixed(0)} — 상승 추세 내 건전한 눌림 구간`);
  } else if (score < 0 && m15.rsi >= 45 && m15.rsi <= 62) {
    score -= 6; reasons.push(`15m RSI ${m15.rsi.toFixed(0)} — 하락 추세 내 반등 저항 구간`);
  } else if (m15.rsi >= 72) {
    score -= 4; warnings.push(`15m RSI ${m15.rsi.toFixed(0)} 과열 — 상단 추격 매수 금지`);
  } else if (m15.rsi <= 28) {
    score += 4; warnings.push(`15m RSI ${m15.rsi.toFixed(0)} 침체 — 하단 추격 매도 금지`);
  }

  // MACD 히스토그램 방향
  if (m15.macd.hist > 0 && m15.macd.histSlope > 0) { score += 6; reasons.push('15m MACD 히스토그램 양(+)·확장 중'); }
  else if (m15.macd.hist < 0 && m15.macd.histSlope < 0) { score -= 6; reasons.push('15m MACD 히스토그램 음(-)·확장 중'); }
  else if (Math.abs(m15.macd.histSlope) > 0 && Math.sign(m15.macd.histSlope) !== Math.sign(m15.macd.hist)) {
    warnings.push('15m MACD 모멘텀 둔화 — 추세 감속 주의');
  }

  /* 3) 5m 진입 트리거 */
  let trigger = false;
  if (score > 0) {
    if (m5.lastCandle.longLowerWick) { score += 7; trigger = true; reasons.push('5m: 긴 아래꼬리 — 눌림에서 매수세 유입'); }
    if (m5.lastCandle.microBreakUp)  { score += 8; trigger = true; reasons.push('5m: 직전 4봉 고점 종가 돌파'); }
    if (m5.lastCandle.strongBull)    { score += 4; trigger = true; }
  } else if (score < 0) {
    if (m5.lastCandle.longUpperWick)  { score -= 7; trigger = true; reasons.push('5m: 긴 윗꼬리 — 반등에서 매도세 유입'); }
    if (m5.lastCandle.microBreakDown) { score -= 8; trigger = true; reasons.push('5m: 직전 4봉 저점 종가 이탈'); }
    if (m5.lastCandle.strongBear)     { score -= 4; trigger = true; }
  }
  if (m5.volumeRatio >= 1.5) {
    score += Math.sign(score) * 8;
    reasons.push(`5m 거래량 평균 대비 ${m5.volumeRatio.toFixed(1)}배 — 움직임에 참여자 동반`);
  } else if (trigger && m5.volumeRatio < 0.8) {
    warnings.push('5m 트리거에 거래량 미동반 — 가짜 신호 가능성, 확인 후 진입');
    score -= Math.sign(score) * 5;
  }

  /* 4) 피보나치 관찰 구간 */
  if (fib?.nearest) {
    const aligned = (fib.direction === 'up' && score > 0) || (fib.direction === 'down' && score < 0);
    if (aligned) {
      score += Math.sign(score) * 5;
      reasons.push(`피보나치 ${fib.nearest} 구간 반응 관찰 중 (${fib.direction === 'up' ? '눌림 매수' : '반등 매도'} 후보)`);
    } else {
      warnings.push(`피보나치 ${fib.nearest} 구간 — 추세 방향과 어긋나 관망 권장`);
    }
  }

  /* 5) 펀딩비 체제 신호 */
  const fPct = fundingRate * 100;
  if (Math.abs(fPct) >= 0.05) {
    warnings.push(`펀딩비 ${fPct.toFixed(3)}% — ${fPct > 0 ? '롱' : '숏'} 쏠림 과열, 스퀴즈 반전 주의`);
    score -= Math.sign(fPct) * 5;
  }
  const minToFunding = nextFundingTs ? (nextFundingTs - Date.now()) / 60000 : null;
  const nearFunding = minToFunding !== null && minToFunding >= 0 && minToFunding <= 10;
  if (nearFunding) warnings.push(`다음 펀딩까지 ${Math.round(minToFunding!)}분 — 펀딩 직전 5~10분 진입 회피 구간`);

  /* 5-1) 롱숏 계정 비율 — 과도한 쏠림은 역방향 스퀴즈 위험(문서: OI·펀딩 쏠림 체제 신호) */
  if (longShortRatio !== null) {
    if (longShortRatio >= 2.0) {
      warnings.push(`롱숏 계정 비율 ${longShortRatio.toFixed(2)} — 롱 과밀, 하락 스퀴즈(롱 청산) 위험`);
      if (score > 0) { score -= 6; reasons.push('롱 쏠림 과열 — 추격 롱 신중'); }
    } else if (longShortRatio <= 0.6) {
      warnings.push(`롱숏 계정 비율 ${longShortRatio.toFixed(2)} — 숏 과밀, 상승 스퀴즈(숏 청산) 위험`);
      if (score < 0) { score += 6; reasons.push('숏 쏠림 과열 — 추격 숏 신중'); }
    }
  }

  /* 5-2) 테이커 매수/매도 불균형 (주문 흐름 — 단기 예측력 연구 근거) */
  if (extras.takerRatio !== null && extras.takerRatio !== undefined) {
    if (extras.takerRatio >= 1.4) {
      score += 6; reasons.push(`테이커 매수/매도 ${extras.takerRatio.toFixed(2)} — 공격적 매수세 우위(최근 30분)`);
    } else if (extras.takerRatio <= 0.7) {
      score -= 6; reasons.push(`테이커 매수/매도 ${extras.takerRatio.toFixed(2)} — 공격적 매도세 우위(최근 30분)`);
    }
  }
  if (extras.takerDivergence === 'bearish') {
    score -= 7; warnings.push('가격은 오르는데 공격적 매수 감소 — 주문흐름 다이버전스, 상승 동력 약화');
  } else if (extras.takerDivergence === 'bullish') {
    score += 7; warnings.push('가격은 내리는데 공격적 매도 감소 — 매도세 소진, 반등 가능');
  }

  /* 5-3) OI 4분면 해석 (가격 × 미결제약정 변화) */
  if (extras.oiChange1hPct !== null && extras.oiChange1hPct !== undefined &&
      extras.priceChange1hPct !== null && extras.priceChange1hPct !== undefined &&
      Math.abs(extras.oiChange1hPct) >= 0.3 && Math.abs(extras.priceChange1hPct) >= 0.15) {
    const oiUp = extras.oiChange1hPct > 0, pUp = extras.priceChange1hPct > 0;
    if (pUp && oiUp)        { score += 6; reasons.push(`가격↑ + OI ${extras.oiChange1hPct.toFixed(1)}%↑ — 신규 롱 유입, 상승 신뢰도 높음`); }
    else if (pUp && !oiUp)  { score -= 4; warnings.push(`가격↑ + OI ${extras.oiChange1hPct.toFixed(1)}%↓ — 숏커버 랠리, 연료 부족 주의`); }
    else if (!pUp && oiUp)  { score -= 6; reasons.push(`가격↓ + OI ${Math.abs(extras.oiChange1hPct).toFixed(1)}%↑ — 신규 숏 유입, 하락 신뢰도 높음`); }
    else                    { score += 4; warnings.push(`가격↓ + OI ${Math.abs(extras.oiChange1hPct).toFixed(1)}%↓ — 롱 청산성 하락, 소진 후 반등 여지`); }
  }

  /* 5-4) 큰손 vs 개미 포지셔닝 격차 */
  if (extras.positionRatio !== null && extras.positionRatio !== undefined && longShortRatio !== null) {
    const gap = longShortRatio - extras.positionRatio;
    if (gap >= 0.5) {
      warnings.push(`개미 계정은 롱 쏠림(${longShortRatio.toFixed(2)})인데 포지션 금액은 ${extras.positionRatio.toFixed(2)} — 큰손 중립/숏, 하락 시 개미 롱 청산 연료`);
      score -= 4;
    } else if (gap <= -0.5) {
      warnings.push(`개미 계정은 숏 쏠림(${longShortRatio.toFixed(2)})인데 포지션 금액은 ${extras.positionRatio.toFixed(2)} — 큰손 롱 우위, 상승 스퀴즈 여지`);
      score += 4;
    }
  }

  /* 5-5) 경제 이벤트 임박 */
  const eventBlock = !!extras.event && extras.event.hoursUntil <= 12;
  if (extras.event) {
    warnings.push(`⚠ ${extras.event.title} ${extras.event.hoursUntil <= 0 ? '오늘' : `약 ${Math.round(extras.event.hoursUntil)}시간 후`} — 이벤트 변동성 구간, 신규 진입 금지(교육자료 원칙)`);
  }

  /* 5-6) 상위 타임프레임 레짐 필터 (4H·1D) — 큰 흐름 역행 진입 방지 */
  let regime: Verdict['regime'] = null;
  let counterTrend = false; // 상위 추세를 정면으로 거스르는 진입
  if (extras.htf?.h4 || extras.htf?.d1) {
    const h4t: TfTrend = extras.htf.h4 ? tfTrend(extras.htf.h4) : 'flat';
    const d1t: TfTrend = extras.htf.d1 ? tfTrend(extras.htf.d1) : 'flat';
    // 상위 바이어스: 1D를 더 무겁게. 둘 다 같은 방향이면 강함, 하나만이면 약함
    const bias: TfTrend =
      d1t === h4t && d1t !== 'flat' ? d1t
      : d1t !== 'flat' ? d1t
      : h4t;
    const label = `4H ${trendKo(h4t)} · 1D ${trendKo(d1t)}`;
    const dirSign = Math.sign(score);
    let aligned: boolean | null = null;
    if (bias !== 'flat' && dirSign !== 0) {
      const biasSign = bias === 'up' ? 1 : -1;
      aligned = biasSign === dirSign;
      const strong = d1t === h4t && d1t !== 'flat'; // 4H·1D 동시 정렬
      if (aligned) {
        score += dirSign * (strong ? 8 : 4);
        reasons.push(`상위 추세 정렬(${label}) — ${strong ? '4H·1D 동반' : '상위 지지'}, 결 방향 진입`);
      } else {
        counterTrend = true;
        score -= dirSign * (strong ? 14 : 8);
        warnings.push(`역추세 진입(${label}) — 상위 추세를 거스름. ${strong ? '4H·1D 모두 반대, 되돌림 스캘핑만' : '되돌림 한정, 목표 짧게'}`);
      }
    } else {
      reasons.push(`상위 추세 중립(${label}) — 큰 방향 미확정`);
    }
    regime = { h4: h4t, d1: d1t, label, aligned };
  }

  /* 6) 시장 상태 분류 */
  let state: string;
  const trendish = Math.abs(score) >= 30;
  if (m15.bb.squeeze && !trendish) {
    state = '압축(돌파 대기)';
    warnings.push('15m 볼린저 밴드 수축 — 에너지 축적 구간, 첫 돌파 추격 금지·리테스트 확인');
  } else if (h1.structure === '횡보' && m15.structure === '횡보') {
    state = '박스권';
  } else if (score >= 30) state = '상승 추세';
  else if (score <= -30) state = '하락 추세';
  else state = '방향 탐색(혼조)';

  score = Math.max(-100, Math.min(100, Math.round(score)));
  const direction: Verdict['direction'] = score >= 30 ? 'long' : score <= -30 ? 'short' : 'wait';

  /* 7) 손절·익절 (구조 + ATR 기반) */
  const atr15 = m15.atr;
  const supports = zones.filter((z) => z.kind === 'support').map((z) => z.price);
  const resistances = zones.filter((z) => z.kind === 'resistance').map((z) => z.price);
  let stop: number, target1: number, target2: number;
  if (direction === 'short') {
    const structStop = resistances.length ? Math.min(...resistances) : price + atr15 * 1.2;
    stop = Math.max(structStop, price + atr15 * 1.0);
    const risk = stop - price;
    target1 = price - risk;         // 1R
    target2 = price - risk * 1.5;   // 1.5R
    if (fib && fib.direction === 'down' && fib.e1272 < price) target2 = Math.max(target2, fib.e1272);
  } else {
    const structStop = supports.length ? Math.max(...supports) : price - atr15 * 1.2;
    stop = Math.min(structStop, price - atr15 * 1.0);
    const risk = price - stop;
    target1 = price + risk;
    target2 = price + risk * 1.5;
    if (fib && fib.direction === 'up' && fib.e1272 > price) target2 = Math.min(Math.max(target2, target1), fib.e1272) === target1 ? target2 : fib.e1272;
  }
  const stopPct = Math.abs((stop - price) / price) * 100;
  const rr = 1.5;

  /* 7-1) 진입 자리 품질 — 진입가와 목표 사이에 반대 S/R(방해물)이 있으면 여유 부족 */
  const risk = Math.abs(price - stop);
  let obstacle: number | null = null;
  if (direction === 'long') {
    const above = resistances.filter((r) => r > price);
    obstacle = above.length ? Math.min(...above) : null;
  } else if (direction === 'short') {
    const below = supports.filter((s) => s < price);
    obstacle = below.length ? Math.max(...below) : null;
  }
  // 방해물까지 확보된 여유를 R로 환산 (없으면 넉넉하다고 봄)
  const roomAbs = obstacle !== null ? Math.abs(obstacle - price) : Infinity;
  const roomPct = obstacle !== null && price > 0 ? (roomAbs / price) * 100 : Infinity;
  const rrToObstacle = risk > 0 ? roomAbs / risk : 0;
  // 최소 1R 여유(=목표1까지 방해물 없이 도달 가능)가 확보돼야 진입 자리로 적합
  const roomOk = rrToObstacle >= 1.0;
  if (direction !== 'wait' && obstacle !== null && !roomOk) {
    warnings.push(`진입가 ${roomPct.toFixed(2)}% ${direction === 'long' ? '위 저항' : '아래 지지'}(${obstacle.toFixed(obstacle < 10 ? 4 : 2)}) — 목표1까지 여유 ${rrToObstacle.toFixed(1)}R뿐, 손익비 불리. 돌파·이탈 확인 후 진입`);
  }
  const entryQuality = { roomPct: isFinite(roomPct) ? roomPct : 999, rrToObstacle: isFinite(rrToObstacle) ? rrToObstacle : 999, roomOk, obstacle };

  /* 8) 진입 가능 판정 (레버리지가 신호 강도를 참조하므로 먼저 계산) */
  const extremeVol = m15.atrPct >= 2.5;
  if (extremeVol) warnings.push(`15m ATR ${m15.atrPct.toFixed(2)}% — 변동성 과대, 포지션 축소 또는 관망`);
  const entryOk = direction !== 'wait' && Math.abs(score) >= 45 && trigger && !nearFunding && !extremeVol && !eventBlock && roomOk && !counterTrend;

  /* 9) 레버리지 — 손절폭(청산 안전) × 변동성 × 신호 강도 3요소 동적 계산 */
  // (a) 청산 안전 상한: 청산거리가 손절폭의 3배 이상 확보되는 배율
  const maxLevByStop = stopPct > 0 ? Math.min(25, Math.floor(100 / (stopPct * 3))) : 2;
  // (b) 변동성 상한: 15m ATR%가 클수록 노이즈 청산 위험이 커진다
  const volCap = m15.atrPct <= 0.4 ? 20 : m15.atrPct <= 0.8 ? 15 : m15.atrPct <= 1.5 ? 10 : m15.atrPct <= 2.5 ? 6 : 3;
  // (c) 신호 강도: 근거가 겹칠수록 상한을 더 쓸 수 있다
  const signalGrade = entryOk && Math.abs(score) >= 60 ? '강' : entryOk ? '중' : '약';
  const signalFactor = signalGrade === '강' ? 1 : signalGrade === '중' ? 0.7 : 0.4;
  const levBase = Math.min(maxLevByStop, volCap);
  const aggressive = Math.max(1, Math.min(20, Math.round(levBase * signalFactor)));
  const conservative = Math.max(1, Math.min(10, Math.ceil(aggressive / 2)));
  const levNote =
    `손절폭 ${stopPct.toFixed(2)}%(청산여유 3배 → 최대 ${maxLevByStop}배) × 15m 변동성 ${m15.atrPct.toFixed(2)}%(상한 ${volCap}배) × 신호 ${signalGrade}. ` +
    `레버리지는 수익 증폭이 아니라 증거금 효율 변수 — 손절 시 잃는 금액은 배율과 무관하게 시드의 1~2% 이내로 설계하세요.`;
  let entryNote: string;
  if (eventBlock && direction !== 'wait') entryNote = `${extras.event!.title} 임박 — 이벤트 통과 후 재평가. 차트보다 변동성 이벤트가 우선입니다.`;
  else if (direction === 'wait') entryNote = '방향 근거 부족 — 관망. 조건 충족까지 기다리는 것도 포지션입니다.';
  else if (!trigger) entryNote = `${direction === 'long' ? '롱' : '숏'} 우위지만 5m 트리거(꼬리·구조 돌파) 미확인 — 확인 후 진입.`;
  else if (nearFunding) entryNote = '펀딩 정산 직전 — 정산 후 재평가 권장.';
  else if (extremeVol) entryNote = '변동성 과대 구간 — 손절이 노이즈에 걸리기 쉬움.';
  else if (counterTrend) entryNote = `상위 추세(${regime?.label}) 역행 — 큰 흐름을 거스르는 진입. 되돌림 스캘핑만, 목표 짧게.`;
  else if (!roomOk) entryNote = `목표1까지 방해물(반대 S/R)이 ${entryQuality.rrToObstacle.toFixed(1)}R 거리 — 손익비 불리. 돌파·이탈 확인 후 진입.`;
  else if (!entryOk) entryNote = '근거 강도 부족(신호 겹침 3개 미만) — 소액 또는 관망.';
  else entryNote = `${direction === 'long' ? '롱' : '숏'} 진입 근거 겹침 확인 — 손절 동시 등록 필수.`;

  /* 10) 매매 전 체크리스트 (문서 14장) */
  const checklist = [
    ...(regime ? [{ label: '상위 추세 정렬(4H·1D)', pass: regime.aligned !== false, note: regime.aligned === null ? `${regime.label} · 중립` : regime.aligned ? `${regime.label} · 결 방향` : `${regime.label} · 역행` }] : []),
    { label: '진입 자리 여유(방해물)', pass: roomOk, note: obstacle === null ? '방해물 없음 · 넉넉' : `목표1까지 ${entryQuality.rrToObstacle.toFixed(1)}R` },
    { label: '1시간봉 방향', pass: h1.emaAlign !== '혼조', note: `${h1.structure} 구조 · EMA ${h1.emaAlign}` },
    { label: '15분봉 지지·저항', pass: zones.length >= 2, note: `주요 구간 ${zones.length}개 식별` },
    { label: 'EMA 기준', pass: direction === 'wait' ? false : (direction === 'long' ? m15.priceVsEma20 === 'above' : m15.priceVsEma20 === 'below'), note: `15m EMA20 ${m15.priceVsEma20 === 'above' ? '위' : '아래'}` },
    { label: '거래량 동반', pass: m5.volumeRatio >= 1.2, note: `5m 평균 대비 ${m5.volumeRatio.toFixed(1)}배` },
    { label: '캔들 반응(트리거)', pass: trigger, note: trigger ? '확인됨' : '미확인' },
    { label: '손절 위치', pass: stopPct <= 1.5, note: `${stopPct.toFixed(2)}% (ATR·구조 기반)` },
    { label: '손익비 1:1.5 이상', pass: true, note: '목표2 기준 1:1.5 설계' },
    { label: '펀딩·이벤트 회피', pass: !nearFunding && !eventBlock, note: eventBlock ? extras.event!.title : minToFunding !== null ? `다음 펀딩 ${Math.max(0, Math.round(minToFunding))}분 후` : '-' },
    { label: '변동성 적정', pass: !extremeVol, note: `15m ATR ${m15.atrPct.toFixed(2)}%` },
  ];

  return {
    state, score, direction, entryOk, entryNote,
    leverage: { conservative, aggressive, max: maxLevByStop, note: levNote },
    entry: price, stop, stopPct, target1, target2, rr,
    reasons, warnings, checklist,
    regime, entryQuality,
  };
}
