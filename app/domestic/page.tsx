'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import StockDetailModal from '@/components/StockDetailModal';
import { useWatchlist } from '@/hooks/useWatchlist';
import { STOCK_LIST, type StockItem } from '@/lib/stockList';
import type { StockData } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ── 중복 제거된 종목 리스트 (모듈 레벨) ──────────────────────
const ALL_STOCKS: StockItem[] = Array.from(
  new Map(
    (STOCK_LIST as StockItem[]).map((s) => [s.ticker, s])
  ).values()
);

// 20개씩 청크 (배치 API 최대 20)
const C0 = ALL_STOCKS.slice(  0,  20).map((s) => s.ticker).join(',');
const C1 = ALL_STOCKS.slice( 20,  40).map((s) => s.ticker).join(',');
const C2 = ALL_STOCKS.slice( 40,  60).map((s) => s.ticker).join(',');
const C3 = ALL_STOCKS.slice( 60,  80).map((s) => s.ticker).join(',');
const C4 = ALL_STOCKS.slice( 80, 100).map((s) => s.ticker).join(',');
const C5 = ALL_STOCKS.slice(100).map((s) => s.ticker).join(',');

// ── 브랜드 로고 ───────────────────────────────────────────────
const BRAND: Record<string, { bg: string; color: string; label: string }> = {
  '005930': { bg: '#1428A0', color: '#fff',    label: '삼성' },
  '000660': { bg: '#E2001A', color: '#fff',    label: 'SK'  },
  '005380': { bg: '#002C5F', color: '#fff',    label: '현대' },
  '373220': { bg: '#A50034', color: '#fff',    label: 'LG'  },
  '000270': { bg: '#05141F', color: '#fff',    label: '기아' },
  '005490': { bg: '#00388D', color: '#fff',    label: 'PS'  },
  '035420': { bg: '#00C73C', color: '#fff',    label: 'N'   },
  '035720': { bg: '#3A1D6E', color: '#FFCD00', label: 'K'   },
  '051910': { bg: '#A50034', color: '#fff',    label: 'LG'  },
  '068270': { bg: '#0051A2', color: '#fff',    label: 'CT'  },
  '066570': { bg: '#A50034', color: '#fff',    label: 'LG'  },
  '012330': { bg: '#002C5F', color: '#fff',    label: 'HM'  },
};

function CompanyLogo({ ticker, name }: { ticker: string; name: string }) {
  const b = BRAND[ticker];
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
      style={{ backgroundColor: b?.bg ?? '#374151', color: b?.color ?? '#fff' }}
    >
      {b?.label ?? name.slice(0, 2)}
    </div>
  );
}

function fmtPrice(n: number) { return new Intl.NumberFormat('ko-KR').format(Math.round(n)); }

function marketStatus(): string {
  const kst = new Date(Date.now() + 9 * 3_600_000);
  const day = kst.getUTCDay();
  if (day === 0 || day === 6) return '주말 휴장';
  const t = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  if (t < 9 * 60)        return '장 시작 전';
  if (t <= 15 * 60 + 30) return '정규장';
  if (t <= 18 * 60)      return '시간외';
  return '장마감';
}

type SortKey = 'default' | 'changeRateDesc' | 'changeRateAsc' | 'priceDesc';
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'default',        label: '기본순'       },
  { key: 'changeRateDesc', label: '등락률 높은순' },
  { key: 'changeRateAsc',  label: '등락률 낮은순' },
  { key: 'priceDesc',      label: '시가 높은순'   },
];

type MarketFilter = 'all' | 'KOSPI' | 'KOSDAQ';

export default function DomesticPage() {
  // 6청크 × 20종목을 5초마다 갱신하면 5초당 최대 240건이 네이버로 나간다.
  const OPT = { refreshInterval: 15000, dedupingInterval: 5000, revalidateOnFocus: false };
  const { data: d0 } = useSWR<Record<string, StockData>>(C0 ? `/api/stock/batch?tickers=${C0}` : null, fetcher, OPT);
  const { data: d1 } = useSWR<Record<string, StockData>>(C1 ? `/api/stock/batch?tickers=${C1}` : null, fetcher, OPT);
  const { data: d2 } = useSWR<Record<string, StockData>>(C2 ? `/api/stock/batch?tickers=${C2}` : null, fetcher, OPT);
  const { data: d3 } = useSWR<Record<string, StockData>>(C3 ? `/api/stock/batch?tickers=${C3}` : null, fetcher, OPT);
  const { data: d4 } = useSWR<Record<string, StockData>>(C4 ? `/api/stock/batch?tickers=${C4}` : null, fetcher, OPT);
  const { data: d5 } = useSWR<Record<string, StockData>>(C5 ? `/api/stock/batch?tickers=${C5}` : null, fetcher, OPT);

  const allData = useMemo<Record<string, StockData>>(
    () => Object.assign({}, d0, d1, d2, d3, d4, d5),
    [d0, d1, d2, d3, d4, d5]
  );
  const isLoading = !d0 && !d1 && !d2;

  const { watchlist, add, remove, mounted } = useWatchlist();

  const [query,       setQuery]       = useState('');
  const [sort,        setSort]        = useState<SortKey>('default');
  const [mktFilter,   setMktFilter]   = useState<MarketFilter>('all');
  const [watchOnly,   setWatchOnly]   = useState(false);
  const [selected,    setSelected]    = useState<StockItem | null>(null);
  const [updatedAt,   setUpdatedAt]   = useState('');
  const [statusLabel, setStatusLabel] = useState('');

  useEffect(() => {
    if (d0) {
      const kst = new Date(Date.now() + 9 * 3_600_000);
      const pad = (n: number) => String(n).padStart(2, '0');
      setUpdatedAt(`${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}:${pad(kst.getUTCSeconds())}`);
      setStatusLabel(marketStatus());
    }
  }, [d0]);

  const watchSet = useMemo(() => new Set(watchlist.map((w) => w.ticker)), [watchlist]);

  const toggleWatch = useCallback(
    (e: React.MouseEvent, s: StockItem) => {
      e.stopPropagation();
      if (watchSet.has(s.ticker)) remove(s.ticker);
      else add({ ticker: s.ticker, name: s.name, market: s.market });
    },
    [watchSet, add, remove]
  );

  const filtered = useMemo(() => {
    let list = ALL_STOCKS;
    if (mktFilter !== 'all')  list = list.filter((s) => s.market === mktFilter);
    if (watchOnly && mounted) list = list.filter((s) => watchSet.has(s.ticker));
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q) || s.ticker.includes(q));
    }
    if (sort === 'changeRateDesc') return [...list].sort((a, b) => (allData[b.ticker]?.changeRate ?? 0) - (allData[a.ticker]?.changeRate ?? 0));
    if (sort === 'changeRateAsc')  return [...list].sort((a, b) => (allData[a.ticker]?.changeRate ?? 0) - (allData[b.ticker]?.changeRate ?? 0));
    if (sort === 'priceDesc')      return [...list].sort((a, b) => (allData[b.ticker]?.price      ?? 0) - (allData[a.ticker]?.price      ?? 0));
    return list;
  }, [query, sort, mktFilter, watchOnly, watchSet, mounted, allData]);

  return (
    <div className="pb-12">
      {/* 안내 배너 */}
      <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] mb-4 px-1">
        <span className="text-red-400">ℹ</span>
        <span>
          <span className="text-red-400">♥</span>를 누르면{' '}
          <span className="text-sky-400 font-medium">내 주식</span> 탭에서 보유 수량·평단가·평가손익을 관리할 수 있습니다.
        </span>
      </div>

      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-emerald-400 font-medium shrink-0">
          {statusLabel || '—'} · {updatedAt ? `${updatedAt} 갱신` : '로딩 중…'}
        </span>
        <div className="flex gap-1 ml-auto">
          {(['all', 'KOSPI', 'KOSDAQ'] as MarketFilter[]).map((m) => (
            <button key={m} onClick={() => setMktFilter(m)}
              className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                mktFilter === m
                  ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                  : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
              }`}>
              {m === 'all' ? '전체' : m}
            </button>
          ))}
        </div>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]"
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text" value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="종목명 또는 종목코드로 검색"
            className="w-56 sm:w-64 pl-8 pr-3 py-1.5 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-sky-500/50"
          />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
          className="px-3 py-1.5 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-[var(--text)] outline-none">
          {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <button onClick={() => setWatchOnly((v) => !v)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs transition-colors ${
            watchOnly ? 'bg-red-500/15 border-red-500/40 text-red-400' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}>
          {watchOnly ? '♥' : '♡'} 관심
        </button>
      </div>

      {/* 테이블 */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        <div className="hidden sm:grid grid-cols-[40px_48px_1fr_120px_90px_140px] gap-2 px-4 py-2.5 border-b border-[var(--border)] text-[10px] text-[var(--text-muted)] font-medium">
          <span /><span className="text-center">순위</span><span>종목</span>
          <span className="text-right">현재가</span><span className="text-right">등락률</span>
          <span className="text-right pr-2">거래대금</span>
        </div>

        {isLoading ? (
          <div className="divide-y divide-[var(--border)]">
            {[...Array(15)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                <div className="w-6 h-4 rounded bg-white/10 shrink-0" />
                <div className="w-9 h-9 rounded-full bg-white/10 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-28 bg-white/10 rounded" />
                  <div className="h-2.5 w-14 bg-white/10 rounded" />
                </div>
                <div className="h-4 w-20 bg-white/10 rounded ml-auto" />
                <div className="h-5 w-14 bg-white/10 rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-[var(--text-muted)] text-sm">해당 조건의 종목이 없습니다</div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {filtered.map((stock, idx) => {
              const d     = allData[stock.ticker];
              const isPos = (d?.changeRate ?? 0) >= 0;
              const inW   = watchSet.has(stock.ticker);
              return (
                <div key={stock.ticker} onClick={() => setSelected(stock)}
                  className="grid grid-cols-[40px_48px_1fr_120px_90px_140px] gap-2 items-center px-4 py-3 cursor-pointer hover:bg-white/3 transition-colors">
                  <button onClick={(e) => toggleWatch(e, stock)}
                    className={`text-base transition-colors ${inW ? 'text-red-400' : 'text-[var(--text-dim)] hover:text-red-400'}`}>
                    {inW ? '♥' : '♡'}
                  </button>
                  <span className="text-xs text-[var(--text-muted)] text-center tabular-nums">{idx + 1}</span>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CompanyLogo ticker={stock.ticker} name={stock.name} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text)] truncate">{d?.name ?? stock.name}</p>
                      <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${stock.market === 'KOSDAQ' ? 'text-purple-400' : 'text-blue-400'}`}>{stock.market}</span>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-[var(--text)] text-right tabular-nums">
                    {d ? `${fmtPrice(d.price)}원` : <span className="text-[var(--text-dim)] text-xs">로딩…</span>}
                  </p>
                  <div className="flex justify-end">
                    {d ? (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded tabular-nums ${
                        isPos ? 'bg-red-500/90 text-white' : d.changeRate === 0 ? 'bg-white/10 text-[var(--text-muted)]' : 'bg-[#1a2a40] text-blue-400'
                      }`}>{isPos ? '+' : ''}{d.changeRate.toFixed(2)}%</span>
                    ) : <span className="text-xs text-[var(--text-dim)]">—</span>}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] text-right tabular-nums pr-2 hidden sm:block">{d?.tradingValue ?? '—'}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--text-muted)] text-center mt-3 opacity-50">Naver 금융 · 5초 갱신 · 투자 참고용</p>

      {selected && (
        <StockDetailModal code={selected.ticker} name={selected.name} market={selected.market} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
