/**
 * 과거 base rate (Phase 2) — "지금과 같은 가격·변동성 체제일 때 과거엔 다음 N일 어떻게 됐나".
 *
 * 이 앱의 핵심 정직성: 방향은 못 맞힌다(측정됨). 그래서 여기서도 '예측'을 하지 않고,
 * 현재 상태(추세 up/down × 변동성 high/low)와 같은 과거일의 **다음 N일 상승비율·변동폭을 대조군과 비교**해
 * 그대로 보여준다. 판정 문턱을 미리 고정(n≥30, 상승비율 차 ±10%p)해 '통과 조합 찾기'를 막는다.
 *
 * 레이어1·2(공급·수요)는 과거 이력 저장이 없어(무료 소스는 현재값만) base rate 를 못 만든다 →
 * 가격 캔들로 재구성 가능한 '추세·변동성' 축만 실측한다. 결과가 대조군과 비슷하면 "우위 없음"이 결론.
 * 변동폭(변동성 군집)은 체제에 따라 다를 수 있다 — 그건 레버리지 가드(최대 역행)에 쓴다(방향 아님).
 */

export interface Candle {
  ts: number;
  close: number;
  high: number;
  low: number;
}
export type Trend = 'up' | 'down';
export type Vol = 'high' | 'low';
export interface DayState {
  trend: Trend;
  vol: Vol;
}

const MA = 20; // 추세 기준 이동평균
const ATR_N = 14; // 변동성 기준
const MIN_HISTORY = MA + ATR_N; // 상태 판정에 필요한 최소 과거 봉

export function sma(closes: number[], i: number, n: number): number | null {
  if (i < n - 1) return null;
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) s += closes[k];
  return s / n;
}

export function trueRange(c: Candle, prev: Candle): number {
  return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
}

/** ATR% (가격 대비 ATR, 체제 비교용 정규화) */
export function atrPct(candles: Candle[], i: number, n = ATR_N): number | null {
  if (i < n) return null;
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) s += trueRange(candles[k], candles[k - 1]);
  const atr = s / n;
  return candles[i].close ? (atr / candles[i].close) * 100 : null;
}

/** i일의 상태 — 추세는 종가 vs MA20, 변동성은 ATR% vs 지금까지 중앙값(확장 윈도) */
export function classifyState(candles: Candle[], i: number): DayState | null {
  if (i < MIN_HISTORY) return null;
  const closes = candles.map((c) => c.close);
  const ma = sma(closes, i, MA);
  const a = atrPct(candles, i);
  if (ma == null || a == null) return null;
  // 지금까지의 ATR% 중앙값을 문턱으로(미래 미사용)
  const hist: number[] = [];
  for (let k = ATR_N; k <= i; k++) {
    const v = atrPct(candles, k);
    if (v != null) hist.push(v);
  }
  const med = median(hist);
  return { trend: candles[i].close >= ma ? 'up' : 'down', vol: med != null && a >= med ? 'high' : 'low' };
}

/** i→i+h 종가 변동률 % */
export function forwardMovePct(candles: Candle[], i: number, h: number): number | null {
  if (i + h >= candles.length) return null;
  const a = candles[i].close;
  const b = candles[i + h].close;
  return a ? (b / a - 1) * 100 : null;
}

/** i 진입 후 h일 내 최대 역행 % (롱이면 저점까지, 숏이면 고점까지) */
export function maxAdverseFwd(candles: Candle[], i: number, h: number, isShort: boolean): number | null {
  if (i + h >= candles.length) return null;
  const entry = candles[i].close;
  if (!entry) return null;
  let worst = 0;
  for (let k = i + 1; k <= i + h; k++) {
    const adverse = isShort
      ? (candles[k].high - entry) / entry // 숏은 고점이 불리
      : (entry - candles[k].low) / entry; // 롱은 저점이 불리
    if (adverse > worst) worst = adverse;
  }
  return worst * 100;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))));
  return s[idx];
}

export interface StateStat {
  n: number;
  upRatio: number; // 다음 h일 상승 비율
  medianAbsMovePct: number;
  p90MaxAdversePct: number; // 롱 기준 과거 이 상태 최대 역행 90분위 → 레버리지 가드
}
export type Verdict = 'insufficient' | 'edge-unclear' | 'vol-differs';

export interface BaseRates {
  current: DayState | null;
  stateLabel: string;
  matched: StateStat | null;
  control: StateStat | null;
  horizonDays: number;
  verdict: Verdict;
  note: string;
}

function statOf(rows: { fwd: number; adv: number }[]): StateStat {
  const ups = rows.filter((r) => r.fwd > 0).length;
  return {
    n: rows.length,
    upRatio: rows.length ? ups / rows.length : 0,
    medianAbsMovePct: median(rows.map((r) => Math.abs(r.fwd))) ?? 0,
    p90MaxAdversePct: quantile(rows.map((r) => r.adv), 0.9) ?? 0,
  };
}

const STATE_KO: Record<string, string> = {
  'up|high': '상승추세·고변동', 'up|low': '상승추세·저변동',
  'down|high': '하락추세·고변동', 'down|low': '하락추세·저변동',
};

/** n≥30·상승비율 차 ±10%p·변동폭 차 ±25% 로 사전 고정한 판정 */
export function baseRates(candles: Candle[], horizonDays: number): BaseRates {
  const h = horizonDays;
  const current = candles.length ? classifyState(candles, candles.length - 1) : null;
  const key = current ? `${current.trend}|${current.vol}` : '';
  const stateLabel = STATE_KO[key] ?? '미상';

  const all: { fwd: number; adv: number }[] = [];
  const matchedRows: { fwd: number; adv: number }[] = [];
  for (let i = MIN_HISTORY; i < candles.length - h; i++) {
    const st = classifyState(candles, i);
    const fwd = forwardMovePct(candles, i, h);
    const adv = maxAdverseFwd(candles, i, h, false);
    if (!st || fwd == null || adv == null) continue;
    const row = { fwd, adv };
    all.push(row);
    if (current && st.trend === current.trend && st.vol === current.vol) matchedRows.push(row);
  }
  const control = all.length ? statOf(all) : null;
  const matched = matchedRows.length ? statOf(matchedRows) : null;

  let verdict: Verdict = 'edge-unclear';
  let note = '';
  if (!matched || matched.n < 30) {
    verdict = 'insufficient';
    note = `표본 부족(n=${matched?.n ?? 0}) — 판정 보류. 참고용.`;
  } else if (control) {
    const dirDiff = (matched.upRatio - control.upRatio) * 100;
    const volRatio = control.medianAbsMovePct ? matched.medianAbsMovePct / control.medianAbsMovePct : 1;
    if (Math.abs(volRatio - 1) >= 0.25) {
      verdict = 'vol-differs';
      note = `방향 상승비율은 대조군과 비슷(${(matched.upRatio * 100).toFixed(0)}% vs ${(control.upRatio * 100).toFixed(0)}%) — 매매 우위 아님. 단 변동폭은 대조군의 ${volRatio.toFixed(2)}배 → 이 체제는 레버리지·손절폭을 그만큼 조정.`;
    } else {
      verdict = 'edge-unclear';
      note = `상승비율 ${(matched.upRatio * 100).toFixed(0)}% vs 대조군 ${(control.upRatio * 100).toFixed(0)}%(차 ${dirDiff.toFixed(0)}%p) — 우연 범위, 방향 우위 없음.`;
    }
  }

  return { current, stateLabel, matched, control, horizonDays: h, verdict, note };
}

// ── 데이터 가져오기 ─────────────────────────────────────────────
export async function getRegimeEdge(horizonDays = 2): Promise<BaseRates & { priceUsd: number | null }> {
  try {
    const res = await fetch(
      'https://api.bitget.com/api/v2/spot/market/candles?symbol=ETHUSDT&granularity=1day&limit=400',
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { code?: string; data?: string[][] };
    if (j.code !== '00000' || !Array.isArray(j.data)) throw new Error('bad payload');
    const candles: Candle[] = j.data
      .map((r) => ({ ts: Number(r[0]), close: Number(r[4]), high: Number(r[2]), low: Number(r[3]) }))
      .filter((c) => Number.isFinite(c.ts) && c.close > 0)
      .sort((a, b) => a.ts - b.ts);
    const br = baseRates(candles, horizonDays);
    return { ...br, priceUsd: candles.length ? candles[candles.length - 1].close : null };
  } catch {
    return {
      current: null, stateLabel: '미상', matched: null, control: null,
      horizonDays, verdict: 'insufficient', note: '캔들 조회 실패 — 참고 불가.', priceUsd: null,
    };
  }
}
