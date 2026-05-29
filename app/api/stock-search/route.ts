/**
 * 종목 검색 API
 * 1차: KRX 종목기본정보 API (전 종목 커버)
 * 2차: 로컬 하드코딩 리스트 폴백
 */
import { NextRequest, NextResponse } from 'next/server';
import { KR_STOCKS } from '@/lib/krStocks';

const KRX_BASE = process.env.NEXT_PUBLIC_SITE_URL
  ? `${process.env.NEXT_PUBLIC_SITE_URL}/api/krx/stock-list`
  : 'http://localhost:3000/api/krx/stock-list';

// ── 로컬 폴백 검색 ────────────────────────────────────────────────────────────
function localSearch(q: string) {
  const lower = q.toLowerCase();
  return KR_STOCKS.filter((s) => {
    const name = s.name.toLowerCase();
    const alt  = (s.alt ?? '').toLowerCase();
    return name.includes(lower) || s.ticker.includes(q) || alt.includes(lower) ||
           s.ticker.replace(/\.(KS|KQ)$/, '').startsWith(q);
  }).slice(0, 8).map((s) => ({ ticker: s.ticker, name: s.name, code: s.ticker.replace(/\.(KS|KQ)$/, ''), market: s.ticker.endsWith('.KS') ? 'KOSPI' : 'KOSDAQ' }));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json([]);

  // KRX 내부 라우트 호출 (서버→서버)
  try {
    const krxUrl = new URL(req.url);
    krxUrl.pathname = '/api/krx/stock-list';
    krxUrl.search   = `?q=${encodeURIComponent(q)}`;

    const res = await fetch(krxUrl.toString(), {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return NextResponse.json(data);
      }
    }
  } catch { /* fall through to local */ }

  // 폴백: 로컬 리스트
  return NextResponse.json(localSearch(q));
}
