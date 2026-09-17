/**
 * 코스피 1개월 일봉 종가 — 모바일 홈 히어로 스파크라인용(공개·경량).
 * /api/market 은 헤더가 10초마다 폴링하므로 느린 히스토리 호출을 섞지 않고 분리했다.
 * Yahoo ^KS11 은 로컬 Node 에서 HeadersOverflowError 가 날 수 있어 실패 시 빈 배열(스파크라인만 숨김).
 */
import { NextResponse } from 'next/server';

export const revalidate = 300;

export async function GET() {
  try {
    const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EKS11?range=1mo&interval=1d', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return NextResponse.json({ points: [], asOf: null });
    const r = (await res.json())?.chart?.result?.[0];
    const ts: number[] = r?.timestamp ?? [];
    const closes: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
    const rows = closes
      .map((c, i) => ({ c, t: ts[i] }))
      .filter((p): p is { c: number; t: number } => typeof p.c === 'number' && p.c > 0);
    const last = rows[rows.length - 1];
    return NextResponse.json(
      { points: rows.map((p) => Math.round(p.c * 100) / 100), asOf: last ? new Date(last.t * 1000).toISOString().slice(0, 10) : null },
      { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' } },
    );
  } catch {
    return NextResponse.json({ points: [], asOf: null });
  }
}
