'use client';

import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function fmt(n: number, decimals = 2) {
  return new Intl.NumberFormat('ko-KR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}

export default function KospiBar() {
  const { data } = useSWR('/api/market', fetcher, { refreshInterval: 10000 });
  const kospi = data?.kospi;
  const kosdaq = data?.kosdaq;

  if (!kospi) {
    return <div className="h-20 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] animate-pulse mb-6" />;
  }

  const isPos = kospi.changeRate >= 0;
  const isOpen = kospi.status === 'OPEN';

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-5 py-4 mb-6 flex items-center justify-between gap-4 hover:border-[var(--border-hover)] transition-colors cursor-pointer">
      <div className="flex items-center gap-4">
        {/* KOSPI Logo */}
        <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center text-white font-bold text-base shrink-0 shadow-lg shadow-red-900/30">
          🇰🇷
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-[var(--text)] text-base">KOSPI</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
              isOpen ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-[var(--text-muted)]'
            }`}>
              {isOpen ? '개장' : '마감'}
            </span>
            {kosdaq && (
              <span className="hidden sm:inline text-[10px] text-[var(--text-muted)]">·</span>
            )}
            {kosdaq && (
              <span className="hidden sm:inline text-xs text-[var(--text-muted)]">
                KOSDAQ <span className={kosdaq.changeRate >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {kosdaq.changeRate >= 0 ? '+' : ''}{fmt(kosdaq.changeRate)}%
                </span> {new Intl.NumberFormat('ko-KR').format(kosdaq.value)}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">네이버 금융 지수 · 탭하면 다른 지수도 비교</p>
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="text-xs text-[var(--text-muted)] mb-0.5">
          전일대비{' '}
          <span className={isPos ? 'text-emerald-400' : 'text-red-400'}>
            {isPos ? '+' : ''}{fmt(kospi.change)} {isPos ? '+' : ''}{fmt(kospi.changeRate)}%
          </span>
        </div>
        <div className="flex items-center justify-end gap-1.5">
          <span className={`text-2xl font-bold tabular-nums ${isPos ? 'text-white' : 'text-white'}`}>
            {new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 2 }).format(kospi.value)}
          </span>
          <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </div>
  );
}
