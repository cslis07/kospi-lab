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

export interface Verdict {
  state: string;
  score: number;                    // -100(숏 강) ~ +100(롱 강)
  direction: 'long' | 'short' | 'wait';
  entryOk: boolean;
  entryNote: string;
  leverage: { conservative: number; aggressive: number; note: string };
  entry: number; stop: number; stopPct: number;
  target1: number; target2: number; rr: number;
  reasons: string[];
  warnings: string[];
  checklist: { label: string; pass: boolean; note: string }[];
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
export function buildVerdict(
  h1: TimeframeAnalysis, m15: TimeframeAnalysis, m5: TimeframeAnalysis,
  fundingRate: number, nextFundingTs: number | null,
  fib: FibLevels | null, zones: SRZone[],
  longShortRatio: number | null = null,
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

  /* 8) 레버리지 — 청산거리가 손절폭의 3배 이상 확보되도록 */
  const maxLevByStop = stopPct > 0 ? Math.floor(100 / (stopPct * 3)) : 3;
  const conservative = Math.max(1, Math.min(3, maxLevByStop));
  const aggressive   = Math.max(conservative, Math.min(5, maxLevByStop));
  const levNote = `손절폭 ${stopPct.toFixed(2)}% 기준, 청산거리 3배 확보 시 최대 ${Math.min(maxLevByStop, 20)}배. ` +
    `교육자료 권장: 초보 2~3배 이하. 레버리지는 수익 증폭이 아니라 증거금 효율 변수입니다.`;

  /* 9) 진입 가능 판정 */
  const extremeVol = m15.atrPct >= 2.5;
  if (extremeVol) warnings.push(`15m ATR ${m15.atrPct.toFixed(2)}% — 변동성 과대, 포지션 축소 또는 관망`);
  const entryOk = direction !== 'wait' && Math.abs(score) >= 45 && trigger && !nearFunding && !extremeVol;
  let entryNote: string;
  if (direction === 'wait') entryNote = '방향 근거 부족 — 관망. 조건 충족까지 기다리는 것도 포지션입니다.';
  else if (!trigger) entryNote = `${direction === 'long' ? '롱' : '숏'} 우위지만 5m 트리거(꼬리·구조 돌파) 미확인 — 확인 후 진입.`;
  else if (nearFunding) entryNote = '펀딩 정산 직전 — 정산 후 재평가 권장.';
  else if (extremeVol) entryNote = '변동성 과대 구간 — 손절이 노이즈에 걸리기 쉬움.';
  else if (!entryOk) entryNote = '근거 강도 부족(신호 겹침 3개 미만) — 소액 또는 관망.';
  else entryNote = `${direction === 'long' ? '롱' : '숏'} 진입 근거 겹침 확인 — 손절 동시 등록 필수.`;

  /* 10) 매매 전 체크리스트 (문서 14장) */
  const checklist = [
    { label: '1시간봉 방향', pass: h1.emaAlign !== '혼조', note: `${h1.structure} 구조 · EMA ${h1.emaAlign}` },
    { label: '15분봉 지지·저항', pass: zones.length >= 2, note: `주요 구간 ${zones.length}개 식별` },
    { label: 'EMA 기준', pass: direction === 'wait' ? false : (direction === 'long' ? m15.priceVsEma20 === 'above' : m15.priceVsEma20 === 'below'), note: `15m EMA20 ${m15.priceVsEma20 === 'above' ? '위' : '아래'}` },
    { label: '거래량 동반', pass: m5.volumeRatio >= 1.2, note: `5m 평균 대비 ${m5.volumeRatio.toFixed(1)}배` },
    { label: '캔들 반응(트리거)', pass: trigger, note: trigger ? '확인됨' : '미확인' },
    { label: '손절 위치', pass: stopPct <= 1.5, note: `${stopPct.toFixed(2)}% (ATR·구조 기반)` },
    { label: '손익비 1:1.5 이상', pass: true, note: '목표2 기준 1:1.5 설계' },
    { label: '펀딩·이벤트 회피', pass: !nearFunding, note: minToFunding !== null ? `다음 펀딩 ${Math.max(0, Math.round(minToFunding))}분 후` : '-' },
    { label: '변동성 적정', pass: !extremeVol, note: `15m ATR ${m15.atrPct.toFixed(2)}%` },
  ];

  return {
    state, score, direction, entryOk, entryNote,
    leverage: { conservative, aggressive, note: levNote },
    entry: price, stop, stopPct, target1, target2, rr,
    reasons, warnings, checklist,
  };
}
