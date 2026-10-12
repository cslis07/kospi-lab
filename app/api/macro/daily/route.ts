import { NextResponse } from 'next/server';
import { withCdn } from '@/lib/cdn';
import { indexDaily } from '@/lib/naverIndex';
import type { PricePoint } from '@/lib/releaseReaction';

// 서프라이즈 반응 분석용 일별 종가 — BTC·S&P500(FRED), 코스피(네이버). 2021-01-01~.
// 느리게 바뀌는 과거 시계열이라 길게 캐시.

async function fredDaily(id: string): Promise<PricePoint[]> {
  const key = process.env.FRED_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&sort_order=asc&observation_start=2021-01-01`,
      { next: { revalidate: 21600 }, signal: AbortSignal.timeout(12000) },
    );
    if (!res.ok) return [];
    const j = (await res.json()) as { observations?: { date: string; value: string }[] };
    return (j.observations ?? [])
      .filter((o) => o.value !== '.' && o.value !== '')
      .map((o) => ({ date: o.date, close: Number(o.value) }))
      .filter((p) => Number.isFinite(p.close));
  } catch { return []; }
}

async function kospiDaily(): Promise<PricePoint[]> {
  try {
    const rows = await indexDaily('domestic', 'KOSPI', 2200); // ~6년 → 2021 커버
    return rows
      .map((r) => ({ date: r.d, close: r.c }))
      .filter((p) => p.date >= '2021-01-01' && Number.isFinite(p.close));
  } catch { return []; }
}

async function handler() {
  const [btc, sp, nasdaq, kospi] = await Promise.all([
    fredDaily('CBBTCUSD'),
    fredDaily('SP500'),
    fredDaily('NASDAQCOM'),
    kospiDaily(),
  ]);
  return NextResponse.json({ btc, sp, nasdaq, kospi });
}

export const GET = withCdn(handler, 21600, 86400);
export const maxDuration = 30;
