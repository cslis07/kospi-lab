'use client';

/**
 * 내 관심종목 페이지
 * 기존 대시보드의 watchlist 섹션을 분리한 독립 페이지
 */

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import SearchBar from '@/components/SearchBar';
import OverseasSearchBar from '@/components/OverseasSearchBar';
import StockCard from '@/components/StockCard';
import OverseasStockCard from '@/components/OverseasStockCard';
import StockFilter, { type SortKey, type FilterMarket } from '@/components/StockFilter';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useOverseasWatchlist } from '@/hooks/useOverseasWatchlist';
import { useCryptoWatchlist } from '@/hooks/useCryptoWatchlist';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useAlerts } from '@/hooks/useAlerts';
import CryptoCard from '@/components/CryptoCard';
import type { StockData, OverseasStockData, CryptoData } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type MarketTab = 'domestic' | 'overseas' | 'crypto';

/* ── 마켓 탭 버튼 ───────────────────────────────────────── */
function MarketTabBar({
  active, onChange, domesticCount, overseasCount, cryptoCount,
}: {
  active: MarketTab;
  onChange: (t: MarketTab) => void;
  domesticCount: number;
  overseasCount: number;
  cryptoCount: number;
}) {
  const tabs = [
    { id: 'domestic' as const, label: '🇰🇷 국내',  count: domesticCount, activeClass: 'bg-sky-500 shadow-sky-500/30' },
    { id: 'overseas' as const, label: '🌐 해외',   count: overseasCount, activeClass: 'bg-sky-500 shadow-sky-500/30' },
    { id: 'crypto'   as const, label: '₿ 코인',   count: cryptoCount,   activeClass: 'bg-amber-500 shadow-amber-500/30' },
  ];
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] w-fit"
      style={{ boxShadow: 'var(--shadow-pill)' }}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            active === tab.id
              ? `${tab.activeClass} text-white shadow-sm`
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
        >
          {tab.label}
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
            active === tab.id ? 'bg-white/20 text-white' : 'bg-[var(--border)] text-[var(--text-muted)]'
          }`}>{tab.count}</span>
        </button>
      ))}
    </div>
  );
}

/* ── 빈 상태 ─────────────────────────────────────────────── */
function EmptyState({ hasItems, label }: { hasItems: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-28 text-center">
      <div className="w-14 h-14 rounded-full bg-[var(--border)] flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <p className="text-[var(--text-muted)] font-medium">
        {hasItems ? '해당 조건의 종목이 없습니다' : `관심 ${label}이 없습니다`}
      </p>
      <p className="text-[var(--text-muted)] text-sm mt-1 opacity-60">
        {hasItems ? '필터를 변경해 보세요' : '위 검색창에서 종목을 추가하세요'}
      </p>
    </div>
  );
}

/* ── 내부 컴포넌트 ──────────────────────────────────────── */
function MyStocksInner() {
  const searchParams = useSearchParams();

  const [marketTab, setMarketTab] = useState<MarketTab>('domestic');
  useEffect(() => {
    const urlMarket = searchParams.get('market') as MarketTab | null;
    if (urlMarket && ['domestic', 'overseas', 'crypto'].includes(urlMarket)) {
      setMarketTab(urlMarket);
      return;
    }
    const stored = localStorage.getItem('kospi-lab-my-stocks-tab') as MarketTab | null;
    if (stored) setMarketTab(stored);
  }, [searchParams]);

  const switchTab = (t: MarketTab) => {
    setMarketTab(t);
    localStorage.setItem('kospi-lab-my-stocks-tab', t);
  };

  // 국내
  const { watchlist, add, remove, mounted }  = useWatchlist();
  const { portfolio }                         = usePortfolio();
  const { alerts }                            = useAlerts();
  const [sort, setSort]   = useState<SortKey>('default');
  const [filter, setFilter] = useState<FilterMarket>('all');

  // 해외
  const { watchlist: overseas, add: addOverseas, remove: removeOverseas, mounted: oMounted } =
    useOverseasWatchlist();

  // 코인
  const { watchlist: cryptos, remove: removeCrypto, mounted: cMounted } = useCryptoWatchlist();

  // 시장 데이터 (환율)
  const { data: market } = useSWR('/api/market', fetcher, { refreshInterval: 10000 });
  const usdRate = market?.usdkrw?.value as number | undefined;

  // 국내 배치 조회
  const tickers = watchlist.map((w) => w.ticker).join(',');
  const { data: allStocks } = useSWR<Record<string, StockData>>(
    tickers ? `/api/stock/batch?tickers=${tickers}` : null,
    fetcher,
    { refreshInterval: 5000 }
  );

  // 해외 배치 조회
  const symbols = overseas.map((o) => o.symbol).join(',');
  const { data: allOverseas } = useSWR<Record<string, OverseasStockData>>(
    symbols ? `/api/overseas/batch?symbols=${symbols}` : null,
    fetcher,
    { refreshInterval: 15000 }
  );

  // 코인 배치 조회
  const cryptoSymbols = cryptos.map((c) => c.symbol).join(',');
  const { data: allCryptos } = useSWR<Record<string, CryptoData>>(
    cryptoSymbols ? `/api/crypto/batch?symbols=${cryptoSymbols}` : null,
    fetcher,
    { refreshInterval: 5000 }
  );

  // 국내 필터/정렬
  const filtered = useMemo(() => {
    const items = watchlist.filter((w) => filter === 'all' || w.market === filter);
    if (sort === 'default') return items;
    return [...items].sort((a, b) => {
      const da = allStocks?.[a.ticker];
      const db = allStocks?.[b.ticker];
      if (!da || !db) return 0;
      if (sort === 'changeRate')    return db.changeRate - da.changeRate;
      if (sort === 'changeRateAsc') return da.changeRate - db.changeRate;
      return 0;
    });
  }, [watchlist, filter, sort, allStocks]);

  // 포트폴리오 총손익
  const totalPnl = useMemo(() => {
    if (!allStocks) return null;
    let total = 0; let hasAny = false;
    Object.entries(portfolio).forEach(([ticker, entry]) => {
      const s = allStocks[ticker];
      if (!s) return;
      total += (s.price - entry.avgPrice) * entry.quantity;
      hasAny = true;
    });
    return hasAny ? total : null;
  }, [allStocks, portfolio]);

  // 해외 정렬
  const filteredOverseas = useMemo(() => {
    if (sort === 'changeRate')
      return [...overseas].sort((a, b) =>
        (allOverseas?.[b.symbol]?.changeRate ?? 0) - (allOverseas?.[a.symbol]?.changeRate ?? 0));
    if (sort === 'changeRateAsc')
      return [...overseas].sort((a, b) =>
        (allOverseas?.[a.symbol]?.changeRate ?? 0) - (allOverseas?.[b.symbol]?.changeRate ?? 0));
    return overseas;
  }, [overseas, sort, allOverseas]);

  return (
    <div>
      {/* ── 헤더 ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-[var(--text)]">내 관심종목</h2>
          <MarketTabBar
            active={marketTab}
            onChange={switchTab}
            domesticCount={watchlist.length}
            overseasCount={overseas.length}
            cryptoCount={cryptos.length}
          />
          {/* 포트폴리오 손익 */}
          {marketTab === 'domestic' && totalPnl !== null && (
            <div className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
              totalPnl >= 0
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-red-500/30 bg-red-500/10 text-red-400'
            }`}>
              포트폴리오 {totalPnl >= 0 ? '+' : ''}
              {new Intl.NumberFormat('ko-KR').format(Math.round(totalPnl))}원
            </div>
          )}
        </div>
        {/* 검색창 */}
        {marketTab === 'domestic'
          ? <SearchBar onAdd={add} />
          : <OverseasSearchBar onAdd={addOverseas} />
        }
      </div>

      {/* 국내 필터 */}
      {marketTab === 'domestic' && mounted && watchlist.length > 0 && (
        <div className="mb-5">
          <StockFilter sort={sort} filter={filter} onSort={setSort} onFilter={setFilter} count={filtered.length} />
        </div>
      )}

      {/* 해외 정렬 */}
      {marketTab === 'overseas' && oMounted && overseas.length > 0 && (
        <div className="mb-5 flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span>정렬</span>
          {([
            { key: 'default'       as SortKey, label: '기본' },
            { key: 'changeRate'    as SortKey, label: '▲ 등락률' },
            { key: 'changeRateAsc' as SortKey, label: '▼ 등락률' },
          ] as const).map((s) => (
            <button key={s.key} onClick={() => setSort(s.key)}
              className={`px-3 py-1 rounded-lg border transition-colors ${
                sort === s.key
                  ? 'border-sky-500/50 bg-sky-500/10 text-sky-400'
                  : 'border-[var(--border)] hover:text-[var(--text)]'
              }`}>{s.label}</button>
          ))}
        </div>
      )}

      {/* ── 국내 카드 ── */}
      {marketTab === 'domestic' && (
        !mounted
          ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] h-[420px] animate-pulse" />)}
            </div>
          : filtered.length === 0
            ? <EmptyState hasItems={watchlist.length > 0} label="종목" />
            : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-8">
                {filtered.map((item) => (
                  <StockCard
                    key={item.ticker}
                    ticker={item.ticker}
                    name={item.name}
                    market={item.market}
                    usdRate={usdRate}
                    portfolio={portfolio[item.ticker]}
                    alert={alerts[item.ticker]}
                    onRemove={remove}
                  />
                ))}
              </div>
      )}

      {/* ── 해외 카드 ── */}
      {marketTab === 'overseas' && (
        !oMounted
          ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(5)].map((_, i) => <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] h-[360px] animate-pulse" />)}
            </div>
          : filteredOverseas.length === 0
            ? <EmptyState hasItems={false} label="해외 종목" />
            : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-8">
                {filteredOverseas.map((item) => (
                  <OverseasStockCard
                    key={item.symbol}
                    symbol={item.symbol}
                    name={item.name}
                    exchange={item.exchange}
                    data={allOverseas?.[item.symbol]}
                    usdRate={usdRate}
                    onRemove={removeOverseas}
                  />
                ))}
              </div>
      )}

      {/* ── 코인 카드 ── */}
      {marketTab === 'crypto' && (
        !cMounted
          ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] h-[360px] animate-pulse" />)}
            </div>
          : cryptos.length === 0
            ? <EmptyState hasItems={false} label="코인" />
            : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-8">
                {cryptos.map((item) => (
                  <CryptoCard
                    key={item.symbol}
                    symbol={item.symbol}
                    base={item.base}
                    name={item.name}
                    data={allCryptos?.[item.symbol]}
                    usdRate={usdRate}
                    onRemove={removeCrypto}
                  />
                ))}
              </div>
      )}
    </div>
  );
}

/* ── export ──────────────────────────────────────────────── */
export default function MyStocksPage() {
  return (
    <Suspense fallback={
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] h-[360px] animate-pulse" />
        ))}
      </div>
    }>
      <MyStocksInner />
    </Suspense>
  );
}
