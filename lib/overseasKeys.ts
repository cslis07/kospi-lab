import { OVERSEAS_LIST } from '@/lib/overseasList';

/**
 * /overseas 목록·SWR 키 — 서버 첫 화면(page.tsx)과 화면 컴포넌트(OverseasClient)가 같은 키를 써야
 * 서버가 넣어 준 시세(SWRConfig fallback)를 화면이 그대로 집는다. 'use client' 파일의 상수는 서버에서 값으로 못 읽어서 여기 둔다.
 */
export const ALL_SYMBOLS: string[] = OVERSEAS_LIST.map((s) => s.symbol);

/** 20개씩 5묶음(예전 화면과 같은 고정 5칸 — 훅 개수가 고정이라). 빈 묶음은 null */
export const CHUNK_KEYS: (string | null)[] = [0, 20, 40, 60, 80].map((from, i, a) => {
  const csv = ALL_SYMBOLS.slice(from, i === a.length - 1 ? undefined : from + 20).join(',');
  return csv ? `/api/overseas/batch?symbols=${csv}` : null;
});

/** 원/달러(행의 '≈ 원' 줄) — 화면은 /api/market 의 usdkrw 만 읽는다 */
export const MARKET_KEY = '/api/market';
