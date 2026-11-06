/**
 * 대시보드 종목 검색 API
 * 1차: 네이버 증권 자동완성 ac.stock.naver.com (전 종목, API 키 불필요)
 * 2차: 로컬 하드코딩 리스트 폴백
 */
import { NextRequest, NextResponse } from 'next/server';
import { searchStockList } from '@/lib/stockList';
import type { SearchResult } from '@/lib/types';
import { withCdn } from '@/lib/cdn';
import { naverAutocomplete } from '@/lib/naver';

// ── 네이버 증권 자동완성(전 종목, lib/naver.naverAutocomplete) ─────────────────────
async function naverSearch(q: string): Promise<SearchResult[] | null> {
  const r = await naverAutocomplete(q);
  if (!r) return null;
  return r.map((x) => ({ ticker: x.code, name: x.name, market: x.market }));
}

async function handler(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json([]);

  // 1. Naver Finance 자동완성 (전 종목)
  try {
    const r = await naverSearch(q);
    if (r && r.length) return NextResponse.json(r);
  } catch { /* fall through */ }

  // 2. 로컬 리스트 폴백
  return NextResponse.json(searchStockList(q));
}

// CDN 캐시(검색 결과) — 만료 후에도 직전 값을 즉시 응답
export const GET = withCdn(handler, 3600, 86400);
