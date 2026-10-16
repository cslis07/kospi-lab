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

// ── THE GAUGE 허브(Stage A): 오늘 왜·CPI 격차·vs Truflation·리드 테스트 ──

/** latestSnapshot.json — 게이지 최신 스냅샷(오늘 왜 움직였나) */
export interface SnapDriver {
  component: string; label: string; contribution_pp: number; change?: number; live?: boolean;
  new_print?: { from_month: string; to_month: string; released: string };
}
/** gauge_gap_explained — 이달 게이지−공식 격차의 품목 분해(원본이 객체) */
export interface GapExplained {
  month?: string; month_label?: string; gap_pp?: number; total_pp?: number; rest_pp?: number;
  parts?: { key: string; label: string; pp: number; ours_pct?: number; official_pct?: number }[];
}
/** 격차 분해 품목을 기여(절대 %p) 큰 순으로(값 있는 것만) */
export function gapExplainedParts(g?: GapExplained | string | null): GapExplained['parts'] {
  if (!g || typeof g === 'string' || !Array.isArray(g.parts)) return [];
  return [...g.parts].filter((p) => typeof p.pp === 'number').sort((a, b) => Math.abs(b.pp) - Math.abs(a.pp));
}
export interface LatestSnapshot {
  locked?: boolean; asof?: string; gauge_date?: string;
  gauge_yoy_pct?: number; gauge_yoy_1dp?: number;
  gauge_dod_pp?: number; gauge_wow_pp?: number; gauge_mom_pp?: number;
  gauge_changes_note?: string;
  pace_3m_ann_pct?: number; pace_1m_ann_pct?: number; pace_basis?: string; pace_basis_yoy_pct?: number;
  pace_1m_change_pct?: number; pace_1m_window?: { from: string; to: string };
  pace_1m_drivers?: SnapDriver[];
  cost_of_living_yoy_pct?: number; tracker_yoy_pct?: number;
  official_cpi_yoy?: number; official_core_yoy?: number; official_month_label?: string;
  gap_pp?: number; gauge_gap_explained?: GapExplained | string;
  live_coverage_pct?: number;
}
/** pace_1m_drivers 를 기여도(절대 %p) 큰 순으로 */
export function snapDrivers(s?: LatestSnapshot | null): SnapDriver[] {
  return [...(s?.pace_1m_drivers ?? [])].sort((a, b) => Math.abs(b.contribution_pp) - Math.abs(a.contribution_pp));
}

/** gaptable.json — 게이지 vs 공식(BLS) 전지표 비교 */
export interface GapRow {
  key: string; label: string;
  fmc_yoy: number | null; fmc_source?: string; fmc_kind?: string; fmc_period?: string;
  official_yoy: number | null; official_month?: string | null; official_role?: string;
  gap_pp: number | null; gap_basis?: string | null;
}
export interface GapTable { locked?: boolean; rows: GapRow[]; next_print?: unknown; lead?: unknown }

/** vs Truflation — compare_daily 의 gauge·truflation 일별을 최근 N개월 창으로 겹쳐 그림(과포인트는 스트라이드 다운샘플) */
export interface TrendRow { date: string; gauge: number | null; truflation: number | null }
function shiftMonths(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const base = new Date(Date.UTC(y, (m - 1) + delta, d || 1));
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(base.getUTCDate()).padStart(2, '0')}`;
}
const toNum = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
export function truflationTrendRows(cd?: CompareDaily | null, months = 24, maxPts = 180): TrendRow[] {
  const dates = cd?.dates ?? [];
  if (!dates.length) return [];
  const g = cd!.series?.gauge?.data ?? [];
  const t = cd!.series?.truflation?.data ?? [];
  const cutoff = shiftMonths(dates[dates.length - 1], -months);
  const picked = dates.map((d, i) => ({ d, i })).filter((x) => x.d >= cutoff);
  const stride = Math.max(1, Math.ceil(picked.length / maxPts));
  return picked
    .filter((_, k) => k % stride === 0 || k === picked.length - 1)
    .map(({ d, i }) => ({ date: d, gauge: toNum(g[i]), truflation: toNum(t[i]) }));
}

/** lead_test.json — 발표 전야 게이지가 공식 CPI를 얼마나 앞서 맞히나(통계) */
export interface LeadStat {
  n: number; mean_gap?: number; sd_gap?: number; mae: number; rmse?: number; corr?: number;
  dir_hit?: number; beats_naive_rate?: number;
}
export interface LeadWindow { n_prints: number; from: string; to: string; by_variant: Record<string, LeadStat>; naive?: LeadStat }
export interface LeadTest {
  locked?: boolean; asof?: string; variants: Record<string, string>; units?: Record<string, string>;
  last_cpi_month?: string; print_eve: { windows: Record<string, LeadWindow> };
}

// ── 예측·Fed 허브(Stage B): 스코어보드·발표 일정·예측시장·Fed watch ──

/** 예측자 표시명 */
export const FORECASTER_KO: Record<string, string> = {
  fmc: 'Nowflation', fmc_ensemble: 'Nowflation(앙상블)', in_house: '자체 모델',
  cleveland_fed: '클리블랜드 연준', street_consensus: '월가 컨센서스', kalshi_implied: 'Kalshi(시장)',
};

/** accountability_target_*.json — 발표별 예측자 적중(누가 맞혔나) */
export interface AcctForecast { value: number; err: number; abs: number; vintage?: string; pre_registered?: boolean }
export interface AcctPrint {
  print_month: string; scheduled_at?: string; actual: number;
  forecasts: Record<string, AcctForecast>; best?: string[]; best_incl_backtest?: string[];
}
export interface Accountability { locked?: boolean; target?: string; prints: AcctPrint[] }
/** 한 발표의 예측자들을 절대오차 작은 순(정확한 순)으로, best 표시 */
export function acctForecasters(p: AcctPrint): { key: string; name: string; f: AcctForecast; best: boolean }[] {
  const best = new Set(p?.best ?? []);
  return Object.entries(p?.forecasts ?? {})
    .map(([key, f]) => ({ key, name: FORECASTER_KO[key] ?? key, f, best: best.has(key) }))
    .sort((a, b) => (a.f?.abs ?? 1e9) - (b.f?.abs ?? 1e9));
}

/** backtest.json — 장기 성적 요약 */
export interface Backtest {
  locked?: boolean;
  summary?: {
    model?: string; prints?: number; range?: [string, string];
    mae_fmc?: number; mae_naive?: number; beats_naive_pct?: number;
    street_overlap?: { prints?: number; mae_fmc?: number; mae_street?: number };
    note?: string;
  };
}

/** release_calendar.json — 미국 주요 지표 발표 일정(나우캐스트 예측 포함) */
export interface ReleaseEvent {
  kind: string; date: string; data_month?: string; unit?: string; summary?: string; url?: string;
  street?: number; prior?: number; cleveland?: number; kalshi?: number; nowflation_forecast?: number;
}
export interface ReleaseCalendar { locked?: boolean; from?: string; events: ReleaseEvent[] }

/** econcal_window.json — 경제 캘린더(국가별 이벤트) */
export interface EconEvent { date: string; country: string; event: string; actual: number | null; estimate: number | null; previous: number | null; impact: string; unit?: string | null }
export interface EconCalWindow { locked?: boolean; from?: string; to?: string; events: EconEvent[] }
/** 미국 High/Medium 영향 이벤트만(상한) */
export function usHighImpact(w?: EconCalWindow | null, limit = 24): EconEvent[] {
  return (w?.events ?? []).filter((e) => e.country === 'US' && (e.impact === 'High' || e.impact === 'Medium')).slice(0, limit);
}

/** predmarkets_summary.json — 예측시장(Polymarket·Kalshi) */
export interface PredOutcome { name: string; prob: number }
export interface PredMarket { source: string; title: string; group: string; volume?: number; closes?: string; url?: string; outcomes: PredOutcome[] }
export interface PredGroup { key: string; label: string; markets: PredMarket[] }
export interface PredMarkets { locked?: boolean; generated_at?: string; groups: PredGroup[] }

/** fedwatch.json — 다음 FOMC 시장 확률(Kalshi) */
export interface FedOutcome { label: string; prob: number; bps?: number }
export interface FedWatch {
  locked?: boolean; asof?: string;
  next_meeting?: { date: string; days_to?: number; statement_et?: string; releases_before?: { release: string; print_month?: string; date: string }[] };
  market?: { source?: string; outcomes: FedOutcome[]; implied_change_bps?: number; modal?: FedOutcome; history?: { date: string; implied_change_bps?: number }[] };
}

// ── 브리핑·발표일 분석·기사 허브(Stage C) ──

/** brief_daily.json — 일별 인플레 브리핑(오늘 + 아카이브) */
export interface BriefGauge { yoy_pct?: number; dod_pp?: number; wow_pp?: number; mom_pp?: number; pace_1m_pct?: number; pace_3m_pct?: number }
export interface BriefDay { date: string; date_label?: string; gauge?: BriefGauge }
export interface BriefToday extends BriefDay {
  narrative?: { headline?: string; tag?: string; body?: string };
  what_moved?: string[];
  next_release?: { name?: string; print_month_label?: string; date_label?: string; days_to?: number; street?: number; nowflation_forecast?: number; cleveland?: number; kalshi?: number; prior?: number };
  truflation?: { yoy_pct?: number; date?: string; gap_vs_gauge_pp?: number };
  official?: { print_month_label?: string; cpi_yoy?: number; gap_pp?: number };
}
export interface BriefDaily { locked?: boolean; asof?: string; today?: BriefToday; archive?: BriefDay[]; cpi_schedule?: { date: string; print_month: string; days_to: number }[] }

/** print_<YYYY_MM>.json — 발표일 분석(예측 대 실제) */
export interface PrintCall { forecaster: string; label: string; value: number | null; source?: string; err?: number | null; abs?: number | null }
export interface PrintTarget { target: string; label: string; actual: number | null; consensus?: number; prior?: number; calls: PrintCall[] }
export interface PrintDay {
  locked?: boolean; print_month?: string; print_month_label?: string; slug?: string; status?: string;
  release?: { date?: string; datetime_et?: string; name?: string };
  targets?: PrintTarget[]; what_happened?: string | null;
}
/** "2026-09" → "print_2026_09.json" (nextprint.print_month 으로 파일명 구성) */
export function printFile(printMonth?: string | null): string | null {
  if (!printMonth || !/^\d{4}-\d{2}$/.test(printMonth)) return null;
  return `print_${printMonth.replace('-', '_')}.json`;
}

/** articles_index.json — 경제 기사 목록(nowflation.com 외부 링크) */
export interface ArticleItem { slug: string; url: string; title: string; date: string; updated?: string | null; summary?: string; excerpt?: string; tags?: string[]; reading_min?: number; has_video?: boolean }
export interface ArticlesIndex { locked?: boolean; count?: number; tags?: string[]; author?: { name?: string; credentials?: string; role?: string }; articles: ArticleItem[] }
/** 상대 경로(/articles/..) → nowflation.com 절대 URL */
export function nfLink(url?: string): string {
  if (!url) return 'https://nowflation.com';
  return url.startsWith('http') ? url : `https://nowflation.com${url}`;
}

// ── 가격 허브(Stage D): 품목별 가격·장바구니 담기 ──

/** grocery_basket.json — 품목별 현재가 + yoy(분수) + 월별 series([date,value]) */
export interface GroceryItem {
  code: string; label: string; unit?: string;
  latest?: { date: string; value: number }; last_date?: string;
  yoy?: number; series?: [string, number][]; stale?: boolean;
}
export interface GroceryBasket { locked?: boolean; asof?: string; items: GroceryItem[]; stale_codes?: string[] }

/** 월별 [date,value] → 최근 N개월 차트 행(과포인트는 스트라이드 다운샘플) */
export interface PriceRow { date: string; value: number | null }
export function priceRows(series?: [string, number][] | null, months = 60, maxPts = 120): PriceRow[] {
  const s = (series ?? []).filter((p) => Array.isArray(p) && typeof p[1] === 'number');
  if (!s.length) return [];
  const recent = s.slice(-months);
  const stride = Math.max(1, Math.ceil(recent.length / maxPts));
  return recent.filter((_, k) => k % stride === 0 || k === recent.length - 1).map(([date, value]) => ({ date, value }));
}

/** series 의 1년 전(12개월 전) 값 — 월별 연속 가정, 없으면 null */
export function valueYearAgo(series?: [string, number][] | null): number | null {
  const s = series ?? [];
  if (s.length < 13) return null;
  const v = s[s.length - 13]?.[1];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 장바구니 합계 — 현재가·1년 전·전년대비% (수량 map, 수량>0 품목만) */
export function cartTotals(items: GroceryItem[], qty: Record<string, number>): { now: number; yearAgo: number | null; yoyPct: number | null } {
  let now = 0, yearAgo = 0, yaOk = true;
  for (const it of items) {
    const q = qty[it.code] ?? 0;
    if (q <= 0) continue;
    const price = it.latest?.value ?? 0;
    now += price * q;
    const ya = valueYearAgo(it.series);
    if (ya == null) yaOk = false; else yearAgo += ya * q;
  }
  const ya = yaOk && yearAgo > 0 ? yearAgo : null;
  return { now, yearAgo: ya, yoyPct: ya != null ? ((now - ya) / ya) * 100 : null };
}

// 포맷터
export const pctFrac = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(d)}%`); // 분수→%
export const pct = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? '—' : `${x.toFixed(d)}%`); // 이미 %
export const signPp = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(d)}%p`);
