/**
 * BNF형 연구 — 일봉 기준 SMA25 이격도·365일 분위수·SMA200 약세장·4시간봉 ATR14. 규격: docs/bnf/STRATEGY.md §3
 * ⚠ 날짜 D 의 값은 모두 D−1 까지 완료된 일봉만으로 만든다(당일·미래 배제).
 */
import { DAY, H4, type Bar } from './data';

export interface DailyContext {
  day0: number;                    // 첫 일봉 시작 시각(UTC 00:00)
  sma25: (number | null)[];        // [d] = mean(close d-25 … d-1)
  devDaily: (number | null)[];     // [d] = close_d / sma25[d] − 1  (분위수 재료)
  q10: (number | null)[];          // [d] = devDaily(d-365 … d-1) 의 분위수
  sma200: (number | null)[];       // [d] = mean(close d-200 … d-1)
  bear: (boolean | null)[];        // [d] = close_{d-1} < sma200[d]
}

/** 선형보간 분위수(R type 7) — sorted 는 오름차순 */
export function quantileSorted(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

function priorMean(closes: number[], d: number, n: number): number | null {
  if (d < n) return null;
  let s = 0;
  for (let k = d - n; k < d; k++) s += closes[k];
  return s / n;
}

/** daily 는 하루도 빠짐없이 연속이어야 한다(아니면 오류) */
/**
 * daily 는 하루도 빠짐없이 연속이어야 한다(아니면 오류).
 * extendNextDay: 마지막 완료 일봉 다음 날(진행 중인 오늘) 칸을 하나 더 만든다 — 그 날의 기준값은 전날까지만 쓰므로
 * 완료 후 계산과 같다(선행 테스트에서 당일 신호를 날짜가 바뀌기 전에 잡기 위함). 그 날의 devDaily 는 null.
 */
export function dailyContext(daily: Bar[], opts: { smaN?: number; qWindow?: number; q?: number; regimeN?: number; extendNextDay?: boolean } = {}): DailyContext {
  const { smaN = 25, qWindow = 365, q = 0.1, regimeN = 200, extendNextDay = false } = opts;
  for (let i = 1; i < daily.length; i++) if (daily[i].t - daily[i - 1].t !== DAY) throw new Error('일봉이 연속이 아닙니다');
  const closes = daily.map((b) => b.c);
  const n = daily.length + (extendNextDay && daily.length ? 1 : 0);
  const idx = Array.from({ length: n }, (_, d) => d);
  const sma25 = idx.map((d) => priorMean(closes, d, smaN));
  const devDaily = idx.map((d) => (d >= closes.length || sma25[d] == null ? null : closes[d] / sma25[d]! - 1));
  const q10: (number | null)[] = new Array(n).fill(null);
  for (let d = qWindow; d < n; d++) {
    const win = devDaily.slice(d - qWindow, d);
    if (win.some((x) => x == null)) continue;
    q10[d] = quantileSorted((win as number[]).sort((a, b) => a - b), q);
  }
  const sma200 = idx.map((d) => priorMean(closes, d, regimeN));
  const bear = sma200.map((s, d) => (s == null || d < 1 ? null : closes[d - 1] < s));
  return { day0: daily.length ? daily[0].t : 0, sma25, devDaily, q10, sma200, bear };
}

/** 시각 t 가 속한 UTC 날짜의 인덱스 */
export const dayIndex = (ctx: DailyContext, t: number) => Math.floor((t - ctx.day0) / DAY);

/** Wilder ATR — 첫 n개 TR 평균으로 시작, 이후 (prev·(n−1)+TR)/n. [i] 는 봉 i 가 끝난 뒤 값 */
export function wilderAtr(bars: Bar[], n = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  let prev: number | null = null, sum = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const tr = i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c));
    if (i < n) { sum += tr; if (i === n - 1) prev = sum / n; out[i] = prev; continue; }
    prev = (prev! * (n - 1) + tr) / n;
    out[i] = prev;
  }
  return out;
}

/** 시각 T 까지 **완료된**(t + 4h ≤ T) 마지막 4시간봉의 ATR — 미래 ATR 금지 */
export function atrAsOf(bars4h: Bar[], atr: (number | null)[], T: number): number | null {
  let lo = 0, hi = bars4h.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars4h[mid].t + H4 <= T) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans < 0 ? null : atr[ans];
}
