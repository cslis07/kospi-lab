import { NextResponse } from 'next/server';
import { krIndexLive, krIndexIntegration, indexMinute, indexDaily, kstYmd } from '@/lib/naverIndex';

/**
 * 홈 중앙 보드 — 국내 지수 1개(KOSPI|KOSDAQ)의 실시간 시세 + 기간별 차트 + 시장현황 일체.
 *  ?code=KOSPI|KOSDAQ  ?range=1d(당일 분봉)|1m|3m|1y(일봉)
 * 시장현황(상승·보합·하락, 상·하한)·투자자·프로그램매매·52주·전일종가는 네이버 integration(실시간) 기준.
 *  → 이전 KRX 집계는 '전 거래일' 데이터였고, 52주는 차트 API 가 기간을 무시해 틀렸었다(5,262 vs 실제 3,440).
 */
export const revalidate = 0;

const RANGE_DAYS: Record<string, number> = { '1m': 31, '3m': 92, '1y': 366 };

export interface BoardPoint { x: string; o: number; h: number; l: number; c: number }

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const code = sp.get('code') === 'KOSDAQ' ? 'KOSDAQ' : 'KOSPI';
  const range = ['1d', '1m', '3m', '1y'].includes(sp.get('range') ?? '') ? (sp.get('range') as string) : '1d';

  const [live, integ] = await Promise.all([krIndexLive(code), krIndexIntegration(code)]);

  let points: BoardPoint[] = [];
  let tradingDate: string | null = null;
  if (range === '1d') {
    const ymd = live?.tradedAt && /^\d{4}-\d{2}-\d{2}/.test(live.tradedAt) ? live.tradedAt.slice(0, 10).replace(/-/g, '') : kstYmd(0);
    tradingDate = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
    points = (await indexMinute(code, ymd)).map((m) => ({ x: m.t, o: m.o, h: m.h, l: m.l, c: m.c }));
  } else {
    points = (await indexDaily('domestic', code, RANGE_DAYS[range])).map((d) => ({ x: d.d, o: d.o, h: d.h, l: d.l, c: d.c }));
  }

  const prevClose = integ?.prevClose || (live ? live.value - live.change : 0);

  return NextResponse.json(
    {
      code, range, tradingDate,
      live,
      prevClose,
      points,
      week52High: integ?.week52High ?? null,
      week52Low: integ?.week52Low ?? null,
      upDown: integ?.upDown ?? null,
      investor: integ?.investor ?? null,
      program: integ?.program ?? null,
      asOf: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': range === '1d' ? 's-maxage=15, stale-while-revalidate=600' : 's-maxage=120, stale-while-revalidate=3600' } },
  );
}
