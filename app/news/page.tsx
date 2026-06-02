'use client';

import { useState } from 'react';
import useSWR from 'swr';
import NewsCard from '@/components/NewsCard';
import type { NewsItem } from '@/lib/types';
import type { DisclosureItem } from '@/app/api/news/disclosures/route';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Tab = 'international' | 'domestic' | 'disclosure';

const TABS: { key: Tab; label: string; emoji: string }[] = [
  { key: 'international', label: '해외 뉴스', emoji: '🌐' },
  { key: 'domestic',      label: '국내 뉴스', emoji: '🇰🇷' },
  { key: 'disclosure',   label: '공시',      emoji: '📋' },
];

const SOURCES_INFO: Record<Tab, string> = {
  international: 'Bloomberg · CNN Business · Yahoo Finance · CNBC · Federal Reserve · MarketScreener',
  domestic:      '네이버 경제 · 한국경제 · 매일경제 · 조선비즈',
  disclosure:    'DART 전자공시 · KIND KRX 당일 공시',
};

/* ── 공시 목록 컴포넌트 ──────────────────────────────────────────────────────── */
function DisclosureList({ items }: { items: DisclosureItem[] }) {
  if (!items.length) {
    return (
      <div className="text-center py-16 text-[var(--text-muted)]">
        <p>오늘 공시 내역이 없습니다</p>
        <p className="text-xs mt-1 opacity-60">장 시간 중 DART·KIND에서 갱신됩니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <a
          key={i}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-sky-500/40 hover:bg-sky-500/5 transition-colors group"
        >
          {/* Source badge */}
          <span className={`mt-0.5 shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
            item.source === 'DART'
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-amber-500/20 text-amber-400'
          }`}>
            {item.source}
          </span>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[var(--text)] leading-snug group-hover:text-sky-400 transition-colors line-clamp-2">
              {item.title}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-[var(--text-muted)] font-medium truncate">{item.company}</span>
              {item.ticker && (
                <span className="text-xs text-[var(--text-muted)] font-mono opacity-60">{item.ticker}</span>
              )}
              <span className="text-xs text-[var(--text-muted)] opacity-50 ml-auto shrink-0">{item.time}</span>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

/* ── 메인 페이지 ─────────────────────────────────────────────────────────────── */
export default function NewsPage() {
  const [tab, setTab] = useState<Tab>('international');

  const { data: newsData, isLoading: newsLoading, error: newsError } = useSWR<NewsItem[]>(
    tab !== 'disclosure' ? `/api/news?category=${tab}` : null,
    fetcher,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: false }
  );

  const { data: discData, isLoading: discLoading, error: discError } = useSWR<DisclosureItem[]>(
    tab === 'disclosure' ? '/api/news/disclosures' : null,
    fetcher,
    { refreshInterval: 60 * 1000, revalidateOnFocus: false }
  );

  const isLoading = tab === 'disclosure' ? discLoading : newsLoading;
  const hasError  = tab === 'disclosure' ? discError   : newsError;

  const sources = Array.from(new Set((newsData ?? []).map((n) => n.source)));

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

      {/* Source filter pills (news tabs only) */}
      {tab !== 'disclosure' && sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {sources.map((s) => (
            <span key={s} className="text-xs px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-muted)]">
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Disclosure count badge */}
      {tab === 'disclosure' && discData && discData.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">
            오늘 공시 {discData.length}건
          </span>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        tab === 'disclosure' ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 animate-pulse h-16" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 animate-pulse h-28" />
            ))}
          </div>
        )
      )}

      {/* Error */}
      {hasError && (
        <div className="text-center py-16 text-[var(--text-muted)]">
          <p>{tab === 'disclosure' ? '공시 정보를 불러오지 못했습니다' : '뉴스를 불러오지 못했습니다'}</p>
          <p className="text-xs mt-1 opacity-60">잠시 후 다시 시도해 주세요</p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !hasError && tab !== 'disclosure' && newsData && newsData.length === 0 && (
        <div className="text-center py-16 text-[var(--text-muted)]">
          <p>현재 뉴스를 가져올 수 없습니다</p>
          <p className="text-xs mt-1 opacity-60">일부 소스가 접근을 제한할 수 있습니다</p>
        </div>
      )}

      {/* Disclosure list */}
      {!isLoading && !hasError && tab === 'disclosure' && (
        <DisclosureList items={discData ?? []} />
      )}

      {/* News grid */}
      {!isLoading && !hasError && tab !== 'disclosure' && newsData && newsData.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {newsData.map((item, i) => (
            <NewsCard key={`${item.source}-${i}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
