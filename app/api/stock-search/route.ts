/**
 * 종목 검색 API
 * 1차: Naver Finance 자동완성 (전 종목, API 키 불필요, 빠름)
 * 2차: KRX 종목기본정보 API (전 종목)
 * 3차: 로컬 하드코딩 리스트 폴백 (~200개 주요 종목)
 */
import { NextRequest, NextResponse } from 'next/server';
import { KR_STOCKS } from '@/lib/krStocks';

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

// ── Naver Finance 자동완성 ─────────────────────────────────────────────────────
// items[n] = [종목명, 6자리코드, 전체명, ?, 시장("0"=KOSPI "1"=KOSDAQ), ...]
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

  const json  = await res.json();
  // Naver AC wraps results in items (직접 배열) or items[0] 형태 둘 다 존재
  const raw   = json?.items ?? [];
  const items: string[][] = Array.isArray(raw[0]) ? raw : raw.map((x: unknown) => (Array.isArray(x) ? x : []));

  const results: SearchResult[] = [];
  for (const item of items) {
    const name = item[0];
    const code = item[1];
    if (!code || !/^\d{6}$/.test(code)) continue;
    // item[4]: "0" = KOSPI, "1" = KOSDAQ
    const isKosdaq = item[4] === '1';
    results.push({
      ticker: `${code}.${isKosdaq ? 'KQ' : 'KS'}`,
      name,
      code,
      market: isKosdaq ? 'KOSDAQ' : 'KOSPI',
    });
  }
  return results.length > 0 ? results : null;
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
export async function GET(req: NextRequest) {
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
