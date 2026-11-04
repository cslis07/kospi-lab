/**
 * 경제 캘린더 일정 정합 — 공식 일정(/api/risk/events: 날짜 FRED release calendar·FOMC 연준 공식, 시각 기관 표준 08:30 ET 등)을
 * 하나의 기준으로 삼아 달력 그리드·이번 주 표·아래 목록이 같은 날짜를 쓰게 한다. 순수 함수(테스트: tests/calendarOfficial.test.ts).
 *
 * 규칙
 *  - 공식 일정이 있는 지표(CPI·PPI·고용·PCE·GDP·소매판매·FOMC)는 공식 날짜가 우선. 수동 일정(lib/calendarEvents)과
 *    외부 제공업체(SoSoValue) 날짜가 다르면 공식으로 맞춘다(±2일 안의 같은 지표만 — 다른 달 발표를 끌어오지 않음).
 *  - 시각은 미 동부시간(서머타임 포함, America/New_York) → KST 로 변환한 값. 고정 +13h 같은 근사 없음.
 *  - 공식 일정을 못 받으면(오프라인·API 실패) 기존 정적 일정을 그대로 쓴다 — 없는 확정 일시를 만들지 않는다.
 */
import type { CalendarEvent } from './types';
import { MACRO_DEFS, type MacroEvent, type MacroKind } from './macroSchedule';

export const CAL_KINDS: MacroKind[] = ['cpi', 'ppi', 'jobs', 'pce', 'gdp', 'retail', 'fomc'];

const TITLE: Partial<Record<MacroKind, string>> = {
  cpi: '미국 CPI (소비자물가)', ppi: '미국 PPI (생산자물가)', jobs: '미국 고용보고서 (NFP)', pce: '미국 PCE (개인소비지출 물가)',
  gdp: '미국 GDP', retail: '미국 소매판매', fomc: 'FOMC 금리 결정',
};
const IMPORTANCE: Partial<Record<MacroKind, CalendarEvent['importance']>> = { cpi: 'high', jobs: 'high', pce: 'high', fomc: 'high', ppi: 'medium', gdp: 'medium', retail: 'medium' };

export type OfficialCalEvent = CalendarEvent & { kind: MacroKind; ts: number; official: true };

const pad = (n: number) => String(n).padStart(2, '0');
/** UTC ms → KST 'YYYY-MM-DD' / 'HH:mm' */
export const kstDate = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
const kstHm = (ms: number) => { const d = new Date(ms + 9 * 3600_000); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };

/** 공식 일정 → 캘린더 행. date 는 미 동부 기준 발표일(기존 화면 관례), 시각은 KST(날짜가 넘어가면 '익일') */
export function officialToCalendar(evts: MacroEvent[]): OfficialCalEvent[] {
  return evts
    .filter((e) => CAL_KINDS.includes(e.kind))
    .map((e) => ({
      date: e.date,
      title: TITLE[e.kind] ?? e.title,
      category: e.kind === 'fomc' ? 'fomc' : 'indicator',
      country: 'US',
      importance: IMPORTANCE[e.kind] ?? 'medium',
      timeKst: `${kstDate(e.ts) !== e.date ? '익일 ' : ''}${kstHm(e.ts)}`,
      desc: `공식 일정(${MACRO_DEFS[e.kind].source})`,
      kind: e.kind, ts: e.ts, official: true as const,
    }));
}

/** 수동 일정 제목 → 공식 일정 종류(같은 지표 판별) */
export function kindOfTitle(title: string): MacroKind | null {
  if (/FOMC 금리/.test(title)) return 'fomc';
  if (/CPI/.test(title)) return 'cpi';
  if (/PPI/.test(title)) return 'ppi';
  if (/PCE/.test(title)) return 'pce';
  if (/고용보고서|NFP/.test(title)) return 'jobs';
  if (/GDP/.test(title)) return 'gdp';
  if (/소매판매/.test(title)) return 'retail';
  return null;
}

/**
 * 수동 일정 + 공식 일정. 공식 일정이 다루는 종류의 미국 일정은, 공식 일정 기간(첫~마지막 날) 안이면 수동 것을 빼고 공식 것을 쓴다.
 * 기간 밖(공식 데이터가 아직 없는 먼 미래·먼 과거)은 수동 일정을 남긴다.
 */
export function mergeOfficial(manual: CalendarEvent[], official: OfficialCalEvent[]): CalendarEvent[] {
  if (!official.length) return manual;
  const range = new Map<MacroKind, [string, string]>();
  for (const e of official) {
    const r = range.get(e.kind);
    range.set(e.kind, r ? [e.date < r[0] ? e.date : r[0], e.date > r[1] ? e.date : r[1]] : [e.date, e.date]);
  }
  const keep = manual.filter((m) => {
    if (m.country !== 'US') return true;
    const k = kindOfTitle(m.title);
    const r = k ? range.get(k) : undefined;
    return !(r && m.date >= r[0] && m.date <= r[1]);
  });
  return [...keep, ...official];
}

/** 외부 제공업체 키(lib/macroEvents classify) → 공식 일정 종류 */
const PROVIDER_KIND: Record<string, MacroKind> = { cpi: 'cpi', ppi: 'ppi', jobs: 'jobs', pce: 'pce', gdp: 'gdp', retail: 'retail', fomc: 'fomc' };

/**
 * 외부 제공업체 일정의 날짜를 공식 일정에 맞춘다 — 같은 종류의 공식 발표가 ±maxDays 안에 있으면 그 날짜로.
 * 원래 날짜는 providerDate 로 남긴다(화면에서 '공식 일정 기준' 표기용).
 */
export function snapToOfficial<T extends { date: string; key: string | null }>(evts: T[], official: MacroEvent[], maxDays = 2): (T & { providerDate?: string })[] {
  const day = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`) / 86_400_000;
  return evts.map((e) => {
    const k = e.key ? PROVIDER_KIND[e.key] : undefined;
    if (!k) return e;
    let best: MacroEvent | null = null;
    for (const o of official) {
      if (o.kind !== k) continue;
      const g = Math.abs(day(o.date) - day(e.date));
      if (g <= maxDays && (!best || g < Math.abs(day(best.date) - day(e.date)))) best = o;
    }
    return best && best.date !== e.date ? { ...e, date: best.date, providerDate: e.date } : e;
  });
}
