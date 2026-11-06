/**
 * 종목 검색 API
 * 1차: 네이버 증권 자동완성 ac.stock.naver.com (전 종목, API 키 불필요, 빠름)
 * 2차: KRX 종목기본정보 API (전 종목)
 * 3차: 로컬 하드코딩 리스트 폴백 (~200개 주요 종목)
 */
import { NextRequest, NextResponse } from 'next/server';
import { KR_STOCKS } from '@/lib/krStocks';
import { withCdn } from '@/lib/cdn';
import { naverAutocomplete } from '@/lib/naver';

interface SearchResult {
  ticker: string;
  name: string;
  code: string;
  market: string;
}

// ── 로컬 폴백 검색 ────────────────────────────────────────────────────────────
function localSearch(q: string): SearchResult[] {
  const lower = q.toLowerCase();
  return KR_STOCKS.filter((s) => {
    const name = s.name.toLowerCase();
    const alt  = (s.alt ?? '').toLowerCase();
    return (
      name.includes(lower) ||
      alt.includes(lower) ||
      s.ticker.replace(/\.(KS|KQ)$/, '').startsWith(q)
    );
  })
    .slice(0, 8)
    .map((s) => ({
      ticker: s.ticker,
      name:   s.name,
      code:   s.ticker.replace(/\.(KS|KQ)$/, ''),
      market: s.ticker.endsWith('.KS') ? 'KOSPI' : 'KOSDAQ',
    }));
}

// ── 네이버 증권 자동완성(전 종목, lib/naver.naverAutocomplete) ─────────────────────
// 스크리너가 Naver basic 으로 올바른 .KS/.KQ 를 재확인하므로 시장 구분은 참고용
async function naverSearch(q: string): Promise<SearchResult[] | null> {
  const r = await naverAutocomplete(q);
  if (!r || !r.length) return null;
  return r.map((x) => ({ ticker: `${x.code}.${x.market === 'KOSDAQ' ? 'KQ' : 'KS'}`, name: x.name, code: x.code, market: x.market }));
}

// ── KRX 종목리스트 (내부 라우트 경유) ──────────────────────────────────────────
async function krxSearch(req: NextRequest, q: string): Promise<SearchResult[] | null> {
  const krxUrl = new URL(req.url);
  krxUrl.pathname = '/api/krx/stock-list';
  krxUrl.search   = `?q=${encodeURIComponent(q)}`;
  const res = await fetch(krxUrl.toString(), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) && data.length > 0 ? data : null;
}

// ── GET handler ───────────────────────────────────────────────────────────────
async function handler(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json([]);

  // 1. Naver Finance 자동완성 (전 종목, 빠름)
  try {
    const r = await naverSearch(q);
    if (r) return NextResponse.json(r);
  } catch { /* fall through */ }

  // 2. KRX 종목기본정보 API
  try {
    const r = await krxSearch(req, q);
    if (r) return NextResponse.json(r);
  } catch { /* fall through */ }

  // 3. 로컬 폴백
  return NextResponse.json(localSearch(q));
}

// CDN 캐시(검색 결과) — 만료 후에도 직전 값을 즉시 응답
export const GET = withCdn(handler, 3600, 86400);
