/**
 * 네이버 증권 국내 뉴스 — m.stock.naver.com front-api(JSON).
 * 2026-10 네이버가 finance.naver.com/news 를 stock.naver.com/news 로 옮기며(302) 옛 HTML 스크래퍼가 빈 배열만 냈다 → JSON 으로 교체.
 * 카테고리: 주요뉴스(mainnews) · 속보(flashnews) · 많이 본(ranknews). 링크는 네이버 뉴스 본문(n.news.naver.com).
 */
import { NextResponse } from 'next/server';
import type { NewsItem } from '@/lib/types';

const API = 'https://m.stock.naver.com/front-api/news/category';
const HDR = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://stock.naver.com/news/section',
};

const SECTIONS = [
  { id: 'mainnews', label: '주요뉴스' },
  { id: 'flashnews', label: '속보' },
  { id: 'ranknews', label: '많이 본' },
];

interface NaverArticle { articleId?: string; officeId?: string; officeName?: string; title?: string; titleFull?: string; body?: string; datetime?: string }

/** "20261027163308"(KST) → ISO */
function kstIso(dt?: string): string | undefined {
  const m = dt?.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+09:00` : undefined;
}

function toNewsItem(a: NaverArticle, label: string): NewsItem | null {
  const title = (a.titleFull || a.title || '').trim();
  if (!title || !a.officeId || !a.articleId) return null;
  return {
    title,
    link: `https://n.news.naver.com/mnews/article/${a.officeId}/${a.articleId}`,
    pubDate: kstIso(a.datetime),
    summary: a.body?.trim() || undefined,
    source: a.officeName ? `${a.officeName} · ${label}` : `네이버 증권 ${label}`,
    category: 'domestic',
  };
}

async function fetchSection(id: string, label: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(`${API}?category=${id}&page=1&pageSize=20`, { headers: HDR, signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!res.ok) return [];
    const j = await res.json();
    const list: NaverArticle[] = j?.isSuccess && Array.isArray(j.result) ? j.result : [];
    return list.map((a) => toNewsItem(a, label)).filter((x): x is NewsItem => x !== null);
  } catch {
    return [];
  }
}

// ── 캐시 ──────────────────────────────────────────────────────────────────────
let _cache: NewsItem[] = [];
let _cacheTs = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5분

export async function GET() {
  if (_cache.length > 0 && Date.now() - _cacheTs < CACHE_TTL) {
    return NextResponse.json(_cache, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  }

  const results = await Promise.allSettled(SECTIONS.map((s) => fetchSection(s.id, s.label)));

  const news: NewsItem[] = results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    // 중복 제거(같은 기사가 주요·많이 본에 겹침)
    .filter((item, idx, arr) => arr.findIndex((a) => a.link === item.link) === idx)
    // 최신순
    .sort((a, b) => (b.pubDate ? Date.parse(b.pubDate) : 0) - (a.pubDate ? Date.parse(a.pubDate) : 0))
    .slice(0, 40);

  if (news.length > 0) {
    _cache = news;
    _cacheTs = Date.now();
  }

  return NextResponse.json(news.length > 0 ? news : _cache, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
