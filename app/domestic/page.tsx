import SwrFallback from '@/components/SwrFallback';
import DomesticClient from './DomesticClient';
import { ALL_STOCKS, CHUNKS, FIRST_KEY, REST_KEY } from '@/lib/domesticKeys';
import { fetchKrQuotesChunked } from '@/lib/krQuote';
import type { StockData } from '@/lib/types';

/**
 * 국내 시장 — 첫 시세를 서버에서 넣어 HTML 에 바로 숫자가 보이게(속도 2단계 시범, 2026-11-09).
 * 예전: HTML → JS 실행(모바일 약 0.6~1초) → 그때서야 /api/stock/batch 요청 → 데이터 보임 2.4초(4G·CPU 4배 실측).
 * ISR 60초: 페이지는 그대로 CDN 에서 나가고, 누가 볼 때 최대 60초에 한 번만 백그라운드로 다시 만든다(Hobby CPU 거의 그대로).
 * 화면은 DomesticClient 그대로 — 뜬 직후 SWR 이 새로 받아 바꾼다. 서버 조회가 실패하면 fallback 없이 예전처럼 화면에서 받는다.
 */
export const revalidate = 60;

async function snapshot(): Promise<{ fallback: Record<string, unknown>; at?: number }> {
  try {
    const all = await fetchKrQuotesChunked(ALL_STOCKS.map((s) => s.ticker), { revalidate: 60 });
    const pick = (csv: string) => {
      const m: Record<string, StockData> = {};
      for (const t of csv.split(',')) if (all[t]) m[t] = all[t];
      return m;
    };
    const fallback: Record<string, unknown> = {};
    const first = CHUNKS[0] ? pick(CHUNKS[0]) : {};
    const rest = pick(CHUNKS.slice(1).join(','));
    if (FIRST_KEY && Object.keys(first).length) fallback[FIRST_KEY] = first;
    if (REST_KEY && Object.keys(rest).length) fallback[REST_KEY] = rest;
    // 표시 시각 = 받은 시세의 가장 늦은 체결 시각(데이터 캐시 때문에 렌더 시각보다 이전일 수 있음)
    const ts = Object.values(all).map((d) => (d.tradedAt ? Date.parse(d.tradedAt) : NaN)).filter(Number.isFinite);
    return { fallback, at: ts.length ? Math.max(...ts) : undefined };
  } catch {
    return { fallback: {} };
  }
}

export default async function DomesticPage() {
  const { fallback, at } = await snapshot();
  return (
    <SwrFallback fallback={fallback}>
      <DomesticClient snapshotAt={at} />
    </SwrFallback>
  );
}
