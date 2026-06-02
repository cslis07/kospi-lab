'use client';

import type { NewsItem } from '@/lib/types';

// 소스별 accent 색상
const SOURCE_COLORS: Record<string, string> = {
  'CNBC':           'bg-blue-500/15 text-blue-400',
  'CNN Business':   'bg-red-500/15 text-red-400',
  'Yahoo Finance':  'bg-purple-500/15 text-purple-400',
  'Federal Reserve':'bg-emerald-500/15 text-emerald-400',
  'Bloomberg':      'bg-orange-500/15 text-orange-400',
  'MarketScreener': 'bg-cyan-500/15 text-cyan-400',
  '네이버 경제':    'bg-green-500/15 text-green-400',
  '한국경제':       'bg-yellow-500/15 text-yellow-400',
  '매일경제':       'bg-pink-500/15 text-pink-400',
  '조선비즈':       'bg-indigo-500/15 text-indigo-400',
};

// 소스별 배경 그라데이션 (썸네일 대체)
const SOURCE_GRADIENTS: Record<string, string> = {
  'CNBC':           'from-blue-900 to-blue-700',
  'CNN Business':   'from-red-900 to-red-700',
  'Yahoo Finance':  'from-purple-900 to-purple-700',
  'Bloomberg':      'from-orange-900 to-orange-700',
  'Federal Reserve':'from-emerald-900 to-emerald-700',
  'MarketScreener': 'from-cyan-900 to-cyan-700',
  '네이버 경제':    'from-green-900 to-green-700',
  '한국경제':       'from-yellow-900 to-yellow-700',
  '매일경제':       'from-pink-900 to-pink-700',
  '조선비즈':       'from-indigo-900 to-indigo-700',
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

function SourceInitial({ source }: { source: string }) {
  const grad = SOURCE_GRADIENTS[source] ?? 'from-slate-800 to-slate-600';
  const initial = source.slice(0, 2);
  return (
    <div className={`w-[90px] shrink-0 h-full min-h-[72px] rounded-l-xl bg-gradient-to-br ${grad} flex items-center justify-center`}>
      <span className="text-white/60 text-xs font-bold tracking-wide leading-tight text-center px-1">
        {initial}
      </span>
    </div>
  );
}

/* ── 가로형 뉴스 카드 (kospilab 스타일) ──────────────────── */
export function NewsCardHorizontal({ item }: { item: NewsItem }) {
  const colorClass = SOURCE_COLORS[item.source] ?? 'bg-white/10 text-gray-400';
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-[88px] rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-white/20 hover:bg-white/5 transition-all group overflow-hidden"
    >
      {/* 왼쪽: 썸네일 플레이스홀더 */}
      <SourceInitial source={item.source} />

      {/* 오른쪽: 내용 */}
      <div className="flex-1 min-w-0 p-3 flex flex-col justify-between">
        <p className="text-sm font-medium text-[var(--text)] leading-snug group-hover:text-white line-clamp-2">
          {item.title}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${colorClass}`}>
            {item.source}
          </span>
          <span className="text-[10px] text-[var(--text-muted)]">{relativeTime(item.pubDate)}</span>
        </div>
      </div>
    </a>
  );
}

/* ── 기존 카드 (해외 뉴스용 그리드, 하위호환) ─────────────── */
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
