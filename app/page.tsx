'use client';

import Header from '@/components/Header';
import SearchBar from '@/components/SearchBar';
import StockCard from '@/components/StockCard';
import { useWatchlist } from '@/hooks/useWatchlist';

export default function Home() {
  const { watchlist, add, remove, mounted } = useWatchlist();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-lg font-semibold text-white">내 관심종목</h2>
            <p className="text-sm text-gray-500 mt-0.5">5초마다 자동 갱신 · 장중 실시간 데이터</p>
          </div>
          <SearchBar onAdd={add} />
        </div>

        {!mounted ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-2xl border border-white/8 bg-white/3 p-5 animate-pulse h-44" />
            ))}
          </div>
        ) : watchlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-gray-400 font-medium">관심 종목이 없습니다</p>
            <p className="text-gray-600 text-sm mt-1">위 검색창에서 종목을 추가하세요</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {watchlist.map((item) => (
              <StockCard
                key={item.ticker}
                ticker={item.ticker}
                name={item.name}
                market={item.market}
                onRemove={remove}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-white/5 py-4 text-center text-xs text-gray-600">
        데이터 출처: 네이버 금융 · 장중 5초 간격 갱신 · 투자 참고용
      </footer>
    </div>
  );
}
