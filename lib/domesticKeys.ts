import { STOCK_LIST, type StockItem } from '@/lib/stockList';

/**
 * /domestic 목록·SWR 키 — 서버 첫 화면(page.tsx)과 화면 컴포넌트(DomesticClient)가 같은 키를 써야
 * 서버가 넣어 준 시세(SWRConfig fallback)를 화면이 그대로 집는다. 'use client' 파일의 상수는 서버에서 값으로 못 읽어서 여기 둔다.
 */

// 중복 제거된 종목 리스트
export const ALL_STOCKS: StockItem[] = Array.from(
  new Map((STOCK_LIST as StockItem[]).map((s) => [s.ticker, s])).values(),
);

// 20개씩 청크 (배치 API 최대 20) — 목록 길이에 맞춰 자동 분할(예전 고정 6청크는 101번째부터 20개만 받아 나머지가 '로딩…'에 머물렀다)
export const CHUNKS: string[] = Array.from({ length: Math.ceil(ALL_STOCKS.length / 20) }, (_, i) =>
  ALL_STOCKS.slice(i * 20, i * 20 + 20).map((s) => s.ticker).join(','));

/** 첫 청크(먼저 그림) */
export const FIRST_KEY: string | null = CHUNKS[0] ? `/api/stock/batch?tickers=${CHUNKS[0]}` : null;
/** 나머지 전부(batchFetcher 가 20개씩 나눠 받음) */
export const REST_KEY: string | null = CHUNKS.length > 1 ? `/api/stock/batch?tickers=${CHUNKS.slice(1).join(',')}` : null;
