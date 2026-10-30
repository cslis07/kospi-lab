import { NextRequest, NextResponse } from 'next/server';
import { withCdn } from '@/lib/cdn';
import { parseStockNews, parseDisclosures } from '@/lib/stockFinance';

/** 종목 뉴스(최근 10건) · 공시(최근 10건) — 네이버 모바일. 한쪽이 실패해도 다른 쪽은 보낸다 */
export const preferredRegion = 'icn1';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://m.stock.naver.com/',
  'Accept': 'application/json',
};
const get = (u: string) => fetch(u, { headers: HEADERS, cache: 'no-store', signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

async function handler(_req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const code = (await params).ticker.replace(/\.(KS|KQ)$/, '');
  if (!/^[0-9A-Z]{6}$/.test(code)) return NextResponse.json({ error: 'bad code' }, { status: 400 });
  const [n, d] = await Promise.all([
    get(`https://m.stock.naver.com/api/news/stock/${code}?pageSize=10`),
    get(`https://m.stock.naver.com/api/stock/${code}/disclosure?pageSize=10`),
  ]);
  if (n == null && d == null) return NextResponse.json({ error: 'naver news/disclosure 실패' }, { status: 502 });
  return NextResponse.json({ news: parseStockNews(n), disclosures: parseDisclosures(d, code) });
}

export const GET = withCdn(handler, 120, 1800);
