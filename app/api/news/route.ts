import { NextRequest, NextResponse } from 'next/server';
import { fetchNews, type NewsCategory } from '@/lib/newsFeeds';

// 수집 로직은 lib/newsFeeds.ts (국내 = 네이버 증권 JSON 주력 — 국내 RSS 는 Vercel 에서 막힘)
export async function GET(req: NextRequest) {
  const c = req.nextUrl.searchParams.get('category');
  const category: NewsCategory | null = c === 'domestic' || c === 'international' ? c : null;
  const news = await fetchNews(category, 100);
  return NextResponse.json(news, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
