import { NextResponse } from 'next/server';
import { buildSchedule, FRED_KINDS, MACRO_DEFS, type MacroKind } from '@/lib/macroSchedule';

/**
 * 미국 주요 경제지표 발표 일정(시각 포함) — /risk-control·/event-lab 공용.
 * 날짜는 FRED release calendar(과거 실제 + 예정), FOMC 는 연준 공식 일정(lib/macroSchedule 고정 목록), 시각은 기관 표준 발표 시각.
 * FRED 키가 없거나 일부 실패하면 그 종류는 빼고 missing 에 적는다(추정해서 채우지 않음).
 * FRED 호출 6회 — 12시간 캐시(일정은 거의 안 바뀐다).
 */
export const maxDuration = 20;

const FROM = '2024-01-01', TO = '2027-12-31';

async function fredDates(id: number, key: string): Promise<string[]> {
  const u = `https://api.stlouisfed.org/fred/release/dates?release_id=${id}&api_key=${key}&file_type=json&realtime_start=${FROM}&realtime_end=${TO}&include_release_dates_with_no_data=true&sort_order=asc&limit=1000`;
  const r = await fetch(u, { signal: AbortSignal.timeout(8000), next: { revalidate: 43200 } });
  if (!r.ok) throw new Error(`FRED ${r.status}`);
  const j = (await r.json()) as { release_dates?: { date: string }[] };
  if (!Array.isArray(j.release_dates)) throw new Error('FRED 형식 오류');
  return j.release_dates.map((d) => d.date);
}

export async function GET() {
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
  const events = buildSchedule(dates);
  return NextResponse.json(
    {
      events, missing, asOf: Date.now(),
      note: '날짜: FRED release calendar · FOMC: 연준 공식 일정 · 시각: 기관 표준 발표 시각(08:30 ET, FOMC 14:00 ET·기자회견 14:30 ET)',
    },
    { headers: { 'Cache-Control': missing.length ? 's-maxage=300' : 's-maxage=43200, stale-while-revalidate=86400' } },
  );
}
