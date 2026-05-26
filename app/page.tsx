'use client';

import { useState, useMemo } from 'react';
import SearchBar from '@/components/SearchBar';
import StockCard from '@/components/StockCard';
import StockFilter, { type SortKey, type FilterMarket } from '@/components/StockFilter';
import { useWatchlist } from '@/hooks/useWatchlist';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useAlerts } from '@/hooks/useAlerts';
import useSWR from 'swr';
import type { StockData } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function DashboardPage() {
  const { watchlist, add, remove, mounted } = useWatchlist();
  const { portfolio } = usePortfolio();
  const { alerts } = useAlerts();
  const [sort, setSort] = useState<SortKey>('default');
  const [filter, setFilter] = useState<FilterMarket>('all');

  // Fetch all stock data for sorting
  const tickers = watchlist.map((w) => w.ticker).join(',');
  const { data: allStocks } = useSWR<Record<string, StockData>>(
    tickers
      ? `/api/stock/batch?tickers=${tickers}`
      : null,
    fetcher,
    { refreshInterval: 5000 }
  );

  const filtered = useMemo(() => {
    let items = watchlist.filter(
      (w) => filter === 'all' || (w.market || 'KOSPI') === filter
    );
    if (sort === 'default') return items;

    return [...items].sort((a, b) => {
      const da = allStocks?.[a.ticker];
      const db = allStocks?.[b.ticker];
      if (!da || !db) return 0;
      if (sort === 'changeRate') return db.changeRate - da.changeRate;
      if (sort === 'changeRateAsc') return da.changeRate - db.changeRate;
      return 0;
    });
  }, [watchlist, filter, sort, allStocks]);

  // Total portfolio value
  const totalPnl = useMemo(() => {
    if (!allStocks) return null;
    let total = 0;
    let hasAny = false;
    Object.entries(portfolio).forEach(([ticker, entry]) => {
      const stock = allStocks[ticker];
      if (!stock) return;
      total += (stock.price - entry.avgPrice) * entry.quantity;
      hasAny = true;
    });
    return hasAny ? total : null;
  }, [allStocks, portfolio]);

  return (
    <div>
      {/* Top controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">내 관심종목</h2>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">5초마다 자동 갱신</p>
        </div>
        <div className="flex items-center gap-3">
          {totalPnl !== null && (
            <div className={`text-sm font-semibold px-3 py-1.5 rounded-lg border ${
              totalPnl >= 0
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-red-500/30 bg-red-500/10 text-red-400'
            }`}>
              포트폴리오 {totalPnl >= 0 ? '+' : ''}{new Intl.NumberFormat('ko-KR').format(Math.round(totalPnl))}원
            </div>
          )}
          <SearchBar onAdd={add} />
        </div>
      </div>

      {/* Filter bar */}
      {mounted && watchlist.length > 0 && (
        <div className="mb-4">
          <StockFilter
            sort={sort}
            filter={filter}
            onSort={setSort}
            onFilter={setFilter}
            count={filtered.length}
          />
        </div>
      )}

      {/* Grid */}
      {!mounted ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 animate-pulse h-52" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-[var(--text-muted)] font-medium">
            {watchlist.length === 0 ? '관심 종목이 없습니다' : '해당 조건의 종목이 없습니다'}
          </p>
          <p className="text-[var(--text-muted)] text-sm mt-1 opacity-60">
            {watchlist.length === 0 ? '위 검색창에서 종목을 추가하세요' : '필터를 변경해 보세요'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <StockCard
              key={item.ticker}
              ticker={item.ticker}
              name={item.name}
              market={item.market}
              portfolio={portfolio[item.ticker]}
              alert={alerts[item.ticker]}
              onRemove={remove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
