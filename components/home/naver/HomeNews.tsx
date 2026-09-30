'use client';

/**
 * 홈 하단 주요 뉴스 — /api/news 상위 항목을 4열(데스크탑)·가로 스크롤(모바일)로.
 * 네이버 홈의 '오늘아침 라이브' 영상은 소스가 없어 제외(정직성).
 */
import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import Fold, { Chevron, useMediaQuery } from './Fold';

interface NewsItem { title: string; link: string; source: string; pubDate?: string }
const fetcher = (u: string) => fetch(u).then((r) => r.json());

function ago(pub?: string): string {
  if (!pub) return '';
  const diff = Date.now() - new Date(pub).getTime();
  if (!Number.isFinite(diff) || diff < 0) return '';
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default function HomeNews() {
  // 국내는 사이드 '최근 소식'이 담당 → 여기는 해외(중복 방지)
  const { data } = useSWR<NewsItem[]>('/api/news?category=international', fetcher, { refreshInterval: 300000, revalidateOnFocus: false });
  const items = (data ?? []).slice(0, 6);
  const isMobile = useMediaQuery('(max-width: 1023px)', true);
  const [open, setOpen] = useState(false); // 모바일 기본 접힘(화면 비율 절약)

  return (
    <div className="fin-card" style={{ padding: 20 }}>
      <div
        className={`nv-news-head${open ? '' : ' closed'}`}
        style={{ display: 'flex', alignItems: 'center', cursor: isMobile ? 'pointer' : 'default' }}
        onClick={isMobile ? () => setOpen((o) => !o) : undefined}
      >
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>해외 주요 뉴스</h3>
        <Link href="/news" onClick={(e) => e.stopPropagation()} style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>더보기 →</Link>
        <span aria-hidden className="nv-m-only" style={{ marginLeft: 8, width: 28, height: 28, placeItems: 'center', color: 'var(--muted)' }}>
          <Chevron open={open} />
        </span>
      </div>
      <Fold open={open} enabled={isMobile}>
      {items.length === 0 ? (
        <div className="skeleton" style={{ height: 120, borderRadius: 10 }} />
      ) : (
        <div className="news-grid">
          {items.map((n, i) => (
            <a key={i} href={n.link} target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', textDecoration: 'none', padding: 14, borderRadius: 'var(--r-sm)', background: 'var(--surface-2)' }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', letterSpacing: '-0.02em' }}>{n.title}</div>
              <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 8 }}>{n.source}{ago(n.pubDate) ? ` · ${ago(n.pubDate)}` : ''}</div>
            </a>
          ))}
        </div>
      )}
      </Fold>
      <style jsx>{`
        .news-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        @media (max-width: 900px) { .news-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 560px) { .news-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
