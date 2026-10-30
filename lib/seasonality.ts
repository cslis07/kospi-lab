/**
 * 계절성(월별 수익률) — 월봉 종가로 '연도 × 월' 수익률 표와 월별 평균·중앙값·상승 확률을 만든다.
 * (참고: TradingView Seasonals · 인베스팅 월별 수익률). 과거 패턴일 뿐 다음 달 예측이 아니다 — 표본(연수)을 같이 보여준다.
 * 입력: Yahoo 월봉 timestamp(초)·종가·거래소 gmtoffset. 같은 달에 점이 둘이면(진행 중인 달) 마지막 값을 쓴다.
 */
export interface SeasonYear { year: number; months: (number | null)[]; total: number | null }
export interface SeasonStat { month: number; avg: number | null; median: number | null; upPct: number | null; n: number }
export interface Seasonality { years: SeasonYear[]; stats: SeasonStat[]; current: { year: number; month: number } | null }

/** 'YYYY-MM' → 종가(그 달의 마지막 값) */
export function monthlyCloses(ts: number[], closes: (number | null)[], gmtoffset = 0): Map<string, number> {
  const m = new Map<string, number>();
  ts.forEach((t, i) => {
    const c = closes[i];
    if (c == null || !Number.isFinite(c)) return;
    const d = new Date((t + gmtoffset) * 1000);
    m.set(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, c);
  });
  return m;
}

const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
const r2 = (x: number) => Math.round(x * 100) / 100;

/** now = 진행 중인 달 판정용(그 달은 표에는 넣되 월별 통계에서는 뺀다) */
export function seasonality(closes: Map<string, number>, now: Date): Seasonality {
  const keys = [...closes.keys()].sort();
  if (keys.length < 2) return { years: [], stats: [], current: null };
  const curKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const ret = new Map<string, number>();
  for (let i = 1; i < keys.length; i++) {
    const [y0, m0] = keys[i - 1].split('-').map(Number), [y1, m1] = keys[i].split('-').map(Number);
    if ((y1 - y0) * 12 + (m1 - m0) !== 1) continue; // 빠진 달이 있으면 건너뜀
    ret.set(keys[i], (closes.get(keys[i])! / closes.get(keys[i - 1])! - 1) * 100);
  }
  const ys = [...new Set([...ret.keys()].map((k) => Number(k.slice(0, 4))))].sort((a, b) => b - a);
  const years: SeasonYear[] = ys.map((year) => {
    const months = Array.from({ length: 12 }, (_, i) => { const v = ret.get(`${year}-${String(i + 1).padStart(2, '0')}`); return v == null ? null : r2(v); });
    const have = months.filter((v): v is number => v != null);
    const total = have.length ? r2((have.reduce((a, v) => a * (1 + v / 100), 1) - 1) * 100) : null;
    return { year, months, total };
  });
  const stats: SeasonStat[] = Array.from({ length: 12 }, (_, i) => {
    const xs = [...ret.entries()].filter(([k]) => Number(k.slice(5)) === i + 1 && k !== curKey).map(([, v]) => v);
    return { month: i + 1, n: xs.length, avg: xs.length ? r2(xs.reduce((a, v) => a + v, 0) / xs.length) : null, median: xs.length ? r2(med(xs)) : null, upPct: xs.length ? Math.round((xs.filter((v) => v > 0).length / xs.length) * 100) : null };
  });
  return { years, stats, current: ret.has(curKey) ? { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 } : null };
}
