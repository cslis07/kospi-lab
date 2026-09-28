'use client';

/**
 * 홈 › 관심종목 — 관심종목 페이지(/my-stocks)와 동일 구성:
 * 시장 세그먼트(개수 표시) + 검색창 + 정렬칩(기본순/상승률순/하락률순, 국내는 KOSPI/KOSDAQ 필터) + 고밀도 행 + 시장별 액션 버튼.
 * 국내=상세·분석·삭제 / 해외=상세·삭제 / 코인=상세·(분석)·삭제.
 * 현재 세그먼트의 시세만 불러온다(보이지 않는 시장까지 호출해 쿼터를 쓰지 않게).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import WatchRow from '@/components/WatchRow';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useOverseasWatchlist } from '@/hooks/useOverseasWatchlist';
import { useCryptoWatchlist } from '@/hooks/useCryptoWatchlist';
import { COINS, fmtCoinPrice } from '@/lib/coins';
import type { StockData, OverseasStockData, CryptoData } from '@/lib/types';

type Tab = 'kr' | 'us' | 'coin';
type Sort = 'default' | 'up' | 'down';
type KrFilter = 'all' | 'KOSPI' | 'KOSDAQ';
const TABS: { key: Tab; label: string }[] = [{ key: 'kr', label: '국내' }, { key: 'us', label: '해외' }, { key: 'coin', label: '코인' }];
const TAB_KEY = 'kl:home-wl-tab';
const MY_STOCKS_TAB: Record<Tab, string> = { kr: 'domestic', us: 'overseas', coin: 'crypto' };
const ANALYZABLE = ['BTC', 'ETH', 'XRP', 'SOL'];
const fetcher = (u: string) => fetch(u).then((r) => r.json());
const openSearch = () => window.dispatchEvent(new Event('kl:open-search'));

/* 종목 행 아래 버튼형(pill) 액션 */
function Pill({ href, onClick, tone, children }: { href?: string; onClick?: () => void; tone: 'muted' | 'accent' | 'danger'; children: ReactNode }) {
  const t = tone === 'danger'
    ? 'text-red-500 bg-red-500/10 border-red-500/30'
    : tone === 'accent'
      ? 'text-white bg-[var(--accent)] border-transparent shadow-sm'
      : 'text-[var(--text)] bg-[var(--surface-2)] border-[var(--border)]';
  const cls = `inline-flex items-center gap-1 text-[12px] font-bold px-3 py-1.5 rounded-full border transition-colors ${t}`;
  return href
    ? <Link href={href} className={cls} onClick={(e) => e.stopPropagation()}>{children}</Link>
    : <button type="button" className={cls} onClick={onClick}>{children}</button>;
}

interface ItemProps {
  key: string; href: string; title: string; sub: string; badge: string; price: string;
  cr: number | null | undefined; loading: boolean;
  detailLabel: string; analysis?: string; analysisLabel?: string; remove: () => void;
}
function renderItem(p: ItemProps) {
  return (
    <div key={p.key} className="border-t border-[var(--line-2)]">
      <WatchRow href={p.href} title={p.title} sub={p.sub} badge={p.badge} price={p.price} changeRate={p.cr} loading={p.loading}
        actions={
          <>
            <Pill href={p.href} tone="muted">{p.detailLabel}</Pill>
            {p.analysis && <Pill href={p.analysis} tone="accent">{p.analysisLabel ?? '분석'}</Pill>}
            <Pill onClick={p.remove} tone="danger">삭제</Pill>
          </>
        } />
    </div>
  );
}

export default function WatchlistPreview({ limit = 6 }: { limit?: number }) {
  const [tab, setTab] = useState<Tab>('kr');
  const [sort, setSort] = useState<Sort>('default');
  const [krFilter, setKrFilter] = useState<KrFilter>('all');
  useEffect(() => {
    try { const v = localStorage.getItem(TAB_KEY); if (v === 'kr' || v === 'us' || v === 'coin') setTab(v); } catch { /* 무시 */ }
  }, []);
  const pick = (t: Tab) => { setTab(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* 무시 */ } };

  const kr = useWatchlist();
  const us = useOverseasWatchlist();
  const coin = useCryptoWatchlist();

  const { data: krData } = useSWR<Record<string, StockData>>(
    tab === 'kr' && kr.watchlist.length ? `/api/stock/batch?tickers=${kr.watchlist.map((w) => w.ticker).join(',')}` : null, fetcher, { refreshInterval: 15000 });
  const { data: usData } = useSWR<Record<string, OverseasStockData>>(
    tab === 'us' && us.watchlist.length ? `/api/overseas/batch?symbols=${us.watchlist.map((w) => w.symbol).join(',')}` : null, fetcher, { refreshInterval: 20000 });
  const { data: coinData } = useSWR<Record<string, CryptoData>>(
    tab === 'coin' && coin.watchlist.length ? `/api/crypto/batch?symbols=${coin.watchlist.map((w) => w.symbol).join(',')}` : null, fetcher, { refreshInterval: 15000 });

  const mounted = tab === 'kr' ? kr.mounted : tab === 'us' ? us.mounted : coin.mounted;
  const counts: Record<Tab, number> = { kr: kr.watchlist.length, us: us.watchlist.length, coin: coin.watchlist.length };
  const count = counts[tab];

  const items: ItemProps[] = useMemo(() => {
    let list: ItemProps[] = [];
    if (tab === 'kr') {
      list = kr.watchlist.filter((w) => krFilter === 'all' || w.market === krFilter).map((w) => {
        const d = krData?.[w.ticker];
        return {
          key: w.ticker, href: `/stock/${w.ticker}`, title: w.name, sub: `${w.ticker} · ${w.market}`, badge: w.name.slice(0, 1),
          price: d ? d.price.toLocaleString('ko-KR') : '—', cr: d?.changeRate, loading: !krData,
          detailLabel: '종목 상세', analysis: `/stock-analysis?ticker=${w.ticker}&run=1`, analysisLabel: '종목 분석',
          remove: () => kr.remove(w.ticker),
        };
      });
    } else if (tab === 'us') {
      list = us.watchlist.map((w) => {
        const d = usData?.[w.symbol];
        return {
          key: w.symbol, href: `/overseas/${encodeURIComponent(w.symbol)}`, title: w.name, sub: `${w.symbol} · ${w.exchange}`, badge: w.symbol.slice(0, 2),
          price: d ? `$${d.price.toFixed(2)}` : '—', cr: d?.changeRate, loading: !usData,
          detailLabel: '종목 상세',
          remove: () => us.remove(w.symbol),
        };
      });
    } else {
      list = coin.watchlist.map((w) => {
        const d = coinData?.[w.symbol];
        const ko = COINS.find((c) => c.symbol === w.symbol)?.ko ?? w.name;
        return {
          key: w.symbol, href: `/crypto/${w.symbol}`, title: ko, sub: `${w.base} · USDT`, badge: w.base.slice(0, 3),
          price: fmtCoinPrice(d?.price), cr: d?.changeRate, loading: !coinData,
          detailLabel: '코인 상세', analysis: ANALYZABLE.includes(w.base) ? `/coin-analysis?symbol=${w.symbol}&run=1` : undefined, analysisLabel: '코인선물 분석',
          remove: () => coin.remove(w.symbol),
        };
      });
    }
    if (sort === 'default') return list;
    return [...list].sort((a, b) => {
      if (a.cr == null) return 1;
      if (b.cr == null) return -1;
      return sort === 'up' ? b.cr - a.cr : a.cr - b.cr;
    });
  }, [tab, sort, krFilter, kr, us, coin, krData, usData, coinData]);

  const shown = items.slice(0, limit);

  return (
    <section>
      <div className="fin-sec">
        <h3>관심종목{mounted && count > 0 && <span className="ml-1.5 text-[12px] font-semibold text-[var(--faint)] align-middle">{count}</span>}</h3>
        <Link href={`/my-stocks?market=${MY_STOCKS_TAB[tab]}`} className="fin-more">편집·전체</Link>
      </div>
      <div className="fin-card overflow-hidden">
        <div className="px-3 pt-3 pb-1.5 space-y-3">
          <div className="seg w-full" role="tablist" aria-label="관심종목 시장">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
                className={`seg-i flex-1 ${tab === t.key ? 'on' : ''}`} onClick={() => pick(t.key)}>
                {t.label} <span className="text-[11px] font-semibold opacity-60 ml-0.5">{counts[t.key]}</span>
              </button>
            ))}
          </div>

          <button type="button" onClick={openSearch} className="srch-in w-full text-left" aria-label="종목 검색해서 관심종목 추가">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M21 21l-4.35-4.35M11 19a8 8 0 110-16 8 8 0 010 16z" /></svg>
            <span className="text-[15px] text-[var(--faint)]">종목 검색해서 추가</span>
          </button>

          <div className="chip-scroll">
            {([['default', '기본순'], ['up', '상승률순'], ['down', '하락률순']] as [Sort, string][]).map(([k, l]) => (
              <button key={k} type="button" className={`chip ${sort === k ? 'active' : ''}`} aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>
            ))}
            {tab === 'kr' && (
              <>
                <span className="w-px bg-[var(--line)] mx-1 shrink-0" aria-hidden />
                {([['all', '전체'], ['KOSPI', 'KOSPI'], ['KOSDAQ', 'KOSDAQ']] as [KrFilter, string][]).map(([k, l]) => (
                  <button key={k} type="button" className={`chip ${krFilter === k ? 'active' : ''}`} aria-pressed={krFilter === k} onClick={() => setKrFilter(k)}>{l}</button>
                ))}
              </>
            )}
          </div>
        </div>

        {!mounted ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="wl-row">
              <span className="skeleton w-9 h-9 rounded-full shrink-0" />
              <span className="flex-1 space-y-1.5"><span className="skeleton h-3.5 w-24" /><span className="skeleton h-2.5 w-16" /></span>
            </div>
          ))
        ) : count === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-semibold text-[var(--text)]">아직 관심종목이 없어요</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">검색에서 ☆를 누르면 여기 모입니다</p>
            <button type="button" onClick={openSearch} className="kl-cta mt-4 px-4 py-2 text-sm">종목 검색</button>
          </div>
        ) : shown.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-semibold text-[var(--text)]">조건에 맞는 종목이 없어요</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">시장 필터를 바꿔 보세요</p>
          </div>
        ) : (
          <>
            {shown.map(renderItem)}
            {items.length > limit && (
              <Link href={`/my-stocks?market=${MY_STOCKS_TAB[tab]}`} className="block text-center text-[13px] font-semibold text-[var(--accent)] py-3 border-t border-[var(--line-2)]">
                {items.length - limit}개 더 보기
              </Link>
            )}
          </>
        )}
      </div>
    </section>
  );
}
