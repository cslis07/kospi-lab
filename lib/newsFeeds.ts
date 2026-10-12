/**
 * 뉴스 수집 공용 모듈 — /api/news 와 AI 브리핑(헤드라인 근거)이 함께 쓴다.
 *
 * ⚠️ 국내 RSS(한경·매경·조선비즈·네이버 RSS)는 **Vercel(미국 IP)에서 전부 빈 결과** — 프로덕션 국내 뉴스 0건의 원인(2026-09-30 실측).
 *    그래서 국내는 Vercel 에서도 동작하는 **네이버 증권 모바일 뉴스 JSON**(m.stock.naver.com/api/news/list)을 주력으로,
 *    RSS 는 폴백(로컬에선 동작)으로만 남긴다.  필드: tit(제목)·ohnm(언론사)·dt(YYYYMMDDHHmmss KST)·oid·aid·subcontent.
 */
import Parser from 'rss-parser';
import type { NewsItem } from '@/lib/types';

export type NewsCategory = 'domestic' | 'international';

const parser = new Parser({
  timeout: 8000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; RSSBot/1.0)',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
  },
});

interface RssSource { name: string; rss: string; category: NewsCategory }

const RSS_SOURCES: RssSource[] = [
  // 해외
  { name: 'CNBC', rss: 'https://www.cnbc.com/id/100727362/device/rss/rss.html', category: 'international' },
  { name: 'CNN Business', rss: 'https://rss.cnn.com/rss/money_news_economy.rss', category: 'international' },
  { name: 'Yahoo Finance', rss: 'https://finance.yahoo.com/rss/topstories', category: 'international' },
  { name: 'Federal Reserve', rss: 'https://www.federalreserve.gov/feeds/press_all.xml', category: 'international' },
  { name: 'Bloomberg', rss: 'https://feeds.bloomberg.com/markets/news.rss', category: 'international' },
  { name: 'MarketScreener', rss: 'https://www.marketscreener.com/rss/news-market.xml', category: 'international' },
  // 국내(폴백 — Vercel 에선 빈 결과)
  { name: '네이버 경제', rss: 'https://rss.naver.com/main/rss.naver?categoryId=411', category: 'domestic' },
  { name: '한국경제', rss: 'https://www.hankyung.com/feed/economy', category: 'domestic' },
  { name: '매일경제', rss: 'https://rss.mk.co.kr/rss/30000001/', category: 'domestic' },
  { name: '조선비즈', rss: 'https://rss.biz.chosun.com/rss/economy.xml', category: 'domestic' },
];

async function fetchRss(s: RssSource): Promise<NewsItem[]> {
  try {
    const feed = await parser.parseURL(s.rss);
    return feed.items.slice(0, 10).map((item) => ({
      title: item.title?.trim() ?? '',
      link: item.link ?? '',
      pubDate: item.pubDate ?? item.isoDate,
      summary: item.contentSnippet?.slice(0, 200) ?? item.content?.replace(/<[^>]+>/g, '').slice(0, 200),
      source: s.name,
      category: s.category,
    })).filter((i) => i.title && i.link);
  } catch {
    return [];
  }
}

/** 네이버 증권 주요뉴스(국내) — Vercel 에서도 동작 */
export async function fetchNaverMainNews(pageSize = 20): Promise<NewsItem[]> {
  try {
    const res = await fetch(`https://m.stock.naver.com/api/news/list?category=mainnews&page=1&pageSize=${pageSize}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        Referer: 'https://m.stock.naver.com/', Accept: 'application/json',
      },
      next: { revalidate: 180 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const rows: { tit?: string; ohnm?: string; dt?: string; oid?: string; aid?: string; subcontent?: string }[] = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r) => r.tit && r.oid && r.aid)
      .map((r) => {
        const dt = String(r.dt ?? '');
        const pubDate = dt.length >= 12
          ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}T${dt.slice(8, 10)}:${dt.slice(10, 12)}:${dt.slice(12, 14) || '00'}+09:00`
          : undefined;
        return {
          title: String(r.tit).replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim(),
          link: `https://n.news.naver.com/mnews/article/${r.oid}/${r.aid}`,
          pubDate,
          summary: r.subcontent?.slice(0, 200),
          source: r.ohnm ?? '네이버 증권',
          category: 'domestic' as const,
        };
      });
  } catch {
    return [];
  }
}

/**
 * 글로벌이코노믹(g-enews) — 글로벌 경제·시장 한국어 기사. RSS 가 없어 섹션 리스트 HTML 을 파싱.
 * 제목 앵커(class e2=피처 / w2=목록)만 추출하고, 요약 리드(w3)는 제외. 날짜는 기사 URL 끝 14자리(YYYYMMDDHHMMSS, KST).
 * list.php 는 일반 공개 페이지라 Vercel(icn1)에서도 조회 가능. 실패 시 빈 배열(그레이스풀).
 */
const GENEWS_SECTIONS: { name: string; ct: string }[] = [
  { name: '글로벌이코노믹', ct: 'g080000' }, // Global-Biz(美 금리·유가·글로벌 증시 등 거시)
];
const stripTags = (s: string) => s.replace(/<[^>]+>/g, '');
const decodeEntities = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

export async function fetchGenews(perSection = 12): Promise<NewsItem[]> {
  const jobs = GENEWS_SECTIONS.map(async (s): Promise<NewsItem[]> => {
    try {
      const res = await fetch(`https://www.g-enews.com/list.php?ct=${s.ct}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      const html = await res.text();
      const re = /<a href="(https:\/\/www\.g-enews\.com\/article\/[^"]+)"[^>]*class="[^"]*\b(?:e2|w2)\b[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
      const seen = new Set<string>();
      const out: NewsItem[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null && out.length < perSection) {
        const link = m[1];
        if (seen.has(link)) continue;
        seen.add(link);
        const title = decodeEntities(stripTags(m[2])).replace(/\s+/g, ' ').trim();
        if (title.length < 6) continue;
        const seg = link.split('/').pop() ?? '';
        const d = seg.slice(0, 14);
        const pubDate = /^\d{14}$/.test(d)
          ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(8, 10)}:${d.slice(10, 12)}:${d.slice(12, 14)}+09:00`
          : undefined;
        out.push({ title, link, pubDate, source: s.name, category: 'international' });
      }
      return out;
    } catch {
      return [];
    }
  });
  const settled = await Promise.allSettled(jobs);
  return settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

const byDateDesc = (a: NewsItem, b: NewsItem) =>
  (b.pubDate ? new Date(b.pubDate).getTime() : 0) - (a.pubDate ? new Date(a.pubDate).getTime() : 0);

/** 카테고리별(없으면 전체) 최신순 뉴스. 제목 중복 제거. */
export async function fetchNews(category?: NewsCategory | null, limit = 100): Promise<NewsItem[]> {
  const rss = category ? RSS_SOURCES.filter((s) => s.category === category) : RSS_SOURCES;
  const jobs: Promise<NewsItem[]>[] = rss.map(fetchRss);
  if (!category || category === 'domestic') jobs.push(fetchNaverMainNews(20));
  if (!category || category === 'international') jobs.push(fetchGenews(12)); // 글로벌이코노믹(해외 거시)

  const settled = await Promise.allSettled(jobs);
  const seen = new Set<string>();
  return settled
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .filter((n) => { const k = n.title.replace(/\s+/g, ''); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort(byDateDesc)
    .slice(0, limit);
}
