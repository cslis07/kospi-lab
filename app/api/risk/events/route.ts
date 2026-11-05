import { NextResponse } from 'next/server';
import { fetchOfficialSchedule } from '@/lib/officialSchedule';

/**
 * 미국 주요 경제지표 발표 일정(시각 포함) — /risk-control·/event-lab 공용.
 * 날짜는 FRED release calendar(과거 실제 + 예정), FOMC 는 연준 공식 일정(lib/macroSchedule 고정 목록), 시각은 기관 표준 발표 시각.
 * FRED 키가 없거나 일부 실패하면 그 종류는 빼고 missing 에 적는다(추정해서 채우지 않음).
 * FRED 호출 6회 — 12시간 캐시(일정은 거의 안 바뀐다). 조회 코드는 lib/officialSchedule(브리핑·분석 API 와 공용).
 */
export const maxDuration = 20;

export async function GET() {
  const { events, missing } = await fetchOfficialSchedule();
  return NextResponse.json(
    {
      events, missing, asOf: Date.now(),
      note: '날짜: FRED release calendar · FOMC: 연준 공식 일정 · 시각: 기관 표준 발표 시각(08:30 ET, FOMC 14:00 ET·기자회견 14:30 ET)',
    },
    { headers: { 'Cache-Control': missing.length ? 's-maxage=300' : 's-maxage=43200, stale-while-revalidate=86400' } },
  );
}
