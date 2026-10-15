import { NextResponse } from 'next/server';
import { krIndexLive, krIndexIntegration, indexMinute, indexDaily, worldIndexLive, kstYmd } from '@/lib/naverIndex';

/**
 * 홈 중앙 보드 — 지수 1개(국내 KOSPI|KOSDAQ / 해외 NASDAQ|SP500|DOW)의 실시간 시세 + 기간별 차트 + 시장현황.
 *  ?code=KOSPI|KOSDAQ|NASDAQ|SP500|DOW  ?range=1d(당일 분봉)|1m|3m|1y(일봉)
 * 국내: 시장현황(상승·보합·하락, 상·하한)·투자자·프로그램매매·52주·전일종가는 네이버 integration(실시간) 기준.
 *  → 이전 KRX 집계는 '전 거래일' 데이터였고, 52주는 차트 API 가 기간을 무시해 틀렸었다(5,262 vs 실제 3,440).
 * 해외(나스닥·S&P500·다우·닛케이·항셍·DAX·FTSE): 분봉 미제공이라 1일 요청은 1개월 일봉으로 대체, 투자자·프로그램·시장현황은 해당 없음(null).
 *  52주는 1년 일봉에서 계산. reutersCode = .IXIC / .INX / .DJI / .N225 / .HSI / .GDAXI / .FTSE.
 */
export const revalidate = 0;

const RANGE_DAYS: Record<string, number> = { '1m': 31, '3m': 92, '1y': 366 };
// 해외는 분봉이 없어 일봉만 — 기간별 표시 봉 수(거래일 기준 근사)
const US_BARS: Record<string, number> = { '1m': 22, '3m': 66, '1y': 260 };
// 해외 지수 코드 → 네이버 reutersCode (미국·아시아)
const US_REUTERS: Record<string, string> = { NASDAQ: '.IXIC', SP500: '.INX', DOW: '.DJI', NIKKEI: '.N225', HANGSENG: '.HSI', DAX: '.GDAXI', FTSE: '.FTSE' };

export interface BoardPoint { x: string; o: number; h: number; l: number; c: number }

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const codeParam = sp.get('code') ?? '';
  let range = ['1d', '1m', '3m', '1y', 'ytd'].includes(sp.get('range') ?? '') ? (sp.get('range') as string) : '1d';
  // YTD(연초 대비) — 올해 1월 1일부터 오늘까지 일봉
  const todayYmd = kstYmd(0);
  const yearStartDash = `${todayYmd.slice(0, 4)}-01-01`;
  const ytdDays = Math.ceil((Date.now() - Date.parse(`${todayYmd.slice(0, 4)}-01-01T00:00:00+09:00`)) / 86400000) + 2;

  // ── 해외 지수(나스닥·S&P500·다우): 분봉 없음 → 일봉, 부가정보 없음 ──
  const reuters = US_REUTERS[codeParam];
  if (reuters) {
    if (range === '1d') range = '1m';
    const [live, all] = await Promise.all([worldIndexLive(reuters), indexDaily('foreign', reuters, 366)]);
    const bars = US_BARS[range] ?? 22;
    const sel = range === 'ytd' ? all.filter((d) => d.d >= yearStartDash) : all.slice(-bars);
    const points: BoardPoint[] = sel.map((d) => ({ x: d.d, o: d.o, h: d.h, l: d.l, c: d.c }));
    const y1 = all.slice(-260);
    const week52High = y1.length ? Math.max(...y1.map((d) => d.h)) : null;
    const week52Low = y1.length ? Math.min(...y1.map((d) => d.l)) : null;
    const prevClose = live ? live.value - live.change : (all.at(-1)?.c ?? 0);
    return NextResponse.json(
      { code: codeParam, range, tradingDate: null, live, prevClose, points, week52High, week52Low, upDown: null, investor: null, program: null, asOf: new Date().toISOString() },
      { headers: { 'Cache-Control': 's-maxage=120, stale-while-revalidate=3600' } },
    );
  }

  const code: 'KOSPI' | 'KOSDAQ' = codeParam === 'KOSDAQ' ? 'KOSDAQ' : 'KOSPI';
  const [live, integ] = await Promise.all([krIndexLive(code), krIndexIntegration(code)]);

  let points: BoardPoint[] = [];
  let tradingDate: string | null = null;
  if (range === '1d') {
    const ymd = live?.tradedAt && /^\d{4}-\d{2}-\d{2}/.test(live.tradedAt) ? live.tradedAt.slice(0, 10).replace(/-/g, '') : kstYmd(0);
    tradingDate = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
    points = (await indexMinute(code, ymd)).map((m) => ({ x: m.t, o: m.o, h: m.h, l: m.l, c: m.c }));
  } else {
    const days = range === 'ytd' ? ytdDays : RANGE_DAYS[range];
    let rows = await indexDaily('domestic', code, days);
    if (range === 'ytd') rows = rows.filter((d) => d.d >= yearStartDash); // 연초 이후만(전년 말일 제외)
    points = rows.map((d) => ({ x: d.d, o: d.o, h: d.h, l: d.l, c: d.c }));
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
