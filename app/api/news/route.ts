import { NextRequest, NextResponse } from 'next/server';
import Parser from 'rss-parser';
import type { NewsItem } from '@/lib/types';

const parser = new Parser({
  timeout: 8000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; RSSBot/1.0)',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
  },
});

interface RssSource {
  name: string;
  rss: string;
  category: 'domestic' | 'international';
}

const SOURCES: RssSource[] = [
  // 해외
  { name: 'CNBC', rss: 'https://www.cnbc.com/id/100727362/device/rss/rss.html', category: 'international' },
  { name: 'CNN Business', rss: 'https://rss.cnn.com/rss/money_news_economy.rss', category: 'international' },
  { name: 'Yahoo Finance', rss: 'https://finance.yahoo.com/rss/topstories', category: 'international' },
  { name: 'Federal Reserve', rss: 'https://www.federalreserve.gov/feeds/press_all.xml', category: 'international' },
  { name: 'Bloomberg', rss: 'https://feeds.bloomberg.com/markets/news.rss', category: 'international' },
  { name: 'MarketScreener', rss: 'https://www.marketscreener.com/rss/news-market.xml', category: 'international' },
  // 국내
  { name: '네이버 경제', rss: 'https://rss.naver.com/main/rss.naver?categoryId=411', category: 'domestic' },
  { name: '한국경제', rss: 'https://www.hankyung.com/feed/economy', category: 'domestic' },
  { name: '매일경제', rss: 'https://rss.mk.co.kr/rss/30000001/', category: 'domestic' },
  { name: '조선비즈', rss: 'https://rss.biz.chosun.com/rss/economy.xml', category: 'domestic' },
];

async function fetchSource(s: RssSource): Promise<NewsItem[]> {
  try {
    const feed = await parser.parseURL(s.rss);
    return feed.items.slice(0, 10).map((item) => ({
      title: item.title?.trim() ?? '',
      link: item.link ?? '',
      pubDate: item.pubDate ?? item.isoDate,
      summary: item.contentSnippet?.slice(0, 200) ??
        item.content?.replace(/<[^>]+>/g, '').slice(0, 200),
      source: s.name,
      category: s.category,
    })).filter((i) => i.title && i.link);
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get('category') as 'domestic' | 'international' | null;
  const filtered = category ? SOURCES.filter((s) => s.category === category) : SOURCES;

  const settled = await Promise.allSettled(filtered.map(fetchSource));

  const news: NewsItem[] = settled
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .sort((a, b) => {
      const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return db - da;
    })
    .slice(0, 100);

  return NextResponse.json(news, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
