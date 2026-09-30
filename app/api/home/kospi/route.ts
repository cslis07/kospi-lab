import { NextResponse } from 'next/server';

/**
 * 홈 큰 차트 — 코스피 일봉(라인/캔들 공용). 네이버 차트 API(무키, 로컬·프로덕션 동작).
 * 최근 250영업일을 받아 52주 최저·최고를 구하고, 표시는 최근 chartN개.
 * ?code=KOSPI|KOSDAQ (기본 KOSPI)
 */
export const revalidate = 120;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  Referer: 'https://m.stock.naver.com/',
  Accept: 'application/json',
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface Candle { d: string; o: number; h: number; l: number; c: number }

export async function GET(req: Request) {
  const codeRaw = new URL(req.url).searchParams.get('code') ?? 'KOSPI';
  const code = codeRaw === 'KOSDAQ' ? 'KOSDAQ' : 'KOSPI';
  try {
    const res = await fetch(
      `https://api.stock.naver.com/chart/domestic/index/${code}?periodType=dayCandle&count=250`,
      { headers: HEADERS, next: { revalidate: 120 }, signal: AbortSignal.timeout(9000) },
    );
    if (!res.ok) return NextResponse.json({ candles: [], week52High: null, week52Low: null });
    const j = await res.json();
    const rows: { localDate: string; openPrice: number; highPrice: number; lowPrice: number; closePrice: number }[] = j?.priceInfos ?? [];
    const all = rows
      .filter((r) => typeof r.closePrice === 'number' && r.closePrice > 0)
      .map<Candle>((r) => ({
        d: `${r.localDate.slice(0, 4)}-${r.localDate.slice(4, 6)}-${r.localDate.slice(6, 8)}`,
        o: r2(r.openPrice), h: r2(r.highPrice), l: r2(r.lowPrice), c: r2(r.closePrice),
      }));
    if (!all.length) return NextResponse.json({ candles: [], week52High: null, week52Low: null });

    const week52High = Math.max(...all.map((c) => c.h));
    const week52Low = Math.min(...all.map((c) => c.l));
    const chartN = 60;
    const candles = all.slice(-chartN);
    const value = all[all.length - 1].c;
    const prev = all.length >= 2 ? all[all.length - 2].c : value;

    return NextResponse.json(
      {
        code,
        candles,
        value: r2(value),
        change: r2(value - prev),
        changeRate: r2(prev ? ((value - prev) / prev) * 100 : 0),
        week52High: r2(week52High),
        week52Low: r2(week52Low),
        asOf: all[all.length - 1].d,
      },
      { headers: { 'Cache-Control': 's-maxage=120, stale-while-revalidate=600' } },
    );
  } catch {
    return NextResponse.json({ candles: [], week52High: null, week52Low: null });
  }
}
