'use client';

/**
 * 홈 › 관심종목(전체 목록) — 시장 세그먼트 + 정렬·시장 칩 + 고밀도 행.
 * 행을 왼쪽으로 밀면 분석/가상·삭제, ⋮ 는 전체 동작(상세·분석·가상투자·매매 계획·삭제).
 * 삭제는 4초간 되돌리기 가능. 추가는 통합 검색 시트(☆). 현재 탭 시장의 시세만 호출.
 */
import { useState, useMemo, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import WatchRow from '@/components/WatchRow';
import SwipeRow, { type RowAction } from '@/components/SwipeRow';
import ActionSheet, { type SheetAction } from '@/components/ui/ActionSheet';
import VirtualTradeModal from '@/components/VirtualTradeModal';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useOverseasWatchlist } from '@/hooks/useOverseasWatchlist';
import { useCryptoWatchlist } from '@/hooks/useCryptoWatchlist';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useAlerts } from '@/hooks/useAlerts';
import { COINS, fmtCoinPrice } from '@/lib/coins';
import type { StockData, OverseasStockData, CryptoData, AssetType, TradeCurrency } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
type MarketTab = 'domestic' | 'overseas' | 'crypto';
type Sort = 'default' | 'up' | 'down';
type KrFilter = 'all' | 'KOSPI' | 'KOSDAQ';
const TAB_KEY = 'kospi-lab-my-stocks-tab';
const ANALYZABLE = ['BTC', 'ETH', 'XRP', 'SOL'];
const openSearch = () => window.dispatchEvent(new Event('kl:open-search'));

interface Trade { symbol: string; name: string; assetType: AssetType; price: number; currency: TradeCurrency }
interface Row {
  key: string; href: string; title: string; sub: string; badge: string; price: string;
  cr: number | null | undefined; loading: boolean;
  analysis?: string; trade?: Trade; remove: () => void;
}

function MyStocksInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<MarketTab>('domestic');
  const [sort, setSort] = useState<Sort>('default');
  const [krFilter, setKrFilter] = useState<KrFilter>('all');
  const [menu, setMenu] = useState<{ title: string; actions: SheetAction[] } | null>(null);
  const [trade, setTrade] = useState<Trade | null>(null);
  const [toast, setToast] = useState<{ text: string; undo: () => void } | null>(null);

  useEffect(() => {
    const url = searchParams.get('market') as MarketTab | null;
    if (url && ['domestic', 'overseas', 'crypto'].includes(url)) { setTab(url); return; }
    try { const s = localStorage.getItem(TAB_KEY) as MarketTab | null; if (s && ['domestic', 'overseas', 'crypto'].includes(s)) setTab(s); } catch { /* 무시 */ }
  }, [searchParams]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  const switchTab = (t: MarketTab) => { setTab(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* 무시 */ } };

  const kr = useWatchlist();
  const ov = useOverseasWatchlist();
  const cr = useCryptoWatchlist();
  const { portfolio } = usePortfolio();
  const { alerts } = useAlerts();

  const { data: krData } = useSWR<Record<string, StockData>>(
    tab === 'domestic' && kr.watchlist.length ? `/api/stock/batch?tickers=${kr.watchlist.map((w) => w.ticker).join(',')}` : null, fetcher, { refreshInterval: 5000 });
  const { data: ovData } = useSWR<Record<string, OverseasStockData>>(
    tab === 'overseas' && ov.watchlist.length ? `/api/overseas/batch?symbols=${ov.watchlist.map((w) => w.symbol).join(',')}` : null, fetcher, { refreshInterval: 15000 });
  const { data: crData } = useSWR<Record<string, CryptoData>>(
    tab === 'crypto' && cr.watchlist.length ? `/api/crypto/batch?symbols=${cr.watchlist.map((w) => w.symbol).join(',')}` : null, fetcher, { refreshInterval: 5000 });

  const rows: Row[] = useMemo(() => {
    let list: Row[] = [];
    if (tab === 'domestic') {
      list = kr.watchlist.filter((w) => krFilter === 'all' || w.market === krFilter).map((w) => {
        const d = krData?.[w.ticker];
        const p = portfolio[w.ticker];
        const parts = [w.ticker, w.market];
        if (p && d) parts.push(`보유 ${p.quantity.toLocaleString()}주 ${d.price >= p.avgPrice ? '+' : ''}${(((d.price - p.avgPrice) / p.avgPrice) * 100).toFixed(1)}%`);
        if (alerts[w.ticker]) parts.push('알림');
        return {
          key: w.ticker, href: `/stock/${w.ticker}`, title: w.name, sub: parts.join(' · '), badge: w.name.slice(0, 1),
          price: d ? d.price.toLocaleString('ko-KR') : '—', cr: d?.changeRate, loading: !krData,
          analysis: `/stock-analysis?ticker=${w.ticker}&run=1`,
          trade: d ? { symbol: w.ticker, name: w.name, assetType: 'domestic', price: d.price, currency: 'KRW' } : undefined,
          remove: () => { kr.remove(w.ticker); setToast({ text: `${w.name} 삭제됨`, undo: () => kr.add(w) }); },
        };
      });
    } else if (tab === 'overseas') {
      list = ov.watchlist.map((w) => {
        const d = ovData?.[w.symbol];
        return {
          key: w.symbol, href: `/overseas/${encodeURIComponent(w.symbol)}`, title: w.name, sub: `${w.symbol} · ${w.exchange}`, badge: w.symbol.slice(0, 2),
          price: d ? `$${d.price.toFixed(2)}` : '—', cr: d?.changeRate, loading: !ovData,
          trade: d ? { symbol: w.symbol, name: w.name, assetType: 'overseas', price: d.price, currency: 'USD' } : undefined,
          remove: () => { ov.remove(w.symbol); setToast({ text: `${w.name} 삭제됨`, undo: () => ov.add(w) }); },
        };
      });
    } else {
      list = cr.watchlist.map((w) => {
        const d = crData?.[w.symbol];
        const ko = COINS.find((c) => c.symbol === w.symbol)?.ko ?? w.name;
        return {
          key: w.symbol, href: `/crypto/${w.symbol}`, title: ko, sub: `${w.base} · USDT`, badge: w.base.slice(0, 3),
          price: fmtCoinPrice(d?.price), cr: d?.changeRate, loading: !crData,
          analysis: ANALYZABLE.includes(w.base) ? `/coin-analysis?symbol=${w.symbol}&run=1` : undefined,
          trade: d ? { symbol: w.symbol, name: w.name, assetType: 'crypto', price: d.price, currency: 'USD' } : undefined,
          remove: () => { cr.remove(w.symbol); setToast({ text: `${ko} 삭제됨`, undo: () => cr.add(w) }); },
        };
      });
    }
    if (sort === 'default') return list;
    // 등락률 정렬 — 시세 없는 행은 뒤로
    return [...list].sort((a, b) => {
      if (a.cr == null) return 1;
      if (b.cr == null) return -1;
      return sort === 'up' ? b.cr - a.cr : a.cr - b.cr;
    });
  }, [tab, sort, krFilter, kr, ov, cr, krData, ovData, crData, portfolio, alerts]);

  // 국내 보유 평가손익 합계(관심종목에 있는 보유분)
  const totalPnl = useMemo(() => {
    if (tab !== 'domestic' || !krData) return null;
    let total = 0, any = false;
    for (const [t, e] of Object.entries(portfolio)) {
      const s = krData[t];
      if (!s) continue;
      total += (s.price - e.avgPrice) * e.quantity;
      any = true;
    }
    return any ? total : null;
  }, [tab, krData, portfolio]);

  const mounted = tab === 'domestic' ? kr.mounted : tab === 'overseas' ? ov.mounted : cr.mounted;
  const counts = { domestic: kr.watchlist.length, overseas: ov.watchlist.length, crypto: cr.watchlist.length };
  const TABS: { key: MarketTab; label: string }[] = [{ key: 'domestic', label: '국내' }, { key: 'overseas', label: '해외' }, { key: 'crypto', label: '코인' }];

  const openMenu = (r: Row) => setMenu({
    title: r.title,
    actions: [
      { label: '상세 보기', sub: '차트·정보', icon: 'domestic', href: r.href },
      ...(r.analysis ? [{ label: tab === 'crypto' ? '코인선물 분석' : '종목 분석', sub: '체크리스트', icon: 'analysis', href: r.analysis }] : []),
      ...(r.trade ? [{ label: '가상투자', sub: '모의 매수·매도', icon: 'virtual', onClick: () => setTrade(r.trade!) }] : []),
      { label: '매매 계획 세우기', sub: '손절·사이징 먼저', icon: 'planner', href: '/planner' },
      { label: '관심종목에서 삭제', icon: 'star', danger: true, onClick: r.remove },
    ],
  });
  const swipeActions = (r: Row): RowAction[] => [
    ...(r.analysis ? [{ label: '분석', icon: 'analysis', tone: 'accent' as const, onClick: () => router.push(r.analysis!) }]
      : r.trade ? [{ label: '가상', icon: 'virtual', tone: 'muted' as const, onClick: () => setTrade(r.trade!) }] : []),
    { label: '삭제', icon: 'star', tone: 'danger' as const, onClick: r.remove },
  ];

  return (
    <div className="max-w-3xl mx-auto pb-6">
      <div className="seg w-full mb-3" role="tablist" aria-label="관심종목 시장">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => switchTab(t.key)} className={`seg-i flex-1 ${tab === t.key ? 'on' : ''}`}>
            {t.label} <span className="text-[11px] font-semibold opacity-60 ml-0.5">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <button type="button" onClick={openSearch} className="srch-in w-full mb-3 text-left" aria-label="종목 검색해서 관심종목 추가">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M21 21l-4.35-4.35M11 19a8 8 0 110-16 8 8 0 010 16z" /></svg>
        <span className="text-[15px] text-[var(--faint)]">종목 검색해서 추가</span>
      </button>

      <div className="chip-scroll mb-3">
        {([['default', '기본순'], ['up', '상승률순'], ['down', '하락률순']] as [Sort, string][]).map(([k, l]) => (
          <button key={k} type="button" className={`chip ${sort === k ? 'active' : ''}`} aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>
        ))}
        {tab === 'domestic' && (
          <>
            <span className="w-px bg-[var(--line)] mx-1 shrink-0" aria-hidden />
            {([['all', '전체'], ['KOSPI', 'KOSPI'], ['KOSDAQ', 'KOSDAQ']] as [KrFilter, string][]).map(([k, l]) => (
              <button key={k} type="button" className={`chip ${krFilter === k ? 'active' : ''}`} aria-pressed={krFilter === k} onClick={() => setKrFilter(k)}>{l}</button>
            ))}
          </>
        )}
      </div>

      {totalPnl !== null && (
        <div className="fin-card px-4 py-3 mb-3 flex items-center">
          <span className="text-[13px] font-bold text-[var(--ink-2)]">보유 평가손익</span>
          <span className="ml-auto text-[16px] font-extrabold tabular-nums" style={{ color: totalPnl === 0 ? 'var(--ink)' : totalPnl > 0 ? 'var(--warn)' : 'var(--accent)' }}>
            {totalPnl > 0 ? '+' : ''}{Math.round(totalPnl).toLocaleString('ko-KR')}원
          </span>
        </div>
      )}

      <div className="fin-card overflow-hidden">
        {!mounted ? (
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="wl-row"><div className="wl-main">
              <span className="skeleton w-9 h-9 rounded-full shrink-0" />
              <span className="flex-1 space-y-1.5"><span className="skeleton h-3.5 w-24" /><span className="skeleton h-2.5 w-16" /></span>
            </div></div>
          ))
        ) : rows.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="text-sm font-semibold text-[var(--text)]">{counts[tab] ? '조건에 맞는 종목이 없어요' : '아직 관심종목이 없어요'}</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">{counts[tab] ? '시장 필터를 바꿔 보세요' : '검색에서 ☆를 누르면 여기 모입니다'}</p>
            {!counts[tab] && <button type="button" onClick={openSearch} className="kl-cta mt-4 px-4 py-2 text-sm">종목 검색</button>}
          </div>
        ) : (
          rows.map((r) => (
            <SwipeRow key={r.key} actions={swipeActions(r)}>
              <WatchRow href={r.href} title={r.title} sub={r.sub} badge={r.badge} price={r.price} changeRate={r.cr} loading={r.loading} onMore={() => openMenu(r)} />
            </SwipeRow>
          ))
        )}
      </div>
      {mounted && rows.length > 0 && (
        <p className="text-[11.5px] text-[var(--faint)] mt-2.5 px-1">행을 왼쪽으로 밀면 {tab === 'overseas' ? '가상투자' : '분석'}·삭제, ⋮ 는 전체 메뉴</p>
      )}

      <ActionSheet open={!!menu} onClose={() => setMenu(null)} title={menu?.title} actions={menu?.actions ?? []} />
      {trade && (
        <VirtualTradeModal symbol={trade.symbol} name={trade.name} assetType={trade.assetType} price={trade.price} currency={trade.currency} onClose={() => setTrade(null)} />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast.text}
          <button type="button" onClick={() => { toast.undo(); setToast(null); }}>되돌리기</button>
        </div>
      )}
    </div>
  );
}

export default function MyStocksPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto space-y-3"><div className="skeleton h-11" /><div className="skeleton h-72" /></div>}>
      <MyStocksInner />
    </Suspense>
  );
}
