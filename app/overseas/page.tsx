import SwrFallback from '@/components/SwrFallback';
import OverseasClient from './OverseasClient';
import { ALL_SYMBOLS, CHUNK_KEYS, MARKET_KEY } from '@/lib/overseasKeys';
import { fetchUsQuotesChunked } from '@/lib/usQuote';
import { usdKrwLive, r2 } from '@/lib/naverIndex';
import type { OverseasStockData } from '@/lib/types';

/**
 * 해외 시장 — 첫 시세를 서버에서 넣어 HTML 에 바로 숫자가 보이게(속도 2단계, /domestic 과 같은 방식, 2026-11-09).
 * 예전: HTML → JS 실행 → 그때서야 /api/overseas/batch 5묶음 요청 → 등락 TOP·목록이 늦게 채워짐.
 * ISR 60초: 페이지는 그대로 CDN 에서 나가고, 누가 볼 때 최대 60초에 한 번만 백그라운드로 다시 만든다(Hobby CPU 거의 그대로).
 * 화면은 OverseasClient 그대로 — 뜬 직후 SWR 이 새로 받아 바꾼다. 서버 조회가 실패하면 fallback 없이 예전처럼 화면에서 받는다.
 * 원/달러도 같이 넣는다: 행의 '≈ 원' 줄은 환율이 있어야 생겨서, 시세만 넣으면 환율 도착 때 행이 한 줄 늘어 화면이 밀린다.
 */
export const revalidate = 60;

async function quoteSnapshot(): Promise<{ fallback: Record<string, unknown>; at?: number }> {
  try {
    const all = await fetchUsQuotesChunked(ALL_SYMBOLS, { revalidate: 60 });
    const fallback: Record<string, unknown> = {};
    for (const key of CHUNK_KEYS) {
      if (!key) continue;
      const m: Record<string, OverseasStockData> = {};
      for (const s of (key.split('symbols=')[1] ?? '').split(',')) if (all[s]) m[s] = all[s];
      if (Object.keys(m).length) fallback[key] = m;
    }
    // 표시 시각 = 받은 시세의 가장 늦은 기준 시각(데이터 캐시 때문에 렌더 시각보다 이전일 수 있음)
    const ts = Object.values(all).map((d) => (d.tradedAt ? Date.parse(d.tradedAt) : NaN)).filter(Number.isFinite);
    return { fallback, at: ts.length ? Math.max(...ts) : undefined };
  } catch {
    return { fallback: {} };
  }
}

/** 화면은 /api/market 중 usdkrw.value 만 읽는다 — 그 값만 넣고, 뜬 뒤 SWR 이 전체 응답으로 바꾼다 */
async function fxSnapshot(): Promise<Record<string, unknown>> {
  try {
    const q = await usdKrwLive(60);
    if (!q || !(q.value > 0)) return {};
    return { [MARKET_KEY]: { usdkrw: { value: r2(q.value), change: r2(q.change), changeRate: r2(q.changeRate) } } };
  } catch {
    return {};
  }
}

export default async function OverseasPage() {
  const [{ fallback: quotes, at }, fx] = await Promise.all([quoteSnapshot(), fxSnapshot()]);
  // 환율만 있고 시세가 없으면 넣지 않음(행이 없으니 의미 없음)
  const fallback = Object.keys(quotes).length ? { ...quotes, ...fx } : {};
  return (
    <SwrFallback fallback={fallback}>
      <OverseasClient snapshotAt={at} />
    </SwrFallback>
  );
}
