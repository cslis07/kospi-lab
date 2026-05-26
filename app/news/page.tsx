'use client';

import { useState } from 'react';
import useSWR from 'swr';
import NewsCard from '@/components/NewsCard';
import type { NewsItem } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Tab = 'international' | 'domestic';

const TABS: { key: Tab; label: string; emoji: string }[] = [
  { key: 'international', label: '해외 뉴스', emoji: '🌐' },
  { key: 'domestic', label: '국내 뉴스', emoji: '🇰🇷' },
];

const SOURCES_INFO: Record<string, string> = {
  international: 'Bloomberg · CNN Business · Yahoo Finance · CNBC · Federal Reserve · MarketScreener',
  domestic: '네이버 경제 · 한국경제 · 매일경제 · 조선비즈',
};

export default function NewsPage() {
  const [tab, setTab] = useState<Tab>('international');

  const { data, isLoading, error } = useSWR<NewsItem[]>(
    `/api/news?category=${tab}`,
    fetcher,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: false }
  );

  const sources = Array.from(new Set((data ?? []).map((n) => n.source)));

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[var(--text)]">뉴스 소식</h2>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">{SOURCES_INFO[tab]}</p>
      </div>

      {/* Tab selector */}
      <div className="flex gap-2 mb-6 border-b border-[var(--border)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.key
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <span>{t.emoji}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Source filter pills */}
      {sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {sources.map((s) => (
            <span key={s} className="text-xs px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-muted)]">
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Content */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 animate-pulse h-28" />
          ))}
        </div>
      )}

      {error && (
        <div className="text-center py-16 text-[var(--text-muted)]">
          <p>뉴스를 불러오지 못했습니다</p>
          <p className="text-xs mt-1 opacity-60">잠시 후 다시 시도해 주세요</p>
        </div>
      )}

      {!isLoading && !error && data && data.length === 0 && (
        <div className="text-center py-16 text-[var(--text-muted)]">
          <p>현재 뉴스를 가져올 수 없습니다</p>
          <p className="text-xs mt-1 opacity-60">일부 소스가 접근을 제한할 수 있습니다</p>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((item, i) => (
            <NewsCard key={`${item.source}-${i}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
