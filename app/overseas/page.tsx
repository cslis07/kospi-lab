'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useOverseasWatchlist } from '@/hooks/useOverseasWatchlist';
import { OVERSEAS_LIST } from '@/lib/overseasList';
import type { OverseasStockData } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ── 브랜드 로고 ───────────────────────────────────────────────
const BRAND: Record<string, { bg: string; color: string; label: string }> = {
  AAPL:  { bg: '#1d1d1f', color: '#fff',    label: '' },
  MSFT:  { bg: '#0078D4', color: '#fff',    label: '⊞' },
  NVDA:  { bg: '#76B900', color: '#fff',    label: 'N' },
  TSLA:  { bg: '#CC0000', color: '#fff',    label: 'T' },
  AMZN:  { bg: '#FF9900', color: '#131921', label: 'a' },
  GOOGL: { bg: '#4285F4', color: '#fff',    label: 'G' },
  GOOG:  { bg: '#4285F4', color: '#fff',    label: 'G' },
  META:  { bg: '#0082FB', color: '#fff',    label: 'M' },
  AMD:   { bg: '#ED1C24', color: '#fff',    label: 'A' },
  INTC:  { bg: '#0071C5', color: '#fff',    label: 'i' },
  AVGO:  { bg: '#CC0000', color: '#fff',    label: 'B' },
  NFLX:  { bg: '#E50914', color: '#fff',    label: 'N' },
  ORCL:  { bg: '#F80000', color: '#fff',    label: 'O' },
  JPM:   { bg: '#003087', color: '#fff',    label: 'J' },
  V:     { bg: '#1A1F71', color: '#fff',    label: 'V' },
  TSM:   { bg: '#003366', color: '#fff',    label: 'T' },
  COIN:  { bg: '#1652F0', color: '#fff',    label: 'C' },
  PLTR:  { bg: '#1B1B1B', color: '#00acfe', label: 'P' },
};

function CompanyLogo({ symbol }: { symbol: string }) {
  const b = BRAND[symbol];
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
      style={{ backgroundColor: b?.bg ?? '#00215e', color: b?.color ?? '#fff' }}
    >
      {b?.label ?? symbol.slice(0, 2)}
    </div>
  );
}

// ── 숫자 포맷 ──────────────────────────────────────────────────
function fmtUsd(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtCap(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(0)}M`;
  return '-';
}
function fmtVol(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

type SortKey = 'default' | 'changeRateDesc' | 'changeRateAsc' | 'marketCap' | 'volume';
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'default',        label: '기본순'        },
  { key: 'marketCap',      label: '시가총액순'     },
  { key: 'changeRateDesc', label: '등락률 높은순'  },
  { key: 'changeRateAsc',  label: '등락률 낮은순'  },
  { key: 'volume',         label: '거래량순'       },
];

type ExchangeFilter = 'all' | 'NASDAQ' | 'NYSE';

// 목록(정적+실시간 검색) 공용 아이템 타입
type MarketItem = { symbol: string; name: string; exchange: string };

// ── 메인 페이지 ────────────────────────────────────────────────
export default function OverseasPage() {
  const { watchlist: ovWatchlist, add, remove, mounted } = useOverseasWatchlist();

  // 전체 심볼 목록
  const allSymbols = OVERSEAS_LIST.map((s) => s.symbol);

  // 20개씩 청크로 나눠 배치 조회
  const chunk1 = allSymbols.slice(0,  20).join(',');
  const chunk2 = allSymbols.slice(20, 40).join(',');
  const chunk3 = allSymbols.slice(40, 60).join(',');
  const chunk4 = allSymbols.slice(60, 80).join(',');
  const chunk5 = allSymbols.slice(80).join(',');

  const { data: d1 } = useSWR<Record<string, OverseasStockData>>(chunk1 ? `/api/overseas/batch?symbols=${chunk1}` : null, fetcher, { refreshInterval: 15000 });
  const { data: d2 } = useSWR<Record<string, OverseasStockData>>(chunk2 ? `/api/overseas/batch?symbols=${chunk2}` : null, fetcher, { refreshInterval: 15000 });
  const { data: d3 } = useSWR<Record<string, OverseasStockData>>(chunk3 ? `/api/overseas/batch?symbols=${chunk3}` : null, fetcher, { refreshInterval: 15000 });
  const { data: d4 } = useSWR<Record<string, OverseasStockData>>(chunk4 ? `/api/overseas/batch?symbols=${chunk4}` : null, fetcher, { refreshInterval: 15000 });
  const { data: d5 } = useSWR<Record<string, OverseasStockData>>(chunk5 ? `/api/overseas/batch?symbols=${chunk5}` : null, fetcher, { refreshInterval: 15000 });

  const { data: market } = useSWR('/api/market', fetcher, { refreshInterval: 10000 });
  const usdRate = market?.usdkrw?.value as number | undefined;

  const [query,          setQuery]          = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sort,           setSort]           = useState<SortKey>('marketCap');
  const [exchFilter,     setExchFilter]     = useState<ExchangeFilter>('all');
  const [watchOnly,      setWatchOnly]      = useState(false);
  const [updatedAt,      setUpdatedAt]      = useState('');

  // 예전 ?symbol= 링크(북마크·공유)는 전용 상세 화면으로 넘긴다
  const router = useRouter();
  useEffect(() => {
    const sym = new URLSearchParams(window.location.search).get('symbol');
    if (sym) router.replace(`/overseas/${encodeURIComponent(sym.toUpperCase())}`);
  }, [router]);

  // 검색어 디바운스 (실시간 검색 API 과호출 방지)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // 정적 목록에 없는 종목(레버리지 ETF 등)은 Yahoo 실시간 검색으로 보완
  const staticSymbolSet = useMemo(() => new Set(allSymbols), [allSymbols]);
  const { data: remoteResults } = useSWR<MarketItem[]>(
    debouncedQuery.length >= 2 ? `/api/overseas/search?q=${encodeURIComponent(debouncedQuery)}` : null,
    fetcher
  );
  const remoteItems: MarketItem[] = useMemo(
    () => (remoteResults ?? []).filter((r) => !staticSymbolSet.has(r.symbol)).slice(0, 15),
    [remoteResults, staticSymbolSet]
  );
  const remoteSymbolsKey = remoteItems.map((r) => r.symbol).join(',');
  const { data: remoteData } = useSWR<Record<string, OverseasStockData>>(
    remoteSymbolsKey ? `/api/overseas/batch?symbols=${remoteSymbolsKey}` : null,
    fetcher,
    { refreshInterval: 15000 }
  );

  const allData: Record<string, OverseasStockData> = useMemo(
    () => ({ ...d1, ...d2, ...d3, ...d4, ...d5, ...remoteData }),
    [d1, d2, d3, d4, d5, remoteData]
  );

  useEffect(() => {
    if (Object.keys(allData).length > 0) {
      const now = new Date();
      const kst = new Date(now.getTime() + 9 * 3600_000);
      const hh  = String(kst.getUTCHours()).padStart(2, '0');
      const mm  = String(kst.getUTCMinutes()).padStart(2, '0');
      const ss  = String(kst.getUTCSeconds()).padStart(2, '0');
      setUpdatedAt(`${hh}:${mm}:${ss}`);
    }
  }, [allData]);

  const watchSet = useMemo(
    () => new Set(ovWatchlist.map((w) => w.symbol)),
    [ovWatchlist]
  );

  const toggleWatch = useCallback(
    (e: React.MouseEvent, item: MarketItem) => {
      e.stopPropagation();
      if (watchSet.has(item.symbol)) {
        remove(item.symbol);
      } else {
        add({ symbol: item.symbol, name: item.name, exchange: item.exchange });
      }
    },
    [watchSet, add, remove]
  );

  const isLoading = Object.keys(allData).length === 0;

  // 등락 TOP — 수록 종목(OVERSEAS_LIST) 중 실시간 등락률 정렬(국내 RankList와 동일한 카드 구성)
  const ranked = useMemo(() => {
    const withData = OVERSEAS_LIST
      .map((s): { s: MarketItem; d?: OverseasStockData } => ({ s: { symbol: s.symbol, name: s.name, exchange: s.exchange }, d: allData[s.symbol] }))
      .filter((x): x is { s: MarketItem; d: OverseasStockData } => !!x.d && Number.isFinite(x.d.changeRate));
    return {
      gainers: [...withData].sort((a, b) => b.d.changeRate - a.d.changeRate).slice(0, 4),
      losers: [...withData].sort((a, b) => a.d.changeRate - b.d.changeRate).slice(0, 4),
    };
  }, [allData]);

  const filtered = useMemo(() => {
    let list: MarketItem[] = OVERSEAS_LIST;
    if (exchFilter !== 'all') list = list.filter((s) => s.exchange === exchFilter);
    if (watchOnly && mounted) list = list.filter((s) => watchSet.has(s.symbol));
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));

      // 정적 목록에 없던 실시간 검색 결과(레버리지 ETF 등) 병합
      let remote = remoteItems;
      if (exchFilter !== 'all') remote = remote.filter((s) => s.exchange === exchFilter);
      if (watchOnly && mounted) remote = remote.filter((s) => watchSet.has(s.symbol));
      list = [...list, ...remote];
    }
    if (sort === 'changeRateDesc') return [...list].sort((a, b) => (allData[b.symbol]?.changeRate ?? 0) - (allData[a.symbol]?.changeRate ?? 0));
    if (sort === 'changeRateAsc')  return [...list].sort((a, b) => (allData[a.symbol]?.changeRate ?? 0) - (allData[b.symbol]?.changeRate ?? 0));
    if (sort === 'marketCap')      return [...list].sort((a, b) => (allData[b.symbol]?.marketCap  ?? 0) - (allData[a.symbol]?.marketCap  ?? 0));
    if (sort === 'volume')         return [...list].sort((a, b) => (allData[b.symbol]?.volume      ?? 0) - (allData[a.symbol]?.volume      ?? 0));
    return list;
  }, [query, sort, exchFilter, watchOnly, watchSet, mounted, allData, remoteItems]);

  return (
    <div className="pb-12">
      {/* 등락 TOP — 수록 종목 중(Yahoo 실시간), 국내와 동일한 카드 구성 */}
      <div className="grid gap-6 md:grid-cols-2 mb-7">
        {(['gainers', 'losers'] as const).map((kind) => {
          const up = kind === 'gainers';
          const rows = ranked[kind];
          return (
            <section key={kind}>
              <div className="fin-sec">
                <h3>{up ? '상승률 TOP' : '하락률 TOP'} <span className="ml-2 text-[11px] font-semibold text-[var(--faint)] align-middle">수록 종목 중</span></h3>
              </div>
              <div className="fin-card overflow-hidden">
                {isLoading ? (
                  [0, 1, 2, 3].map((i) => (
                    <div key={i} className="fin-row">
                      <div className="flex-1 space-y-1.5"><span className="skeleton h-3.5 w-24" /><span className="skeleton h-2.5 w-16" /></div>
                      <div className="flex flex-col items-end space-y-1.5"><span className="skeleton h-3.5 w-16" /><span className="skeleton h-2.5 w-10" /></div>
                    </div>
                  ))
                ) : rows.length ? (
                  rows.map(({ s, d }) => (
                    <Link key={s.symbol} href={`/overseas/${encodeURIComponent(s.symbol)}`} className={`fin-row ${up ? 'up' : 'down'}`}>
                      <div className="min-w-0 flex-1">
                        <div className="nm truncate">{d.name ?? s.name}</div>
                        <div className="sb">{s.exchange} · {s.symbol}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="pr tabular-nums">${fmtUsd(d.price)}</div>
                        {usdRate ? <div className="text-[12px] font-medium text-[var(--text-muted)] tabular-nums">≈ {Math.round(d.price * usdRate).toLocaleString('ko-KR')}원</div> : null}
                        <div className="ch tabular-nums" style={{ color: up ? 'var(--warn)' : 'var(--accent)' }}>
                          {d.changeRate > 0 ? '+' : ''}{d.changeRate.toFixed(2)}%
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">표시할 종목이 없습니다</p>
                )}
              </div>
            </section>
          );
        })}
      </div>

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
          미국 주식 · {updatedAt ? `${updatedAt} 갱신` : '로딩 중…'}
        </span>

        {/* 거래소 탭 */}
        <div className="flex gap-1 ml-auto">
          {(['all', 'NASDAQ', 'NYSE'] as ExchangeFilter[]).map((ex) => (
            <button key={ex} onClick={() => setExchFilter(ex)}
              className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                exchFilter === ex
                  ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                  : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
              }`}>
              {ex === 'all' ? '전체' : ex}
            </button>
          ))}
        </div>

        {/* 검색 */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]"
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="종목명 또는 티커로 검색"
            className="w-52 sm:w-60 pl-8 pr-3 py-1.5 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-sky-500/50"
          />
        </div>

        {/* 정렬 */}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="px-3 py-1.5 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-[var(--text)] outline-none"
        >
          {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>

        {/* 관심 토글 */}
        <button
          onClick={() => setWatchOnly((v) => !v)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs transition-colors ${
            watchOnly
              ? 'bg-red-500/15 border-red-500/40 text-red-400'
              : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
        >
          {watchOnly ? '♥' : '♡'} 관심
        </button>
      </div>

      {/* 테이블 */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        {/* 컬럼 헤더 */}
        <div className="hidden sm:grid grid-cols-[40px_48px_1fr_120px_90px_130px] gap-2 px-4 py-2.5 border-b border-[var(--border)] text-[10px] text-[var(--text-muted)] font-medium">
          <span />
          <span className="text-center">순위</span>
          <span>종목</span>
          <span className="text-right">현재가</span>
          <span className="text-right">등락률</span>
          <span className="text-right pr-2">시가총액</span>
        </div>

        {isLoading && (
          <div className="divide-y divide-[var(--border)]">
            {[...Array(15)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                <div className="w-6 h-6 rounded-full bg-white/10 shrink-0" />
                <div className="w-9 h-9 rounded-full bg-white/10 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-24 bg-white/10 rounded" />
                  <div className="h-2.5 w-16 bg-white/10 rounded" />
                </div>
                <div className="h-4 w-20 bg-white/10 rounded ml-auto" />
                <div className="h-5 w-14 bg-white/10 rounded" />
                <div className="h-3 w-16 bg-white/10 rounded" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="py-20 text-center text-[var(--text-muted)] text-sm">
            해당 조건의 종목이 없습니다
          </div>
        )}

        {filtered.length > 0 && (
          <div className="divide-y divide-[var(--border)]">
            {filtered.map((item, idx) => {
              const d       = allData[item.symbol];
              const isPos   = (d?.changeRate ?? 0) >= 0;
              const inWatch = watchSet.has(item.symbol);
              return (
                <div
                  key={item.symbol}
                  onClick={() => router.push(`/overseas/${encodeURIComponent(item.symbol)}`)}
                  className="flex items-center gap-2.5 px-4 py-3 cursor-pointer hover:bg-white/3 transition-colors sm:grid sm:grid-cols-[40px_48px_1fr_120px_90px_130px] sm:gap-2"
                >
                  {/* ♡ */}
                  <button
                    onClick={(e) => toggleWatch(e, item)}
                    className={`text-base shrink-0 transition-colors ${
                      inWatch ? 'text-red-400' : 'text-[var(--text-dim)] hover:text-red-400'
                    }`}
                  >
                    {inWatch ? '♥' : '♡'}
                  </button>

                  {/* 순위 */}
                  <span className="text-xs text-[var(--text-muted)] shrink-0 sm:text-center tabular-nums w-4 sm:w-auto">
                    {idx + 1}
                  </span>

                  {/* 종목 */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 sm:flex-none">
                    <CompanyLogo symbol={item.symbol} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text)] truncate">
                        {d?.name ?? item.name}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] px-1 py-0.5 rounded bg-sky-500/20 text-sky-400">
                          {item.exchange}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--text-muted)]">{item.symbol}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); router.push(`/overseas-analysis?symbol=${encodeURIComponent(item.symbol)}`); }}
                          className="inline-flex items-center gap-0.5 text-[10.5px] font-bold px-1.5 py-0.5 rounded-md text-[var(--accent)] bg-[var(--accent-soft)] border border-[var(--accent)]/25 hover:brightness-105"
                          aria-label={`${item.name} 분석`}>
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0M20 20l-3.5-3.5" /></svg>
                          분석
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); router.push(`/screener?tickers=${item.symbol}&market=US&run=1`); }}
                          className="inline-flex items-center gap-0.5 text-[10.5px] font-bold px-1.5 py-0.5 rounded-md text-[var(--text-muted)] bg-[var(--surface-2)] border border-[var(--border)] hover:text-[var(--text)]"
                          aria-label={`${item.name} 간단 재무`}>
                          간단
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 sm:contents">
                    {/* 현재가 (달러 + 원화 환산) */}
                    <p className="text-sm font-bold text-[var(--text)] text-right tabular-nums">
                      {d ? `$${fmtUsd(d.price)}` : <span className="text-[var(--text-dim)]">-</span>}
                      {d && usdRate ? <span className="text-[13px] font-semibold text-[var(--text-muted)] ml-1.5">≈{Math.round(d.price * usdRate).toLocaleString('ko-KR')}원</span> : null}
                    </p>

                    {/* 등락률 */}
                    <div className="flex justify-end">
                      {d ? (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded tabular-nums ${
                          isPos
                            ? 'bg-red-500/90 text-white'
                            : d.changeRate === 0
                              ? 'bg-white/10 text-[var(--text-muted)]'
                              : 'bg-[#1a2a40] text-blue-400'
                        }`}>
                          {isPos ? '+' : ''}{d.changeRate.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-dim)]">-</span>
                      )}
                    </div>
                  </div>

                  {/* 시가총액 */}
                  <p className="text-xs text-[var(--text-muted)] text-right tabular-nums pr-2 hidden sm:block">
                    {d ? fmtCap(d.marketCap) : '-'}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-[10px] text-[var(--text-muted)] text-center mt-3 opacity-50">
        Yahoo Finance 데이터 · 15초 갱신 · 투자 참고용
      </p>

    </div>
  );
}
