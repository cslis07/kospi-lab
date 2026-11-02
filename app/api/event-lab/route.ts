import { NextResponse } from 'next/server';
import { studyEvent, oiChange, fundingAround, type Bar, type StudyResult } from '@/lib/eventStudy';

/**
 * 발표 전후 분석 데이터 — ?symbol=BTCUSDT&ts=<발표 UTC ms>&cmp=<과거 같은 지표 발표 ms,…(최대 8)>
 * 바이낸스 USDT 무기한 공개 시세(1분봉·5분봉·OI 5분 기록·펀딩 정산 기록). 계산은 lib/eventStudy(테스트 고정).
 * ⚠ 과거 분석 — 발표 이후 데이터가 들어 있다. 실시간 매매 판단에 쓰지 않는다.
 * 바이낸스 OI 기록은 최근 30일만 제공 → 그보다 오래된 발표는 OI 를 비워 둔다(추정 안 함).
 * 24시간이 지난 발표는 결과가 바뀌지 않으므로 하루 캐시.
 */
export const preferredRegion = 'icn1';
export const maxDuration = 30;

const B = 'https://fapi.binance.com';
const M = 60_000, H = 3600_000;
const UA = { 'User-Agent': 'Mozilla/5.0' };
async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: UA, cache: 'no-store', signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}
type K = [number, string, string, string, string, string, ...unknown[]];
const toBars = (rows: K[], now: number, step: number): Bar[] =>
  rows.map((r) => ({ ts: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] })).filter((b) => b.ts + step <= now);

async function bars(symbol: string, T: number, now: number) {
  const [m1, m5] = await Promise.allSettled([
    get<K[]>(`${B}/fapi/v1/klines?symbol=${symbol}&interval=1m&startTime=${T - 65 * M}&limit=305`),
    get<K[]>(`${B}/fapi/v1/klines?symbol=${symbol}&interval=5m&startTime=${T - 60 * M}&limit=300`),
  ]);
  return {
    m1: m1.status === 'fulfilled' ? toBars(m1.value, now, M) : [],
    m5: m5.status === 'fulfilled' ? toBars(m5.value, now, 5 * M) : [],
    errors: [m1.status === 'rejected' ? '1분봉' : null, m5.status === 'rejected' ? '5분봉' : null].filter(Boolean) as string[],
  };
}

const validTs = (t: number, now: number) => Number.isInteger(t) && t % (30 * M) === 0 && t >= Date.UTC(2020, 0, 1) && t <= now;

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const symbol = (sp.get('symbol') ?? 'BTCUSDT').toUpperCase();
  if (symbol !== 'BTCUSDT' && symbol !== 'ETHUSDT') return NextResponse.json({ error: 'BTCUSDT·ETHUSDT 만 지원' }, { status: 400 });
  const now = Date.now();
  const T = Number(sp.get('ts'));
  if (!validTs(T, now)) return NextResponse.json({ error: '발표 시각(ts)이 올바르지 않거나 아직 오지 않았습니다.' }, { status: 400 });
  const cmp = (sp.get('cmp') ?? '').split(',').filter(Boolean).map(Number).filter((t) => validTs(t, now) && t < T).slice(0, 8);

  const [main, oiR, frR, ...others] = await Promise.all([
    bars(symbol, T, now),
    now - T < 29 * 24 * H
      ? get<{ sumOpenInterest: string; timestamp: number }[]>(`${B}/futures/data/openInterestHist?symbol=${symbol}&period=5m&startTime=${T - 65 * M}&endTime=${T + 1445 * M}&limit=500`).catch(() => null)
      : Promise.resolve(null),
    get<{ fundingTime: number; fundingRate: string }[]>(`${B}/fapi/v1/fundingRate?symbol=${symbol}&startTime=${T - 9 * H}&endTime=${T + 25 * H}&limit=20`).catch(() => null),
    ...cmp.map((t) => bars(symbol, t, now)),
  ]);

  const study = studyEvent(T, main.m1, main.m5);
  const oiPts = oiR ? oiR.map((p) => ({ ts: p.timestamp, oi: Number(p.sumOpenInterest) })).filter((p) => Number.isFinite(p.oi)) : null;
  const compare: { ts: number; study: StudyResult }[] = cmp.map((t, i) => ({ ts: t, study: studyEvent(t, others[i].m1, others[i].m5) }));

  const body = {
    symbol, ts: T, source: '바이낸스 USDT 무기한(공개 시세)',
    study,
    // 차트용 — 1분봉 종가(발표 −60분 ~ +240분)·5분봉 종가(~ +24시간). 실제로 받은 봉만
    m1: main.m1.filter((b) => b.ts >= T - 61 * M).map((b) => [b.ts, b.c] as [number, number]),
    m5: main.m5.map((b) => [b.ts, b.c] as [number, number]),
    oi: oiPts ? oiChange(T, oiPts) : null,
    oiNote: oiPts ? null : now - T >= 29 * 24 * H ? '바이낸스 OI 기록은 최근 30일만 제공 — 이 발표는 OI 없음' : 'OI 불러오기 실패',
    funding: frR ? fundingAround(T, frR.map((f) => ({ ts: f.fundingTime, rate: Number(f.fundingRate) }))) : null,
    compare,
    errors: [...main.errors, ...(frR ? [] : ['펀딩'])],
  };
  const settled = now - T > 25 * H && cmp.every((t) => now - t > 25 * H);
  return NextResponse.json(body, { headers: { 'Cache-Control': settled && !body.errors.length ? 's-maxage=86400, stale-while-revalidate=604800' : 's-maxage=60' } });
}
