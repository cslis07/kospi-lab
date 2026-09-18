/**
 * 해외 종목 일봉 — 해외 상세 화면 차트용(공개). Yahoo v8 chart, 1·3·6·12개월.
 * 출력은 국내 차트(/api/stock/[ticker]/chart)와 같은 ChartPoint[] (date=YYYYMMDD, USD 소수 2자리).
 */
import { NextRequest, NextResponse } from 'next/server';
import type { ChartPoint } from '@/lib/types';

const RANGE: Record<number, string> = { 1: '1mo', 3: '3mo', 6: '6mo', 12: '1y' };
const HEADERS = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };
const r2 = (n: number | null | undefined) => (n == null ? undefined : Math.round(n * 100) / 100);

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get('symbol') ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9.\-^=]{1,15}$/.test(symbol)) return NextResponse.json({ error: 'symbol 형식 오류' }, { status: 400 });
  const months = [1, 3, 6, 12].includes(Number(req.nextUrl.searchParams.get('months'))) ? Number(req.nextUrl.searchParams.get('months')) : 1;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${RANGE[months]}&includePrePost=false`;
  try {
    let res = await fetch(url, { headers: HEADERS, next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) res = await fetch(url.replace('query1', 'query2'), { headers: HEADERS, next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return NextResponse.json([]);
    const r = (await res.json())?.chart?.result?.[0];
    const ts: number[] = r?.timestamp ?? [];
    const q = r?.indicators?.quote?.[0] ?? {};
    const out: ChartPoint[] = [];
    ts.forEach((t, i) => {
      const c = q.close?.[i];
      if (typeof c !== 'number' || c <= 0) return;
      const d = new Date(t * 1000);
      out.push({
        date: `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`,
        price: r2(c)!, open: r2(q.open?.[i]), high: r2(q.high?.[i]), low: r2(q.low?.[i]), volume: q.volume?.[i] ?? undefined,
      });
    });
    return NextResponse.json(out, { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=900' } });
  } catch {
    return NextResponse.json([]);
  }
}
