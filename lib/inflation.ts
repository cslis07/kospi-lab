/**
 * Nowflation 중계 데이터(CC BY 4.0) → /inflation 허브 가공. 순수 함수(테스트 고정).
 * ⚠ 단위 주의: nowflation 원본은 필드마다 단위가 다르다 —
 *   pulse.gauge.yoy·drivers[].yoy·grocery yoy = **분수**(0.0346=3.46%),
 *   gap/official/forecast/compare series = **퍼센트**(3.46).
 *   호출부에서 pctFrac(분수)·pct(퍼센트)를 구분해 쓴다.
 */

export interface GaugePulse { date: string; yoy: number; dod_pp: number; wow_pp: number; mom_pp: number }
export interface PulseDriver {
  component: string; label: string; weight: number; yoy: number; // 분수
  contribution_bps: number; live_in_gauge?: boolean;
}
export interface PulseOfficial {
  month: string; cpi_yoy: number; cpi_yoy_prev: number; core_yoy: number; core_yoy_prev: number; highest_since?: string;
}
export interface PulseGap { current_pp: number; gauge_yoy: number; official_yoy: number; official_month: string }
export interface Pulse {
  locked?: boolean; asof?: string;
  gauge: GaugePulse; tracker?: { yoy: number }; official: PulseOfficial; gap: PulseGap;
  drivers: PulseDriver[];
  narrative?: { headline?: string; body?: string; tag?: string; model?: string };
  food_pipeline?: { cpi_food_yoy?: number; futures_yoy?: number; note?: string };
}

export interface CompareDaily {
  locked?: boolean; asof?: string;
  dates: string[];
  series: Record<string, { data: (number | null)[] }>;
  prints: { print_month: string; actual: number }[];
  summary?: Record<string, { mae?: number; last6_mae?: number }>;
}

export interface Forecast {
  locked?: boolean; asof?: string; gauge_yoy_now?: number;
  history: [string, number][];
  forecast: { month: string; central: number; low: number; high: number }[];
  official_projection?: { month: string; yoy: number; anchor?: boolean }[];
  disclaimer?: string;
}

/** 공식 CPI vs 나우캐스트 — 월별(그 달 마지막 게이지값 + 공식 발표치)로 압축 */
export interface CompareRow { month: string; nowcast: number | null; official: number | null }
export function compareRows(cd?: CompareDaily | null): CompareRow[] {
  if (!cd?.dates?.length) return [];
  const g = cd.series?.gauge?.data ?? [];
  const lastByMonth = new Map<string, number>();
  cd.dates.forEach((d, i) => {
    const v = g[i];
    if (typeof v === 'number' && Number.isFinite(v)) lastByMonth.set(d.slice(0, 7), v); // 뒤 값이 그 달 최신
  });
  const official = new Map<string, number>();
  (cd.prints ?? []).forEach((p) => { if (typeof p.actual === 'number') official.set(p.print_month, p.actual); });
  const months = [...new Set([...lastByMonth.keys(), ...official.keys()])].sort();
  return months.map((m) => ({ month: m, nowcast: lastByMonth.get(m) ?? null, official: official.get(m) ?? null }));
}

/** 예측 추이 — 과거 실측 + 모델 중앙/밴드 + 공식 투영 */
export interface ForecastRow { month: string; actual: number | null; central: number | null; band: [number, number] | null; official: number | null }
export function forecastRows(f?: Forecast | null): ForecastRow[] {
  if (!f) return [];
  const map = new Map<string, ForecastRow>();
  const get = (m: string) => {
    let r = map.get(m);
    if (!r) { r = { month: m, actual: null, central: null, band: null, official: null }; map.set(m, r); }
    return r;
  };
  (f.history ?? []).forEach(([m, v]) => { get(m).actual = v; });
  (f.forecast ?? []).forEach((p) => { const r = get(p.month); r.central = p.central; r.band = [p.low, p.high]; });
  (f.official_projection ?? []).forEach((p) => { get(p.month).official = p.yoy; });
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export type Cat = '식품' | '주거' | '연료' | '기타';
export function categorize(component: string): Cat {
  const c = (component || '').toLowerCase();
  if (/(food|grocer|egg|meat|dairy|produce)/.test(c)) return '식품';
  if (/(shelter|rent|owned|housing|home_?price|lodging)/.test(c)) return '주거';
  if (/(fuel|energy|gas|electric|oil|utilit)/.test(c)) return '연료';
  return '기타';
}

/** 기여도(절대 bps) 큰 순 상위 n */
export function topDrivers(drivers: PulseDriver[] | undefined, n = 8): PulseDriver[] {
  return [...(drivers ?? [])].sort((a, b) => Math.abs(b.contribution_bps) - Math.abs(a.contribution_bps)).slice(0, n);
}

// 포맷터
export const pctFrac = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(d)}%`); // 분수→%
export const pct = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? '—' : `${x.toFixed(d)}%`); // 이미 %
export const signPp = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(d)}%p`);
