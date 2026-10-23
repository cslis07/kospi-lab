/**
 * 거시 이벤트 캘린더 — SoSoValue OpenAPI(GET /macro/events + /macro/events/{event}/history 컨센서스).
 * 키(SOSOVALUE_API_KEY)가 없거나 실패하면 빈 목록(달력은 기존 정적 일정·나우캐스트만으로 정상 표시).
 * 분당 20회 한도라 컨센서스(history)는 앞으로 7일 안 이벤트 중 최대 8개만, 6시간 캐시.
 */
import { NextResponse } from 'next/server';
import { flattenEvents, classify, type SosoDay, type MacroRelease } from '@/lib/macroEvents';

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
  const events = flattenEvents(days ?? []);
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const week = new Date(Date.now() + (9 + 24 * 7) * 3600e3).toISOString().slice(0, 10);
  const soon = [...new Map(events.filter((e) => e.date >= today && e.date <= week).map((e) => [e.name, e])).values()].slice(0, 8);
  const upcoming: MacroRelease[] = [];
  await Promise.all(soon.map(async (e) => {
    const hist = (await soso(`/macro/events/${encodeURIComponent(e.name)}/history?limit=3`, key).catch(() => null)) as
      { date: string; actual: string; forecast: string; previous: string }[] | null;
    const row = hist?.find((h) => h.date?.slice(0, 10) === e.date) ?? hist?.[0];
    if (row) upcoming.push({ date: e.date, name: e.name, ko: classify(e.name).ko, actual: row.actual ?? '', forecast: row.forecast ?? '', previous: row.previous ?? '' });
  }));
  upcoming.sort((a, b) => (a.date < b.date ? -1 : 1));
  return NextResponse.json({ events, upcoming, source: 'SoSoValue' }, {
    headers: { 'Cache-Control': days ? 's-maxage=21600, stale-while-revalidate=86400' : 's-maxage=120' },
  });
}
