/**
 * 미국 주요 경제지표 발표 일정(시각 포함) — 위험관리 필터(/risk-control)·발표 전후 연구실(/event-lab) 공용. 순수 함수.
 * 테스트: tests/macroSchedule.test.ts
 *
 * 출처·시각 규칙(추정 금지 — 확보한 것만 쓴다):
 *  - 날짜: FRED release calendar(`fred/release/dates`, 과거 실제 발표일 + 예정일). 서버 로더는 app/api/risk/events.
 *  - FOMC: 연준 공식 일정(federalreserve.gov/monetarypolicy/fomccalendars.htm, 2026-11-02 확인). 결정 = 회의 둘째 날.
 *  - 시각: 각 기관의 **표준 발표 시각(미 동부시간)** — BLS(CPI·PPI·고용)·BEA(GDP·PCE)·Census(소매판매) 08:30 ET,
 *    FOMC 성명 14:00 ET, 의장 기자회견 14:30 ET. 동부시간 → UTC 는 America/New_York 시간대(서머타임 포함)로 변환한다.
 *  - 이례적으로 시각이 바뀐 발표(셧다운 등)는 날짜는 FRED 가 반영하지만 시각은 표준 시각으로 둔다 — 화면에 '표준 시각' 명시.
 *
 * 같은 시각에 여러 지표가 나오면(예: GDP·PCE 같은 날 08:30) coReleases 로 묶어 "한 지표의 영향"으로 단정하지 않게 한다.
 */

export type MacroKind = 'cpi' | 'ppi' | 'jobs' | 'gdp' | 'pce' | 'retail' | 'fomc' | 'powell';

export interface MacroDef {
  kind: MacroKind;
  title: string;
  /** 같은 발표에 함께 나오는 세부 지표 */
  includes: string[];
  /** 표준 발표 시각(미 동부시간 HH:MM) */
  etTime: string;
  /** FRED release_id (FOMC·기자회견은 없음) */
  fredId: number | null;
  source: string;
}

export const MACRO_DEFS: Record<MacroKind, MacroDef> = {
  cpi:    { kind: 'cpi',    title: '미국 CPI',            includes: ['CPI', '근원 CPI'],                 etTime: '08:30', fredId: 10, source: 'BLS · 일정 FRED' },
  ppi:    { kind: 'ppi',    title: '미국 PPI',            includes: ['PPI', '근원 PPI'],                 etTime: '08:30', fredId: 46, source: 'BLS · 일정 FRED' },
  jobs:   { kind: 'jobs',   title: '미국 고용보고서',       includes: ['비농업고용(NFP)', '실업률'],        etTime: '08:30', fredId: 50, source: 'BLS · 일정 FRED' },
  gdp:    { kind: 'gdp',    title: '미국 GDP',            includes: ['GDP'],                            etTime: '08:30', fredId: 53, source: 'BEA · 일정 FRED' },
  pce:    { kind: 'pce',    title: '미국 PCE(개인소득·지출)', includes: ['PCE', '근원 PCE'],                etTime: '08:30', fredId: 54, source: 'BEA · 일정 FRED' },
  retail: { kind: 'retail', title: '미국 소매판매',         includes: ['소매판매'],                        etTime: '08:30', fredId: 9,  source: 'Census · 일정 FRED' },
  fomc:   { kind: 'fomc',   title: 'FOMC 금리 결정',        includes: ['기준금리 결정', '성명'],            etTime: '14:00', fredId: null, source: '연준 공식 일정' },
  powell: { kind: 'powell', title: '연준 의장 기자회견',      includes: ['기자회견'],                        etTime: '14:30', fredId: null, source: '연준 공식 일정' },
};
export const MACRO_KINDS = Object.keys(MACRO_DEFS) as MacroKind[];
export const FRED_KINDS = MACRO_KINDS.filter((k) => MACRO_DEFS[k].fredId != null);

/** FOMC 결정일(회의 둘째 날) — 연준 공식 일정, 2026-11-02 federalreserve.gov 에서 확인. 2025-08-22 서면 표결은 발표 시각이 없어 제외 */
export const FOMC_DECISION_DATES = [
  '2024-01-31', '2024-03-20', '2024-05-01', '2024-06-12', '2024-07-31', '2024-09-18', '2024-11-07', '2024-12-18',
  '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18', '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10',
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
  '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09', '2027-07-28', '2027-09-15', '2027-10-27', '2027-12-08',
];

export interface MacroEvent {
  id: string;            // `${kind}-${YYYY-MM-DD}`
  kind: MacroKind;
  title: string;
  includes: string[];
  date: string;          // 미 동부 기준 발표일 YYYY-MM-DD
  ts: number;            // 발표 시각(UTC epoch ms)
  etTime: string;
  source: string;
}

/* ── 시간대 ─────────────────────────────────────────── */
const NY = 'America/New_York';
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function parts(ms: number, tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    fmtCache.set(tz, f);
  }
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}
/** 그 순간 시간대의 UTC 대비 오프셋(분). 뉴욕 EDT = −240, EST = −300 */
export function tzOffsetMin(ms: number, tz = NY): number {
  const p = parts(ms, tz);
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000) / 60_000;
}
/** 미 동부 벽시계 날짜·시각 → UTC epoch ms (서머타임 자동) */
export function etToUtc(ymd: string, hhmm: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off1 = tzOffsetMin(guess);
  let t = guess - off1 * 60_000;
  const off2 = tzOffsetMin(t);
  if (off2 !== off1) t = guess - off2 * 60_000;
  return t;
}
const pad = (n: number) => String(n).padStart(2, '0');
/** UTC ms → 'MM-DD HH:mm' (KST, UTC+9 고정·서머타임 없음) */
export function fmtKst(ms: number, withYear = false): string {
  const d = new Date(ms + 9 * 3600_000);
  const md = `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return withYear ? `${d.getUTCFullYear()}-${md}` : md;
}
/** UTC ms → 'HH:mm UTC' */
export function fmtUtc(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
/** UTC ms → 'HH:mm ET(EDT|EST)' */
export function fmtEt(ms: number): string {
  const p = parts(ms, NY);
  return `${pad(p.hour)}:${pad(p.minute)} ${tzOffsetMin(ms) === -240 ? 'EDT' : 'EST'}`;
}

/* ── 일정 만들기 ─────────────────────────────────────── */
function mk(kind: MacroKind, date: string): MacroEvent {
  const d = MACRO_DEFS[kind];
  return { id: `${kind}-${date}`, kind, title: d.title, includes: d.includes, date, ts: etToUtc(date, d.etTime), etTime: d.etTime, source: d.source };
}

/**
 * FRED 발표일(종류별 YYYY-MM-DD 목록) + FOMC 공식 일정 → 시각 오름차순 이벤트.
 * fredDates 에 없는 종류는 빠진다(추정해서 만들지 않음).
 */
export function buildSchedule(fredDates: Partial<Record<MacroKind, string[]>>, fomcDates: string[] = FOMC_DECISION_DATES): MacroEvent[] {
  const out: MacroEvent[] = [];
  for (const k of FRED_KINDS) for (const date of new Set(fredDates[k] ?? [])) if (/^\d{4}-\d{2}-\d{2}$/.test(date)) out.push(mk(k, date));
  for (const date of fomcDates) { out.push(mk('fomc', date)); out.push(mk('powell', date)); }
  return out.sort((a, b) => a.ts - b.ts || a.kind.localeCompare(b.kind));
}

/** 같은 시각(±windowMs)에 나온 다른 이벤트 — 단일 지표 영향 단정 금지용 */
export function coReleases(events: MacroEvent[], ev: MacroEvent, windowMs = 30 * 60_000): MacroEvent[] {
  return events.filter((e) => e.id !== ev.id && Math.abs(e.ts - ev.ts) <= windowMs);
}

export function nextEvent(events: MacroEvent[], now: number): MacroEvent | null {
  return events.find((e) => e.ts > now) ?? null;
}
export function lastEvent(events: MacroEvent[], now: number): MacroEvent | null {
  let r: MacroEvent | null = null;
  for (const e of events) if (e.ts <= now) r = e; else break;
  return r;
}

export interface EventWindowSettings { preMin: number; postMin: number; extendMaxMin: number }
export type EventWindowState =
  | { state: 'pre'; event: MacroEvent; minutes: number }      // 발표 전 preMin 안 — minutes = 발표까지 남은 분
  | { state: 'post'; event: MacroEvent; minutes: number }     // 발표 후 postMin 안 — minutes = 발표 후 지난 분
  | { state: 'settling'; event: MacroEvent; minutes: number } // postMin ~ extendMaxMin — 변동성 정상화 확인 대상
  | { state: 'clear'; next: MacroEvent | null; minutesToNext: number | null };

/**
 * 지금이 발표 전후 관망 구간인가. 여러 이벤트가 겹치면 가장 제한이 강한 쪽(pre/post > settling)을 고른다.
 * 'settling' 은 그 자체로 관망이 아니라 "변동성·스프레드가 정상화됐는지 확인하라"는 뜻(판정은 riskControl).
 */
export function eventWindow(events: MacroEvent[], now: number, s: EventWindowSettings): EventWindowState {
  let settling: EventWindowState | null = null;
  for (const e of events) {
    const dMin = (now - e.ts) / 60_000;
    if (dMin < 0 && -dMin <= s.preMin) return { state: 'pre', event: e, minutes: Math.ceil(-dMin) };
    if (dMin >= 0 && dMin < s.postMin) return { state: 'post', event: e, minutes: Math.floor(dMin) };
    if (dMin >= s.postMin && dMin < s.extendMaxMin && !settling) settling = { state: 'settling', event: e, minutes: Math.floor(dMin) };
  }
  if (settling) return settling;
  const nx = nextEvent(events, now);
  return { state: 'clear', next: nx, minutesToNext: nx ? Math.ceil((nx.ts - now) / 60_000) : null };
}

/** 'N시간 M분' */
export function humanMin(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 48) return r ? `${h}시간 ${r}분` : `${h}시간`;
  return `${Math.floor(h / 24)}일 ${h % 24}시간`;
}
