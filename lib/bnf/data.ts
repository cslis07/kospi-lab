/**
 * BNF형 연구 — 15분봉 데이터 정규화·검증·리샘플(순수 함수, 네트워크 없음). 규격: docs/bnf/STRATEGY.md §2
 * ⚠ 결측은 보간하지 않는다 — 시작부터 연속된 구간만 쓰고 첫 결측 직전에서 멈춘다.
 */

export interface Bar { t: number; o: number; h: number; l: number; c: number; v: number }

export const MIN15 = 900_000;
export const HOUR = 3_600_000;
export const H4 = 14_400_000;
export const DAY = 86_400_000;

export interface Gap { afterT: number; nextT: number; missing: number }
export interface Validation {
  bars: Bar[];
  duplicates: number;            // 같은 값으로 중복된 행(1개만 남김)
  conflicts: number[];           // 같은 시각인데 값이 다른 행 — 오류
  misaligned: number[];          // 15분 경계에 안 맞는 open_time — 오류
  ohlcErrors: { t: number; reason: string }[];
  gaps: Gap[];
  partialRemoved: number;        // 수집 시각 기준 아직 안 끝난 봉
  ok: boolean;
}

/** Binance um klines CSV(헤더 있을 수도 없을 수도) → 봉. close_time 이 open_time+step−1 이 아니면 오류로 모은다 */
export function parseBinanceKlines(text: string, stepMs = MIN15): { bars: Bar[]; closeTimeErrors: number[] } {
  const bars: Bar[] = [];
  const closeTimeErrors: number[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line || !/^\d/.test(line)) continue;            // 헤더·빈 줄
    const f = line.split(',');
    const t = Number(f[0]);
    if (Number(f[6]) !== t + stepMs - 1) closeTimeErrors.push(t);
    bars.push({ t, o: Number(f[1]), h: Number(f[2]), l: Number(f[3]), c: Number(f[4]), v: Number(f[5]) });
  }
  return { bars, closeTimeErrors };
}

/** 정렬·중복·경계·OHLC 범위·결측·부분 봉 검증. nowMs 가 있으면 t+step > nowMs 인 봉(미완성)을 제거 */
export function validateBars(input: Bar[], stepMs = MIN15, nowMs?: number): Validation {
  const sorted = [...input].sort((a, b) => a.t - b.t);
  const bars: Bar[] = [];
  let duplicates = 0, partialRemoved = 0;
  const conflicts: number[] = [], misaligned: number[] = [], ohlcErrors: { t: number; reason: string }[] = [];
  for (const b of sorted) {
    if (nowMs != null && b.t + stepMs > nowMs) { partialRemoved++; continue; }
    const prev = bars[bars.length - 1];
    if (prev && prev.t === b.t) {
      if (prev.o === b.o && prev.h === b.h && prev.l === b.l && prev.c === b.c && prev.v === b.v) duplicates++;
      else conflicts.push(b.t);
      continue;
    }
    if (b.t % stepMs !== 0) misaligned.push(b.t);
    const nums = [b.o, b.h, b.l, b.c, b.v];
    if (nums.some((x) => !Number.isFinite(x))) ohlcErrors.push({ t: b.t, reason: '숫자 아님' });
    else if (b.l <= 0) ohlcErrors.push({ t: b.t, reason: '저가 ≤ 0' });
    else if (b.l > Math.min(b.o, b.c)) ohlcErrors.push({ t: b.t, reason: '저가 > min(시가,종가)' });
    else if (b.h < Math.max(b.o, b.c)) ohlcErrors.push({ t: b.t, reason: '고가 < max(시가,종가)' });
    else if (b.v < 0) ohlcErrors.push({ t: b.t, reason: '거래량 < 0' });
    bars.push(b);
  }
  const gaps: Gap[] = [];
  for (let i = 1; i < bars.length; i++) {
    const d = bars[i].t - bars[i - 1].t;
    if (d !== stepMs) gaps.push({ afterT: bars[i - 1].t, nextT: bars[i].t, missing: Math.round(d / stepMs) - 1 });
  }
  return { bars, duplicates, conflicts, misaligned, ohlcErrors, gaps, partialRemoved, ok: !conflicts.length && !misaligned.length && !ohlcErrors.length };
}

/** startT 봉부터 첫 결측 직전까지의 연속 구간(endT 가 있으면 그 봉까지). startT 봉이 없으면 빈 배열 */
export function continuousSpan(bars: Bar[], stepMs: number, startT: number, endT = Infinity): Bar[] {
  const i0 = bars.findIndex((b) => b.t === startT);
  if (i0 < 0) return [];
  const out: Bar[] = [bars[i0]];
  for (let i = i0 + 1; i < bars.length && bars[i].t <= endT; i++) {
    if (bars[i].t - bars[i - 1].t !== stepMs) break;
    out.push(bars[i]);
  }
  return out;
}

/** UTC 경계로 묶기 — 묶음 안 봉이 모자라면(부분 봉) 버린다 */
export function resample(bars: Bar[], periodMs: number, stepMs = MIN15): Bar[] {
  const need = periodMs / stepMs;
  const out: Bar[] = [];
  let cur: Bar | null = null, n = 0;
  const flush = () => { if (cur && n === need) out.push(cur); };
  for (const b of bars) {
    const k = Math.floor(b.t / periodMs) * periodMs;
    if (!cur || cur.t !== k) { flush(); cur = { t: k, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }; n = 1; continue; }
    cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; n++;
  }
  flush();
  return out;
}

/** 정규화 CSV(t,o,h,l,c,v) — 수집기가 쓰고 백테스트가 읽는다 */
export function toCsv(bars: Bar[]): string {
  return 't,o,h,l,c,v\n' + bars.map((b) => `${b.t},${b.o},${b.h},${b.l},${b.c},${b.v}`).join('\n') + '\n';
}
export function fromCsv(text: string): Bar[] {
  const out: Bar[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line || !/^\d/.test(line)) continue;
    const [t, o, h, l, c, v] = line.split(',').map(Number);
    out.push({ t, o, h, l, c, v });
  }
  return out;
}

export interface FundingEvent { t: number; rate: number; intervalH: number }

/** Binance um fundingRate CSV: calc_time,funding_interval_hours,last_funding_rate */
export function parseBinanceFunding(text: string): FundingEvent[] {
  const out: FundingEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line || !/^\d/.test(line)) continue;
    const [t, ih, r] = line.split(',');
    out.push({ t: Number(t), intervalH: Number(ih), rate: Number(r) });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** 펀딩 이력의 빈 구간 — 이웃 간격이 정산 주기의 1.5배를 넘으면 결측으로 본다 */
export function fundingGaps(ev: FundingEvent[]): { fromT: number; toT: number }[] {
  const gaps: { fromT: number; toT: number }[] = [];
  for (let i = 1; i < ev.length; i++) {
    if (ev[i].t - ev[i - 1].t > ev[i - 1].intervalH * HOUR * 1.5) gaps.push({ fromT: ev[i - 1].t, toT: ev[i].t });
  }
  return gaps;
}

export const isoUtc = (t: number) => new Date(t).toISOString().replace('.000Z', 'Z');
