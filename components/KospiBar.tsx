'use client';

import { useState } from 'react';
import useSWR from 'swr';
import type { MarketIndex } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function fmt(n: number, decimals = 2) {
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

interface IndexCardProps {
  index: MarketIndex;
  large?: boolean;
}

function IndexCard({ index, large }: IndexCardProps) {
  const isPos = index.changeRate >= 0;
  const color = isPos ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className={`flex flex-col ${large ? 'items-end' : 'items-start'}`}>
      <div className="flex items-center gap-1.5">
        <span className={`font-semibold ${large ? 'text-sm' : 'text-xs'} text-[var(--text-muted)]`}>
          {index.name}
        </span>
        <span className={`text-[10px] px-1 py-px rounded font-semibold ${
          index.status === 'OPEN'
            ? 'bg-emerald-500/20 text-emerald-400'
            : 'bg-white/10 text-[var(--text-muted)]'
        }`}>
          {index.status === 'OPEN' ? '개장' : '마감'}
        </span>
      </div>
      <span className={`font-bold tabular-nums ${large ? 'text-2xl' : 'text-base'} text-[var(--text)]`}>
        {fmt(index.value)}
      </span>
      <span className={`text-xs tabular-nums ${color}`}>
        {isPos ? '+' : ''}{fmt(index.change)} ({isPos ? '+' : ''}{fmt(index.changeRate)}%)
      </span>
    </div>
  );
}

export default function KospiBar() {
  const [expanded, setExpanded] = useState(false);
  const { data } = useSWR('/api/market', fetcher, { refreshInterval: 10000 });

  const kospi: MarketIndex | null = data?.kospi ?? null;
  const kosdaq: MarketIndex | null = data?.kosdaq ?? null;
  const kpi200: MarketIndex | null = data?.kpi200 ?? null;

  if (!kospi) {
    return <div className="h-20 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] animate-pulse mb-6" />;
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] mb-6 transition-all duration-300">
      {/* Main row */}
      <button
        className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors rounded-2xl text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-4">
          {/* Logo */}
          <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center text-lg shrink-0 shadow-lg shadow-red-900/30">
            🇰🇷
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-[var(--text)] text-base">KOSPI</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                kospi.status === 'OPEN'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-white/10 text-[var(--text-muted)]'
              }`}>
                {kospi.status === 'OPEN' ? '개장' : '마감'}
              </span>
              {kosdaq && (
                <>
                  <span className="hidden sm:inline text-[10px] text-[var(--text-muted)]">·</span>
                  <span className="hidden sm:inline text-xs text-[var(--text-muted)]">
                    KOSDAQ{' '}
                    <span className={kosdaq.changeRate >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {kosdaq.changeRate >= 0 ? '+' : ''}{fmt(kosdaq.changeRate)}%
                    </span>{' '}
                    {fmt(kosdaq.value)}
                  </span>
                </>
              )}
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              지수 비교 {expanded ? '접기' : '펼치기'} ↓
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-xs text-[var(--text-muted)] mb-0.5">
              전일대비{' '}
              <span className={kospi.changeRate >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {kospi.changeRate >= 0 ? '+' : ''}{fmt(kospi.change)}{' '}
                {kospi.changeRate >= 0 ? '+' : ''}{fmt(kospi.changeRate)}%
              </span>
            </div>
            <span className="text-2xl font-bold tabular-nums text-[var(--text)]">
              {fmt(kospi.value)}
            </span>
          </div>
          <svg
            className={`w-4 h-4 text-[var(--text-muted)] transition-transform duration-300 ${expanded ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>

      {/* Expanded index comparison */}
      {expanded && (
        <div className="border-t border-[var(--border)] px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* KOSPI */}
          <div className="rounded-xl border border-[var(--border)] bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-xs font-semibold text-[var(--text-muted)]">KOSPI</span>
              <span className="text-[9px] px-1 py-px rounded bg-white/10 text-[var(--text-muted)]">
                유가증권시장
              </span>
            </div>
            <p className="text-xl font-bold tabular-nums text-[var(--text)]">{fmt(kospi.value)}</p>
            <p className={`text-sm mt-0.5 ${kospi.changeRate >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {kospi.changeRate >= 0 ? '+' : ''}{fmt(kospi.change)} ({kospi.changeRate >= 0 ? '+' : ''}{fmt(kospi.changeRate)}%)
            </p>
          </div>

          {/* KOSDAQ */}
          {kosdaq ? (
            <div className="rounded-xl border border-[var(--border)] bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-purple-400" />
                <span className="text-xs font-semibold text-[var(--text-muted)]">KOSDAQ</span>
                <span className="text-[9px] px-1 py-px rounded bg-white/10 text-[var(--text-muted)]">
                  코스닥시장
                </span>
              </div>
              <p className="text-xl font-bold tabular-nums text-[var(--text)]">{fmt(kosdaq.value)}</p>
              <p className={`text-sm mt-0.5 ${kosdaq.changeRate >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {kosdaq.changeRate >= 0 ? '+' : ''}{fmt(kosdaq.change)} ({kosdaq.changeRate >= 0 ? '+' : ''}{fmt(kosdaq.changeRate)}%)
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border)] bg-white/[0.03] p-4 animate-pulse" />
          )}

          {/* KPI200 */}
          {kpi200 ? (
            <div className="rounded-xl border border-[var(--border)] bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-sky-400" />
                <span className="text-xs font-semibold text-[var(--text-muted)]">KPI200</span>
                <span className="text-[9px] px-1 py-px rounded bg-white/10 text-[var(--text-muted)]">
                  KOSPI 200
                </span>
              </div>
              <p className="text-xl font-bold tabular-nums text-[var(--text)]">{fmt(kpi200.value)}</p>
              <p className={`text-sm mt-0.5 ${kpi200.changeRate >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {kpi200.changeRate >= 0 ? '+' : ''}{fmt(kpi200.change)} ({kpi200.changeRate >= 0 ? '+' : ''}{fmt(kpi200.changeRate)}%)
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border)] bg-white/[0.03] p-4 animate-pulse" />
          )}
        </div>
      )}
    </div>
  );
}
