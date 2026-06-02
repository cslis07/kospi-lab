/**
 * 대시보드 종목 검색 API
 * 1차: Naver Finance 자동완성 (전 종목, API 키 불필요)
 * 2차: 로컬 하드코딩 리스트 폴백
 */
import { NextRequest, NextResponse } from 'next/server';
import { searchStockList } from '@/lib/stockList';
import type { SearchResult } from '@/lib/types';

// ── Naver Finance 자동완성 ─────────────────────────────────────────────────────
// items[n] = [종목명, 6자리코드, 기업전체명, ?, 시장("0"=KOSPI "1"=KOSDAQ), ...]
async function naverSearch(q: string): Promise<SearchResult[] | null> {
  const url =
    `https://ac.finance.naver.com/ac` +
    `?q=${encodeURIComponent(q)}&q_enc=UTF-8&st=0.00` +
    `&r_format=json&r_enc=UTF-8&r_lt=1&l_size=10&r_size=10`;

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      Referer: 'https://finance.naver.com/',
    },
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  if (!res.ok) return null;

  const json = await res.json();
  // Naver AC: items 직접 배열 또는 배열의 배열
  const raw = json?.items ?? [];
  const items: string[][] = Array.isArray(raw[0])
    ? raw
    : raw.map((x: unknown) => (Array.isArray(x) ? x : []));

  const results: SearchResult[] = [];
  for (const item of items) {
    const name = item[0];
    const code = item[1]; // 6자리 코드
    if (!code || !/^\d{6}$/.test(code)) continue;
    // item[4]: 디버그 확인 결과 에이피알(KOSPI)=>"1", 따라서 "1"=KOSPI, "0"=KOSDAQ
    const market = item[4] === '0' ? 'KOSDAQ' : 'KOSPI';
    results.push({ ticker: code, name, market });
  }
  return results.length > 0 ? results : null;
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json([]);

  // 1. Naver Finance 자동완성 (전 종목)
  try {
    const r = await naverSearch(q);
    if (r) return NextResponse.json(r);
  } catch { /* fall through */ }

  // 2. 로컬 리스트 폴백
  return NextResponse.json(searchStockList(q));
}
