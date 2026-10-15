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

// ── 품목 드릴다운(compare.json) ──
export interface CompareTile { component: string; label: string; weight: number; yoy: number; mom: number; bls_yoy: number; spread: number }
export interface Spark { ours: (number | null)[]; bls: (number | null)[] }
export interface Compare {
  locked?: boolean; month: string;
  tiles: CompareTile[];
  sparks: Record<string, Spark>;
}

/** "2026-08" 에서 뒤로 n개월(오름차순) */
export function monthsEndingAt(end: string, n: number): string[] {
  const [y, m] = end.split('-').map(Number);
  const out: string[] = [];
  let yy = y, mm = m;
  for (let i = 0; i < n; i++) { out.unshift(`${yy}-${String(mm).padStart(2, '0')}`); mm--; if (mm === 0) { mm = 12; yy--; } }
  return out;
}

/** 품목 스파크(나우캐스트 ours vs 공식 bls, 분수) → 월별 비교 행(퍼센트) */
export function sparkCompareRows(spark: Spark | undefined, endMonth: string): CompareRow[] {
  if (!spark?.ours?.length) return [];
  const r4 = (x: number) => Math.round(x * 1e6) / 1e4; // 분수→% + 부동소수 정리
  const months = monthsEndingAt(endMonth, spark.ours.length);
  return months.map((m, i) => ({
    month: m,
    nowcast: spark.ours[i] != null ? r4(spark.ours[i] as number) : null,
    official: spark.bls?.[i] != null ? r4(spark.bls[i] as number) : null,
  }));
}

// ── 지역 물가(geo.json) ──
export interface StateRow { state: string; name: string; gas: number | null; gas_date?: string; elec_cents: number | null; elec_yoy: number | null; elec_date?: string }
export interface MetroRow { metro: string; rent: number | null; yoy: number | null; asof?: string }
export interface GeoData { locked?: boolean; asof?: string; states: StateRow[]; metros: MetroRow[] }

/** 주별 휘발유 가격 내림차순(값 있는 것만) */
export function gasRanked(states: StateRow[] | undefined): StateRow[] {
  return [...(states ?? [])].filter((s) => typeof s.gas === 'number').sort((a, b) => (b.gas as number) - (a.gas as number));
}
/** 도시 임대료 내림차순(값 있는 것만) */
export function metrosByRent(metros: MetroRow[] | undefined): MetroRow[] {
  return [...(metros ?? [])].filter((m) => typeof m.rent === 'number').sort((a, b) => (b.rent as number) - (a.rent as number));
}
/** 평균(값 있는 것만) */
export function avg(nums: (number | null | undefined)[]): number | null {
  const v = nums.filter((x): x is number => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
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
