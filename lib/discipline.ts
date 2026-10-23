/**
 * 규율 점수 — "손익이 아니라 규칙을 지킨 정도". 방향 예측 없이 거래소 기록(사실)만으로 KST 하루 단위 0~100점.
 * 순수 함수(테스트: tests/discipline.test.ts). 매매는 '진입 시각(KST)'의 날짜에 속한다.
 *
 * 항목(가중치 W — 합 100, 해당 날 판정 불가 항목은 빼고 나머지 가중치로 다시 100점 환산):
 *   ① 손절 주문 (30) — 거래소에 SL 주문 기록이 있는 매매 비율. ClosedPosition.stop != null.
 *   ② 1H 추세 순응 (25) — 진입 '직전에 마감된' 1H 봉까지의 EMA20/60 으로 본 추세 방향과 같은 쪽 진입 비율.
 *        상승 = EMA20>EMA60 이고 종가≥EMA20, 하락 = EMA20<EMA60 이고 종가<EMA20, 그 외 횡보.
 *        롱·상승 / 숏·하락 = 순응. 횡보·역방향 = 비순응. 1H 데이터가 없거나 워밍업(60봉) 전이면 판정 제외.
 *        (lib/coinAnalysis 의 tfTrend 와 같은 정배열+EMA20 규칙, EMA200 조건만 뺌 — 진입별 계산은 emaSeries 재사용)
 *   ③ 복수 매매 없음 (20) — 손실 청산 후 30분 이내 진입(종목 무관)을 '복수 재진입'으로 보고 1 − 비율.
 *   ④ 과매매 없음 (15) — 하루 진입 6건 이하면 만점, 초과 1건마다 1/6 감점(12건 이상 0).
 *   ⑤ 초단타 손실 없음 (10) — 보유 3분 미만 + 순손실 매매를 1 − 비율.
 *
 * 점수는 규칙 준수도일 뿐 '좋은 매매'나 수익을 뜻하지 않는다. 가중치는 이 앱의 기본 설정(임의값)이다.
 */
import { emaSeries } from '@/lib/coinAnalysis';

export const DISCIPLINE_WEIGHTS = { stop: 30, trend: 25, revenge: 20, overtrade: 15, scalp: 10 } as const;
export type DisciplineKey = keyof typeof DISCIPLINE_WEIGHTS;
export const DISCIPLINE_LABELS: Record<DisciplineKey, string> = {
  stop: '손절 주문', trend: '1H 추세 순응', revenge: '복수 매매 없음', overtrade: '과매매 없음', scalp: '초단타 손실 없음',
};

export const REVENGE_MS = 30 * 60_000;
export const SCALP_MS = 3 * 60_000;
export const MAX_TRADES_PER_DAY = 6;
const HOUR = 3_600_000;
const WARMUP = 60;

export interface DTrade {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  openTs: number;
  closeTs: number;
  netProfit: number;
  hasStop: boolean;
}

export type Trend1h = 'up' | 'down' | 'flat';

/** [openTs, close] 오름차순 1H 봉 */
export type Closes1h = Array<[number, number]>;

export interface TrendIndex { ts: number[]; close: number[]; e20: number[]; e60: number[] }

export function buildTrendIndex(rows: Closes1h): TrendIndex {
  const sorted = [...rows].sort((a, b) => a[0] - b[0]);
  const close = sorted.map((r) => r[1]);
  return { ts: sorted.map((r) => r[0]), close, e20: emaSeries(close, 20), e60: emaSeries(close, 60) };
}

/** 진입 시각 직전에 '마감된' 1H 봉(openTs + 1h ≤ entryTs) 기준 추세. 데이터 부족이면 null */
export function trendAt(idx: TrendIndex, entryTs: number): Trend1h | null {
  // 이진 탐색: ts[i] + HOUR <= entryTs 인 마지막 i
  let lo = 0, hi = idx.ts.length - 1, i = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (idx.ts[m] + HOUR <= entryTs) { i = m; lo = m + 1; } else hi = m - 1;
  }
  if (i < WARMUP - 1) return null;
  // 봉 사이에 빈 구간이 크면(데이터 범위 밖) 판정하지 않는다
  if (entryTs - (idx.ts[i] + HOUR) > 2 * HOUR) return null;
  const c = idx.close[i], e20 = idx.e20[i], e60 = idx.e60[i];
  if (e20 > e60 && c >= e20) return 'up';
  if (e20 < e60 && c < e20) return 'down';
  return 'flat';
}

export interface TradeFlags {
  id: string;
  day: string;
  hasStop: boolean;
  trend: Trend1h | null;
  /** 추세 순응(판정 불가면 null) */
  aligned: boolean | null;
  revenge: boolean;
  lossScalp: boolean;
}

const kstDay = (ts: number) => new Date(ts + 9 * HOUR).toISOString().slice(0, 10);

/** 매매별 사실 플래그 — 복수 재진입은 날짜를 넘어서도(전날 밤 손실 → 자정 넘어 진입) 잡는다 */
export function tradeFlags(trades: DTrade[], trendBySymbol: Record<string, TrendIndex | undefined>): TradeFlags[] {
  const lossCloses = trades.filter((t) => t.netProfit < 0).map((t) => t.closeTs).sort((a, b) => a - b);
  return [...trades].sort((a, b) => a.openTs - b.openTs).map((t) => {
    const idx = trendBySymbol[t.symbol];
    const trend = idx ? trendAt(idx, t.openTs) : null;
    const aligned = trend == null ? null : (t.side === 'long' ? trend === 'up' : trend === 'down');
    const revenge = lossCloses.some((c) => c <= t.openTs && t.openTs - c <= REVENGE_MS);
    const held = t.closeTs - t.openTs;
    return {
      id: t.id, day: kstDay(t.openTs), hasStop: t.hasStop, trend, aligned, revenge,
      lossScalp: held >= 0 && held < SCALP_MS && t.netProfit < 0,
    };
  });
}

export interface DisciplineParts {
  /** 각 항목 준수율 0~1 (판정 불가면 null) */
  stop: number | null;
  trend: number | null;
  revenge: number | null;
  overtrade: number | null;
  scalp: number | null;
}

export interface DisciplineDay {
  day: string;
  n: number;
  score: number;
  parts: DisciplineParts;
  stops: number;
  trendKnown: number;
  aligned: number;
  revenge: number;
  lossScalps: number;
}

export function scoreFromParts(p: DisciplineParts): number {
  let w = 0, s = 0;
  for (const k of Object.keys(DISCIPLINE_WEIGHTS) as DisciplineKey[]) {
    const v = p[k];
    if (v == null) continue;
    w += DISCIPLINE_WEIGHTS[k];
    s += DISCIPLINE_WEIGHTS[k] * v;
  }
  return w > 0 ? Math.round((s / w) * 100) : 0;
}

function aggregate(day: string, flags: TradeFlags[], daysCount: number): DisciplineDay {
  const n = flags.length;
  const stops = flags.filter((f) => f.hasStop).length;
  const known = flags.filter((f) => f.aligned != null);
  const aligned = known.filter((f) => f.aligned).length;
  const revenge = flags.filter((f) => f.revenge).length;
  const lossScalps = flags.filter((f) => f.lossScalp).length;
  const perDay = daysCount > 0 ? n / daysCount : n;
  const parts: DisciplineParts = {
    stop: n ? stops / n : null,
    trend: known.length ? aligned / known.length : null,
    revenge: n ? 1 - revenge / n : null,
    overtrade: n ? Math.max(0, 1 - Math.max(0, perDay - MAX_TRADES_PER_DAY) / MAX_TRADES_PER_DAY) : null,
    scalp: n ? 1 - lossScalps / n : null,
  };
  return { day, n, score: scoreFromParts(parts), parts, stops, trendKnown: known.length, aligned, revenge, lossScalps };
}

/** KST 날짜별 규율 점수(매매 있는 날만, 오래된 → 최신) */
export function disciplineByDay(flags: TradeFlags[]): DisciplineDay[] {
  const map = new Map<string, TradeFlags[]>();
  for (const f of flags) { const a = map.get(f.day); if (a) a.push(f); else map.set(f.day, [f]); }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([d, fs]) => aggregate(d, fs, 1));
}

/**
 * 여러 날 묶음 요약(예: 최근 7일) — 과매매 항목은 '매매한 날 평균 건수'로, 나머지는 전체 매매 비율로.
 * 점수는 날별 점수 평균이 아니라 묶음 전체 비율로 다시 계산한다(건수 많은 날이 더 반영됨).
 */
export function disciplineSummary(flags: TradeFlags[], label = 'range'): DisciplineDay | null {
  if (!flags.length) return null;
  const days = new Set(flags.map((f) => f.day)).size;
  return aggregate(label, flags, days);
}
