'use client';

import type { NewsItem } from '@/lib/types';

const SOURCE_COLORS: Record<string, string> = {
  'CNBC': 'bg-blue-500/15 text-blue-400',
  'CNN Business': 'bg-red-500/15 text-red-400',
  'Yahoo Finance': 'bg-purple-500/15 text-purple-400',
  'Federal Reserve': 'bg-emerald-500/15 text-emerald-400',
  'Bloomberg': 'bg-orange-500/15 text-orange-400',
  'MarketScreener': 'bg-cyan-500/15 text-cyan-400',
  '네이버 경제': 'bg-green-500/15 text-green-400',
  '한국경제': 'bg-yellow-500/15 text-yellow-400',
  '매일경제': 'bg-pink-500/15 text-pink-400',
  '조선비즈': 'bg-indigo-500/15 text-indigo-400',
};

function relativeTime(dateStr?: string) {
  if (!dateStr) return '';
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return '방금';
    if (m < 60) return `${m}분 전`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}시간 전`;
    return `${Math.floor(h / 24)}일 전`;
  } catch {
    return '';
  }
}

export default function NewsCard({ item }: { item: NewsItem }) {
  const colorClass = SOURCE_COLORS[item.source] ?? 'bg-white/10 text-gray-400';
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-white/20 hover:bg-white/5 transition-all group"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${colorClass}`}>
          {item.source}
        </span>
        <span className="text-xs text-[var(--text-muted)]">{relativeTime(item.pubDate)}</span>
      </div>
      <p className="text-sm font-medium text-[var(--text)] leading-snug group-hover:text-white line-clamp-2">
        {item.title}
      </p>
      {item.summary && (
        <p className="mt-1.5 text-xs text-[var(--text-muted)] line-clamp-2 leading-relaxed">
          {item.summary}
        </p>
      )}
    </a>
  );
}
