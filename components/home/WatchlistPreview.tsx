'use client';

/**
 * 홈 › 관심종목 — 시장 세그먼트(국내·해외·코인) + 고밀도 행 + 행별 ⋮ 액션 시트.
 * 검색(☆로 추가) → 관심종목 → 종목 상세로 이어지는 흐름의 중간 단계.
 * 현재 세그먼트의 시세만 불러온다(보이지 않는 시장까지 호출해 쿼터를 쓰지 않게).
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import WatchRow from '@/components/WatchRow';
import ActionSheet, { type SheetAction } from '@/components/ui/ActionSheet';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useOverseasWatchlist } from '@/hooks/useOverseasWatchlist';
import { useCryptoWatchlist } from '@/hooks/useCryptoWatchlist';
import { COINS, fmtCoinPrice } from '@/lib/coins';
import type { StockData, OverseasStockData, CryptoData } from '@/lib/types';

type Tab = 'kr' | 'us' | 'coin';
const TABS: { key: Tab; label: string }[] = [{ key: 'kr', label: '국내' }, { key: 'us', label: '해외' }, { key: 'coin', label: '코인' }];
const TAB_KEY = 'kl:home-wl-tab';
const MY_STOCKS_TAB: Record<Tab, string> = { kr: 'domestic', us: 'overseas', coin: 'crypto' };
const fetcher = (u: string) => fetch(u).then((r) => r.json());
const openSearch = () => window.dispatchEvent(new Event('kl:open-search'));

export default function WatchlistPreview({ limit = 6 }: { limit?: number }) {
  const [tab, setTab] = useState<Tab>('kr');
  const [menu, setMenu] = useState<{ title: string; actions: SheetAction[] } | null>(null);
  useEffect(() => {
    try { const v = localStorage.getItem(TAB_KEY); if (v === 'kr' || v === 'us' || v === 'coin') setTab(v); } catch { /* 무시 */ }
  }, []);
  const pick = (t: Tab) => { setTab(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* 무시 */ } };

  const kr = useWatchlist();
  const us = useOverseasWatchlist();
  const coin = useCryptoWatchlist();
  const krList = kr.watchlist.slice(0, limit);
  const usList = us.watchlist.slice(0, limit);
  const coinList = coin.watchlist.slice(0, limit);

  const { data: krData } = useSWR<Record<string, StockData>>(
    tab === 'kr' && krList.length ? `/api/stock/batch?tickers=${krList.map((w) => w.ticker).join(',')}` : null, fetcher, { refreshInterval: 15000 });
  const { data: usData } = useSWR<Record<string, OverseasStockData>>(
    tab === 'us' && usList.length ? `/api/overseas/batch?symbols=${usList.map((w) => w.symbol).join(',')}` : null, fetcher, { refreshInterval: 20000 });
  const { data: coinData } = useSWR<Record<string, CryptoData>>(
    tab === 'coin' && coinList.length ? `/api/crypto/batch?symbols=${coinList.map((w) => w.symbol).join(',')}` : null, fetcher, { refreshInterval: 15000 });

  const mounted = tab === 'kr' ? kr.mounted : tab === 'us' ? us.mounted : coin.mounted;
  const count = tab === 'kr' ? kr.watchlist.length : tab === 'us' ? us.watchlist.length : coin.watchlist.length;

  let rows: React.ReactNode = null;
  if (tab === 'kr') {
    rows = krList.map((w) => {
      const d = krData?.[w.ticker];
      return (
        <WatchRow key={w.ticker} href={`/stock/${w.ticker}`} title={w.name} sub={`${w.ticker} · ${w.market}`} badge={w.name.slice(0, 1)}
          price={d ? d.price.toLocaleString('ko-KR') : '—'} changeRate={d?.changeRate} loading={!krData}
          onMore={() => setMenu({ title: w.name, actions: [
            { label: '종목 상세', sub: '차트·수급·재무·공시', icon: 'domestic', href: `/stock/${w.ticker}` },
            { label: '종목 분석', sub: '추세·수급·재무 체크리스트', icon: 'analysis', href: `/stock-analysis?ticker=${w.ticker}` },
            { label: '관심종목에서 삭제', icon: 'star', danger: true, onClick: () => kr.remove(w.ticker) },
          ] })} />
      );
    });
  } else if (tab === 'us') {
    rows = usList.map((w) => {
      const d = usData?.[w.symbol];
      const href = `/overseas/${encodeURIComponent(w.symbol)}`;
      return (
        <WatchRow key={w.symbol} href={href} title={w.name} sub={`${w.symbol} · ${w.exchange}`} badge={w.symbol.slice(0, 2)}
          price={d ? `$${d.price.toFixed(2)}` : '—'} changeRate={d?.changeRate} loading={!usData}
          onMore={() => setMenu({ title: w.name, actions: [
            { label: '종목 상세', icon: 'overseas', href },
            { label: '관심종목에서 삭제', icon: 'star', danger: true, onClick: () => us.remove(w.symbol) },
          ] })} />
      );
    });
  } else {
    rows = coinList.map((w) => {
      const d = coinData?.[w.symbol];
      const ko = COINS.find((c) => c.symbol === w.symbol)?.ko ?? w.name;
      return (
        <WatchRow key={w.symbol} href={`/crypto/${w.symbol}`} title={ko} sub={`${w.base} · USDT`} badge={w.base.slice(0, 3)}
          price={fmtCoinPrice(d?.price)} changeRate={d?.changeRate} loading={!coinData}
          onMore={() => setMenu({ title: ko, actions: [
            { label: '코인 상세', sub: '차트·24시간 시세', icon: 'crypto', href: `/crypto/${w.symbol}` },
            { label: '코인선물 분석', sub: '손절·사이징 점검', icon: 'signal', href: '/coin-analysis' },
            { label: '관심종목에서 삭제', icon: 'star', danger: true, onClick: () => coin.remove(w.symbol) },
          ] })} />
      );
    });
  }

  return (
    <section>
      <div className="fin-sec">
        <h3>관심종목{mounted && count > 0 && <span className="ml-1.5 text-[12px] font-semibold text-[var(--faint)] align-middle">{count}</span>}</h3>
        <Link href={`/my-stocks?market=${MY_STOCKS_TAB[tab]}`} className="fin-more">편집·전체</Link>
      </div>
      <div className="fin-card overflow-hidden">
        <div className="px-3 pt-3 pb-1.5">
          <div className="seg w-full" role="tablist" aria-label="관심종목 시장">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
                className={`seg-i flex-1 ${tab === t.key ? 'on' : ''}`} onClick={() => pick(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {!mounted ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="wl-row"><div className="wl-main">
              <span className="skeleton w-9 h-9 rounded-full shrink-0" />
              <span className="flex-1 space-y-1.5"><span className="skeleton h-3.5 w-24" /><span className="skeleton h-2.5 w-16" /></span>
            </div></div>
          ))
        ) : count === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-semibold text-[var(--text)]">아직 관심종목이 없어요</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">검색에서 ☆를 누르면 여기 모입니다</p>
            <button type="button" onClick={openSearch} className="kl-cta mt-4 px-4 py-2 text-sm">종목 검색</button>
          </div>
        ) : (
          <>
            {rows}
            {count > limit && (
              <Link href={`/my-stocks?market=${MY_STOCKS_TAB[tab]}`} className="block text-center text-[13px] font-semibold text-[var(--accent)] py-3 border-t border-[var(--line-2)]">
                {count - limit}개 더 보기
              </Link>
            )}
          </>
        )}
      </div>
      <ActionSheet open={!!menu} onClose={() => setMenu(null)} title={menu?.title} actions={menu?.actions ?? []} />
    </section>
  );
}
