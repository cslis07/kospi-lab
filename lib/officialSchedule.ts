/**
 * 공식 경제 일정(서버 전용) — 날짜 FRED release calendar(과거 실제 + 예정), FOMC 연준 공식 목록, 시각 기관 표준 발표 시각.
 * /api/risk/events 와 모닝 브리핑·코인 분석·종목 분석이 같은 일정을 쓰게 하는 단일 출처.
 *
 * - FRED 호출 6회는 Next 데이터 캐시 12시간 + 모듈 캐시 12시간 → 대부분의 요청은 네트워크 0회.
 * - 키가 없거나 실패·시간 초과면 그 종류는 빼고(missing), 캘린더 병합은 정적 일정(lib/calendarEvents)을 그대로 쓴다.
 *   없는 확정 일시를 만들지 않는다.
 */
import { buildSchedule, FRED_KINDS, MACRO_DEFS, type MacroEvent, type MacroKind } from './macroSchedule';
import { CALENDAR_EVENTS } from './calendarEvents';
import { mergeOfficial, officialToCalendar } from './calendarOfficial';
import type { CalendarEvent } from './types';

const FROM = '2024-01-01', TO = '2027-12-31';
const TTL = 12 * 3600_000;

async function fredDates(id: number, key: string): Promise<string[]> {
  const u = `https://api.stlouisfed.org/fred/release/dates?release_id=${id}&api_key=${key}&file_type=json&realtime_start=${FROM}&realtime_end=${TO}&include_release_dates_with_no_data=true&sort_order=asc&limit=1000`;
  const r = await fetch(u, { signal: AbortSignal.timeout(8000), next: { revalidate: 43200 } });
  if (!r.ok) throw new Error(`FRED ${r.status}`);
  const j = (await r.json()) as { release_dates?: { date: string }[] };
  if (!Array.isArray(j.release_dates)) throw new Error('FRED 형식 오류');
  return j.release_dates.map((d) => d.date);
}

export interface OfficialSchedule { events: MacroEvent[]; missing: string[] }

/** FRED 일정 + FOMC → 공식 이벤트. missing = 못 받은 종류 제목 */
export async function fetchOfficialSchedule(): Promise<OfficialSchedule> {
  const key = process.env.FRED_API_KEY?.trim();
  const dates: Partial<Record<MacroKind, string[]>> = {};
  const missing: string[] = [];
  if (!key) missing.push(...FRED_KINDS.map((k) => MACRO_DEFS[k].title));
  else {
    await Promise.all(FRED_KINDS.map(async (k) => {
      try { dates[k] = await fredDates(MACRO_DEFS[k].fredId!, key); }
      catch { missing.push(MACRO_DEFS[k].title); }
    }));
  }
  return { events: buildSchedule(dates), missing };
}

let _cache: { at: number; events: MacroEvent[] } | null = null;
let _inflight: Promise<MacroEvent[]> | null = null;

/** 공식 이벤트(모듈 캐시). FRED 가 하나도 안 오면(전부 missing) 캐시하지 않고 [] — 정적 일정으로 대체된다 */
async function officialEvents(): Promise<MacroEvent[]> {
  if (_cache && Date.now() - _cache.at < TTL) return _cache.events;
  _inflight ??= fetchOfficialSchedule()
    .then(({ events, missing }) => {
      if (missing.length < FRED_KINDS.length) { _cache = { at: Date.now(), events }; return events; }
      return [];
    })
    .catch(() => [] as MacroEvent[])
    .finally(() => { _inflight = null; });
  return _inflight;
}

/**
 * 앱 캘린더 일정(정적) + 공식 일정 병합 — 공식 일정이 다루는 미국 지표·FOMC 는 공식 날짜·시각으로 바뀐다(행에 ts 포함).
 * waitMs 안에 공식 일정이 안 오면 정적 일정만(응답을 늦추지 않음). 실패해도 throw 하지 않는다.
 */
export async function calendarWithOfficial(waitMs = 3000): Promise<(CalendarEvent & { ts?: number })[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<MacroEvent[]>((res) => { timer = setTimeout(() => res([]), waitMs); });
  const evts = await Promise.race([officialEvents(), timeout]).finally(() => clearTimeout(timer));
  return mergeOfficial(CALENDAR_EVENTS, officialToCalendar(evts));
}
