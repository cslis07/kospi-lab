/**
 * 네이버 증권 뉴스 스크래퍼
 * https://finance.naver.com/news/
 *
 * EUC-KR 인코딩 → TextDecoder로 처리
 * 섹션: 시황/전략(401), 주식분석/리포트(402), 증권일반(404)
 */
import { NextResponse } from 'next/server';
import type { NewsItem } from '@/lib/types';

const BASE = 'https://finance.naver.com';
const HDR = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  Referer: 'https://finance.naver.com/',
};

const SECTIONS = [
  { id: '401', label: '시황/전략' },
  { id: '402', label: '주식분석' },
  { id: '404', label: '증권일반' },
];

// EUC-KR 디코딩 후 뉴스 항목 추출
function parseNaverNewsHtml(html: string, sectionLabel: string): NewsItem[] {
  const items: NewsItem[] = [];

  // <dl> 블록에서 뉴스 기사 추출
  // 패턴: <dt class="articleSubject"> ... <a href="..."> 제목 </a> </dt>
  //        <dd class="articleSummary"> 요약 ... <span class="wdate"> 날짜 </span> </dd>
  //        <dd class="articleSection"> 출처 </dd>

  // href 와 제목 추출
  const articlePattern =
    /href="(\/news\/news_read\.naver\?[^"]+)"[^>]*(?:title="([^"]*)")?[^>]*>\s*([^<]{5,}?)\s*<\/a>/g;

  let match: RegExpExecArray | null;
  const links: { href: string; title: string }[] = [];

  while ((match = articlePattern.exec(html)) !== null) {
    const href = match[1];
    const title = (match[2] || match[3] || '').trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    if (title && title.length > 5 && !links.some((l) => l.href === href)) {
      links.push({ href, title });
    }
  }

  // 날짜 패턴 (wdate)
  const dateMatches: string[] = [];
  const datePattern = /class="wdate"[^>]*>([^<]+)<\/span>/g;
  let dm: RegExpExecArray | null;
  while ((dm = datePattern.exec(html)) !== null) {
    dateMatches.push(dm[1].trim());
  }

  // 출처(언론사)
  const sourceMatches: string[] = [];
  const srcPattern = /class="articleSection"[^>]*>[^<]*<a[^>]*>([^<]+)<\/a>/g;
  let sm: RegExpExecArray | null;
  while ((sm = srcPattern.exec(html)) !== null) {
    sourceMatches.push(sm[1].trim());
  }

  // 요약
  const summaryMatches: string[] = [];
  const sumPattern = /class="articleSummary"[^>]*>([\s\S]*?)<\/dd>/g;
  let sumM: RegExpExecArray | null;
  while ((sumM = sumPattern.exec(html)) !== null) {
    const raw = sumM[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    summaryMatches.push(raw);
  }

  const maxItems = Math.min(links.length, 15);
  for (let i = 0; i < maxItems; i++) {
    const { href, title } = links[i];
    const pubDate  = dateMatches[i] ?? '';
    const source   = sourceMatches[i] ?? `네이버 증권 ${sectionLabel}`;
    const summary  = summaryMatches[i]?.split(' ').slice(0, 30).join(' ') ?? '';

    // 날짜 파싱 (YYYY.MM.DD HH:mm 형식)
    let pubDateISO: string | undefined;
    const dp = pubDate.match(/(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})/);
    if (dp) {
      pubDateISO = `${dp[1]}-${dp[2]}-${dp[3]}T${dp[4]}:${dp[5]}:00+09:00`;
    }

    items.push({
      title,
      link: `${BASE}${href}`,
      pubDate: pubDateISO,
      summary: summary.slice(0, 200),
      source,
      category: 'domestic',
    });
  }

  return items;
}

async function fetchSection(sectionId: string, label: string): Promise<NewsItem[]> {
  const url =
    `${BASE}/news/news_list.naver` +
    `?mode=LSS3D&section_id=101&section_id2=258&section_id3=${sectionId}`;
  try {
    const res = await fetch(url, {
      headers: HDR,
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const buf = await res.arrayBuffer();
    const html = new TextDecoder('euc-kr').decode(buf);
    return parseNaverNewsHtml(html, label);
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

  const results = await Promise.allSettled(
    SECTIONS.map((s) => fetchSection(s.id, s.label))
  );

  const news: NewsItem[] = results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    // 중복 제거
    .filter((item, idx, arr) => arr.findIndex((a) => a.title === item.title) === idx)
    // 최신순
    .sort((a, b) => {
      const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return db - da;
    })
    .slice(0, 40);

  if (news.length > 0) {
    _cache = news;
    _cacheTs = Date.now();
  }

  return NextResponse.json(news.length > 0 ? news : _cache, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
