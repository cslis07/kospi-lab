/**
 * 스테이블코인 전체 시가총액(USDT·USDC 등 모든 페그 합, 달러 환산) — 홈 '오늘의 시장' 카드·상세 시트용.
 * 출처: DefiLlama stablecoincharts/all(무료·무키, 하루 1점 + 오늘 진행분). 단위는 십억 달러(B).
 * TradingView CRYPTOCAP 의 스테이블코인 시총과는 집계 범위가 달라 몇 십억 달러 차이가 난다(추세는 같다).
 *
 * 응답이 1.3MB 라 매 요청마다 다시 풀지 않도록 줄인 결과를 30분 동안 메모리에 둔다(받기 실패 시 직전 값 유지).
 */
import type { IndexCard } from '@/lib/homeIndices';

export const STABLE_CODE = 'STABLE';
export interface StablePoint { date: string; value: number }
interface ChartRow { date?: string | number; totalCirculatingUSD?: Record<string, number> }

const r2 = (n: number) => Math.round(n * 100) / 100;

/** 차트 응답 → 날짜순 [{date:'YYYY-MM-DD', value: 십억 달러}] (값이 없거나 0 인 날은 뺀다) */
export function parseStableChart(rows: unknown): StablePoint[] {
  if (!Array.isArray(rows)) return [];
  const out: StablePoint[] = [];
  for (const r of rows as ChartRow[]) {
    const ts = Number(r?.date);
    const usd = r?.totalCirculatingUSD;
    if (!Number.isFinite(ts) || !usd || typeof usd !== 'object') continue;
    let sum = 0;
    for (const v of Object.values(usd)) if (typeof v === 'number' && Number.isFinite(v)) sum += v;
    if (sum <= 0) continue;
    out.push({ date: new Date(ts * 1000).toISOString().slice(0, 10), value: r2(sum / 1e9) });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 시계열 → 홈 지수 카드(전일 대비, 1개월 스파크, 52주 범위). 2점 미만이면 null */
export function stableCardFrom(points: StablePoint[]): IndexCard | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1].value, prev = points[points.length - 2].value;
  if (!last || !prev) return null;
  const year = points.slice(-366).map((p) => p.value);
  return {
    code: STABLE_CODE, name: '스테이블코인 시총',
    value: last, change: r2(last - prev), changeRate: r2((last / prev - 1) * 100),
    live: false, tag: '일간', unit: 'B',
    spark: points.slice(-23).map((p) => p.value), sparkLabel: '1개월',
    week52High: Math.max(...year), week52Low: Math.min(...year),
  };
}

const TTL = 30 * 60_000;
let memo: { at: number; points: StablePoint[] } | null = null;

export async function stableSeries(): Promise<StablePoint[]> {
  if (memo && Date.now() - memo.at < TTL) return memo.points;
  try {
    const res = await fetch('https://stablecoins.llama.fi/stablecoincharts/all', { next: { revalidate: 1800 }, signal: AbortSignal.timeout(9000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const points = parseStableChart(await res.json());
    if (points.length >= 2) { memo = { at: Date.now(), points }; return points; }
  } catch { /* 아래에서 직전 값 */ }
  return memo?.points ?? [];
}

export async function stableCard(): Promise<IndexCard | null> {
  return stableCardFrom(await stableSeries());
}
