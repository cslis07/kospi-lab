/**
 * 거시 이벤트 캘린더 — SoSoValue OpenAPI(GET /macro/events + /macro/events/{event}/history 컨센서스).
 * 키(SOSOVALUE_API_KEY)가 없거나 실패하면 빈 목록(달력은 기존 정적 일정·나우캐스트만으로 정상 표시).
 * 분당 20회 한도라 컨센서스(history)는 앞으로 7일 안 이벤트 중 최대 8개만, 6시간 캐시.
 */
import { NextResponse } from 'next/server';
import { flattenEvents, classify, pickRelease, type SosoDay, type MacroRelease } from '@/lib/macroEvents';
import { providerDayOffset, shiftYmd } from '@/lib/calendarOfficial';
import { officialEventsWithin } from '@/lib/officialSchedule';

export const maxDuration = 20;
export const revalidate = 0;

const BASE = 'https://openapi.sosovalue.com/openapi/v1';
const unwrap = (raw: unknown): unknown[] | null => {
  const env = raw as { code?: number; data?: unknown } | null;
  return Array.isArray(raw) ? raw : env?.code === 0 && Array.isArray(env.data) ? env.data : null;
};

async function soso(path: string, key: string): Promise<unknown[] | null> {
  const res = await fetch(`${BASE}${path}`, { headers: { 'x-soso-api-key': key }, signal: AbortSignal.timeout(8000), next: { revalidate: 21600 } });
  if (!res.ok) return null;
  return unwrap(await res.json().catch(() => null));
}

export async function GET() {
  const key = process.env.SOSOVALUE_API_KEY?.trim();
  if (!key) return NextResponse.json({ events: [], upcoming: [], note: 'SOSOVALUE_API_KEY 없음' }, { headers: { 'Cache-Control': 's-maxage=300' } });
  const days = (await soso('/macro/events', key).catch(() => null)) as SosoDay[] | null;
  const raw = flattenEvents(days ?? []);
  // SoSoValue 날짜가 공식 일정보다 일관되게 하루 이르다(2026-11 실측) — 공식 일정과 겹치는 종류로 오프셋을 재서 전체를 옮긴다.
  // 7일 창 필터도 옮긴 날짜로(예전엔 보정 전 날짜로 걸러 '오늘 발표'가 어제로 보여 표에서 빠졌다).
  const offset = providerDayOffset(raw, await officialEventsWithin(3000));
  const events = raw.map((e) => (offset ? { ...e, date: shiftYmd(e.date, offset), providerDate: e.date } : e));
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const week = new Date(Date.now() + (9 + 24 * 7) * 3600e3).toISOString().slice(0, 10);
  const soon = [...new Map(events.filter((e) => e.date >= today && e.date <= week).map((e) => [e.name, e])).values()].slice(0, 8);
  const upcoming: MacroRelease[] = [];
  await Promise.all(soon.map(async (e) => {
    const hist = (await soso(`/macro/events/${encodeURIComponent(e.name)}/history?limit=3`, key).catch(() => null)) as
      { date: string; actual: string; forecast: string; previous: string }[] | null;
    if (!hist) return;
    // 이력(history) 날짜는 제공업체 기준이라 원래 날짜로 짝짓고, 내보내는 날짜는 보정값
    upcoming.push({ date: e.date, name: e.name, ko: classify(e.name).ko, ...pickRelease(hist, 'providerDate' in e && e.providerDate ? e.providerDate : e.date) });
  }));
  upcoming.sort((a, b) => (a.date < b.date ? -1 : 1));
  return NextResponse.json({ events, upcoming, source: 'SoSoValue', dayOffset: offset }, {
    headers: { 'Cache-Control': days ? 's-maxage=21600, stale-while-revalidate=86400' : 's-maxage=120' },
  });
}
