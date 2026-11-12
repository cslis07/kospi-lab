/**
 * 코인 › 시장환경 — 홈 '오늘의 시장'과 같은 카드(현재값·전일 대비·1개월 추이·상세 시트)로 보여주는 실시간 집계.
 *
 *  - 미 국채 10Y·2Y·30Y · 브렌트유 · 달러인덱스: 네이버 시세(실시간 또는 10분 지연) — 시장지표 화면과 같은 소스
 *  - USDT/KRW: 업비트 실거래가
 *  - 공포·탐욕 지수(alternative.me)·스테이블코인 시총(DefiLlama): 하루 1회 집계
 *  - 다음 FOMC: 연준 공식 결정일(lib/macroSchedule)
 *
 * 예전 lib/coinDashboard(FRED 일간 값·5분 캐시)를 대체한다(2026-11-12).
 * ⚠ 업비트는 미국 데이터센터 IP를 차단하므로 이 데이터를 쓰는 라우트는 preferredRegion='icn1'.
 * 현재값은 매 요청 새로 받고(라우트 CDN 10초가 동시 요청을 합친다), 일별 시계열은 10분 동안 메모리에 둔다.
 */
import type { IndexCard } from '@/lib/homeIndices';
import { marketIndicators, EXTRA_INDICATORS, INDICATORS, type IndicatorQuote } from '@/lib/naverStock';
import { stableCard } from '@/lib/stablecoinCap';
import { FOMC_DECISION_DATES } from '@/lib/macroSchedule';

export interface EnvLiveCard extends IndexCard {
  cat: string;      // 상세 시트 분류(bond·energy·exchange·crypto)
  status: string;   // '실시간' · '10분 지연' · '장마감' · '일간 집계'
  source?: string;  // 상세 시트 출처 문구(네이버가 아닌 것)
}
export interface EnvLive { cards: EnvLiveCard[]; fomc: { date: string; dday: number } | null; asOf: string }
export interface Pt { date: string; value: number }

export const ENV_USDT = 'ENV_USDT', ENV_FNG = 'ENV_FNG';
/** 시장환경에 쓰는 네이버 지표(표시 순서) */
export const ENV_NAVER = ['US10YT=RR', 'US2YT=RR', 'US30YT=RR', 'LCOcv1', '.DXY'];

const r2 = (n: number) => Math.round(n * 100) / 100;

/* ── 순수 계산(테스트 대상) ───────────────────────────── */

export function fngLabel(v: number): string {
  return v <= 24 ? '극단 공포' : v <= 44 ? '공포' : v <= 55 ? '중립' : v <= 74 ? '탐욕' : '극단 탐욕';
}

/** 오늘(UTC) 이후 가장 가까운 FOMC 결정일과 남은 일수 */
export function nextFomc(now: number, dates: string[] = FOMC_DECISION_DATES): { date: string; dday: number } | null {
  const today = new Date(now).toISOString().slice(0, 10);
  const date = dates.filter((d) => d >= today).sort()[0];
  if (!date) return null;
  return { date, dday: Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000) };
}

/** 일별 시계열 + 현재값 → 카드의 전일 대비·스파크·52주. 오늘(UTC) 진행분은 현재값으로 바꾼다 */
export function seriesCard(series: Pt[], live: number, today: string): { change: number; spark: number[]; week52High: number; week52Low: number } | null {
  const past = series.filter((p) => p.date < today);
  if (!past.length) return null;
  const all = [...past.map((p) => p.value), live];
  const year = all.slice(-366);
  return { change: r2(live - past[past.length - 1].value), spark: all.slice(-23), week52High: Math.max(...year), week52Low: Math.min(...year) };
}

/** 네이버 시세 → 카드(홈 레일의 시장지표 병합과 같은 표기: 금리 4자리) */
export function naverCard(q: IndicatorQuote): EnvLiveCard {
  const live = q.status === '실시간' || q.status.endsWith('지연');
  return {
    code: q.code, name: q.name, value: q.price, change: q.change, changeRate: q.changeRate, live,
    tag: q.status.endsWith('지연') ? q.status : undefined,
    spark: q.spark ?? [], sparkLabel: '1개월', unit: q.unit, dec: q.cat === 'bond' ? 4 : 2, cat: q.cat, status: q.status,
  };
}

/* ── 받아오기 ─────────────────────────────────────────── */
async function jget(url: string, revalidate: number, ms = 7000): Promise<unknown> {
  const res = await fetch(url, { ...(revalidate ? { next: { revalidate } } : { cache: 'no-store' as const }), signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface UpTick { market: string; trade_price: number; prev_closing_price: number }
async function upbitTick(market: string): Promise<UpTick | null> {
  try {
    const arr = await jget(`https://api.upbit.com/v1/ticker?markets=${market}`, 0, 6000);
    return Array.isArray(arr) && arr[0] ? (arr[0] as UpTick) : null;
  } catch { return null; }
}
/** 업비트 일봉 종가(UTC 0시 기준 하루) — 과거→최신 */
async function upbitDays(market: string, count = 200): Promise<Pt[]> {
  try {
    const arr = await jget(`https://api.upbit.com/v1/candles/days?market=${market}&count=${count}`, 600);
    if (!Array.isArray(arr)) return [];
    return (arr as { candle_date_time_utc: string; trade_price: number }[])
      .map((c) => ({ date: String(c.candle_date_time_utc).slice(0, 10), value: Number(c.trade_price) }))
      .filter((p) => p.date.length === 10 && p.value > 0).reverse();
  } catch { return []; }
}
async function fngDays(): Promise<Pt[]> {
  try {
    const j = (await jget('https://api.alternative.me/fng/?limit=270', 600)) as { data?: { value: string; timestamp: string }[] };
    return (j?.data ?? []).map((d) => ({ date: new Date(Number(d.timestamp) * 1000).toISOString().slice(0, 10), value: Number(d.value) }))
      .filter((p) => Number.isFinite(p.value)).sort((a, b) => a.date.localeCompare(b.date));
  } catch { return []; }
}

interface Hist { usdt: Pt[]; fng: Pt[] }
const TTL = 10 * 60_000;
let memo: { at: number; h: Hist } | null = null;

/** 일별 시계열(USDT/KRW·공포탐욕) — 10분 메모리 보관, 일부 실패는 직전 값으로 메운다 */
export async function envHistory(): Promise<Hist> {
  if (memo && Date.now() - memo.at < TTL) return memo.h;
  const [usdt, fng] = await Promise.all([upbitDays('KRW-USDT'), fngDays()]);
  const h: Hist = {
    usdt: usdt.length ? usdt : memo?.h.usdt ?? [],
    fng: fng.length ? fng : memo?.h.fng ?? [],
  };
  if (usdt.length && fng.length) memo = { at: Date.now(), h };
  return h;
}

const UPBIT_SRC = '출처: 업비트(USDT/KRW 실거래가, 일별 종가는 UTC 0시 기준).';
const FNG_SRC = '출처: alternative.me Crypto Fear & Greed Index(0 = 극단 공포, 100 = 극단 탐욕, 하루 1회 집계).';

export async function fetchEnvLive(now = Date.now()): Promise<EnvLive> {
  const today = new Date(now).toISOString().slice(0, 10);
  const defs = [...INDICATORS, ...EXTRA_INDICATORS].filter((d) => ENV_NAVER.includes(d.code));
  const [naver, ut, hist, stable] = await Promise.all([
    marketIndicators(defs).catch(() => [] as IndicatorQuote[]),
    upbitTick('KRW-USDT'),
    envHistory().catch(() => ({ usdt: [], fng: [] }) as Hist),
    stableCard().catch(() => null),
  ]);

  const cards: EnvLiveCard[] = [];
  for (const code of ENV_NAVER) {
    const q = naver.find((x) => x.code === code);
    if (q && q.price) cards.push(naverCard(q));
  }

  if (ut?.trade_price) {
    const s = seriesCard(hist.usdt, ut.trade_price, today);
    const prev = ut.prev_closing_price || (s ? ut.trade_price - s.change : 0);
    cards.push({
      code: ENV_USDT, name: 'USDT/KRW', value: ut.trade_price, change: r2(ut.trade_price - prev),
      changeRate: prev ? r2((ut.trade_price / prev - 1) * 100) : 0, live: true, unit: '원', dec: 0,
      spark: s?.spark ?? [], sparkLabel: '1개월', week52High: s?.week52High, week52Low: s?.week52Low,
      cat: 'crypto', status: '실시간', source: UPBIT_SRC,
    });
  }

  if (hist.fng.length >= 2) {
    const f = hist.fng, v = f[f.length - 1].value;
    const year = f.slice(-366).map((p) => p.value);
    cards.push({
      code: ENV_FNG, name: '공포·탐욕 지수', value: v, change: v - f[f.length - 2].value, changeRate: 0, live: false, tag: '일간',
      dec: 0, diffUnit: '', note: fngLabel(v),
      spark: f.slice(-23).map((p) => p.value), sparkLabel: '1개월', week52High: Math.max(...year), week52Low: Math.min(...year),
      cat: 'crypto', status: '일간 집계', source: FNG_SRC,
    });
  }

  if (stable) cards.push({ ...stable, cat: 'crypto', status: '일간 집계' });

  return { cards, fomc: nextFomc(now), asOf: new Date(now).toISOString() };
}

/** 상세 시트 히스토리(시장환경 전용 코드) — 없으면 null */
export async function envHistoryFor(code: string): Promise<Pt[] | null> {
  if (code !== ENV_USDT && code !== ENV_FNG) return null;
  const h = await envHistory();
  return (code === ENV_USDT ? h.usdt : h.fng).slice(-270);
}
