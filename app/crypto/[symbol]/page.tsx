'use client';

/**
 * 코인 상세 — 헤더(☆·⋮) → 가격 차트(지표 시트) → 현물 시세 요약.
 * 관심 코인 목록 안에선 옆으로 밀어 이전/다음 코인. 색은 한국 관행(상승=빨강·하락=파랑).
 */
import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import PriceChart, { TIMEFRAMES } from '@/components/detail/PriceChart';
import SwipeNav from '@/components/detail/SwipeNav';
import ActionSheet, { KebabButton, type SheetAction } from '@/components/ui/ActionSheet';
import VirtualTradeModal from '@/components/VirtualTradeModal';
import { badgeTint } from '@/components/WatchRow';
import { useCryptoWatchlist } from '@/hooks/useCryptoWatchlist';
import { COINS, fmtCoinPrice } from '@/lib/coins';
import type { CryptoData, ChartPoint } from '@/lib/types';

const UP = '#f04452';
const DOWN = '#3182f6';
const ANALYZABLE = ['BTC', 'ETH', 'XRP', 'SOL'];
const fetcher = (u: string) => fetch(u).then((r) => r.json());
const yFmt = (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(4)}`);
function fmtVol(n?: number | null) {
  if (!n) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(2);
}

export default function CryptoDetailPage() {
  const symbol = String(useParams().symbol ?? '').toUpperCase();
  const base = symbol.endsWith('USDT') ? symbol.slice(0, -4) : symbol;
  const meta = COINS.find((c) => c.symbol === symbol);
  const ko = meta?.ko ?? base;
  const en = meta?.name ?? base;
  const [tfIdx, setTfIdx] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [trade, setTrade] = useState(false);
  const wl = useCryptoWatchlist();

  const { data: batch, error } = useSWR<Record<string, CryptoData>>(symbol ? `/api/crypto/batch?symbols=${symbol}` : null, fetcher, { refreshInterval: 5000 });
  const { data: chart } = useSWR<ChartPoint[]>(symbol ? `/api/crypto/chart/${symbol}?months=${TIMEFRAMES[tfIdx].months}` : null, fetcher, { refreshInterval: 60000 });

  const c = batch?.[symbol];
  const isUp = (c?.change ?? 0) >= 0;
  const watched = wl.watchlist.some((w) => w.symbol === symbol);
  const toggleWatch = () => (watched ? wl.remove(symbol) : wl.add({ symbol, base, name: en }));
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${ko} (${base}/USDT)`, url });
      else await navigator.clipboard.writeText(url);
    } catch { /* 사용자가 공유를 취소함 */ }
  };
  const actions: SheetAction[] = [
    { label: watched ? '관심 코인에서 삭제' : '관심 코인에 추가', icon: 'star', onClick: toggleWatch, danger: watched },
    ...(ANALYZABLE.includes(base) ? [{ label: '코인선물 분석', sub: '손절·사이징 체크리스트', icon: 'signal', href: '/coin-analysis' }] : []),
    ...(c ? [{ label: '가상투자', sub: '모의 매수·매도', icon: 'virtual', onClick: () => setTrade(true) }] : []),
    { label: '공유 · 링크 복사', icon: 'report', onClick: share },
  ];
  const nav = wl.watchlist.map((w) => ({ key: w.symbol, href: `/crypto/${w.symbol}`, label: COINS.find((x) => x.symbol === w.symbol)?.ko ?? w.name }));

  if (!c && error) {
    return <div className="fin-card p-8 text-center text-sm text-[var(--warn)] max-w-4xl mx-auto">시세를 불러오지 못했습니다 · {symbol}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <SwipeNav items={nav} current={symbol}>
        <div className="fin-card p-5 mb-3">
          <div className="flex items-start gap-1">
            <span className={`wl-badge ${badgeTint(ko + base)} !w-11 !h-11 mr-2`} aria-hidden>{base.slice(0, 3)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[20px] font-extrabold tracking-tight text-[var(--text)] truncate">{ko}</h1>
                <span className="text-[11px] px-2 py-0.5 rounded-md font-bold bg-[var(--amber-soft)] text-[var(--amber)]">{base}/USDT</span>
              </div>
              <span className="text-[12px] text-[var(--text-muted)]">{en} · Bitget 현물</span>
            </div>
            <button type="button" onClick={toggleWatch} className={`srch-star ${watched ? 'on' : ''}`} aria-pressed={watched} aria-label={watched ? '관심 코인 해제' : '관심 코인 추가'}>
              <svg viewBox="0 0 24 24" fill={watched ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden>
                <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" />
              </svg>
            </button>
            <KebabButton onClick={() => setMenuOpen(true)} label={`${ko} 메뉴`} />
          </div>

          {c ? (
            <>
              <p className="text-[32px] font-extrabold tabular-nums tracking-tight text-[var(--text)] mt-3 leading-none">{fmtCoinPrice(c.price)}</p>
              <p className="text-[15px] font-bold tabular-nums mt-1.5" style={{ color: c.change === 0 ? 'var(--faint)' : isUp ? UP : DOWN }}>
                {c.change === 0 ? '' : isUp ? '▲ ' : '▼ '}{fmtCoinPrice(Math.abs(c.change))} ({isUp ? '+' : ''}{c.changeRate.toFixed(2)}%) <span className="text-[12px] font-semibold text-[var(--faint)]">24시간</span>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 mt-4 pt-4 border-t border-[var(--line-2)] text-sm">
                <div><p className="text-[var(--text-muted)] text-[11px] mb-0.5">24시간 최고</p><p className="font-bold tabular-nums" style={{ color: UP }}>{fmtCoinPrice(c.high24h)}</p></div>
                <div><p className="text-[var(--text-muted)] text-[11px] mb-0.5">24시간 최저</p><p className="font-bold tabular-nums" style={{ color: DOWN }}>{fmtCoinPrice(c.low24h)}</p></div>
                <div><p className="text-[var(--text-muted)] text-[11px] mb-0.5">거래량</p><p className="font-bold text-[var(--text)] tabular-nums">{fmtVol(c.volume24h)} {base}</p></div>
                <div><p className="text-[var(--text-muted)] text-[11px] mb-0.5">거래대금</p><p className="font-bold text-[var(--text)] tabular-nums">${fmtVol(c.quoteVolume24h)}</p></div>
              </div>
            </>
          ) : (
            <div className="space-y-2 mt-3"><span className="skeleton h-8 w-40" /><span className="skeleton h-4 w-28" /><span className="skeleton h-16 w-full mt-3" /></div>
          )}
        </div>
      </SwipeNav>

      <PriceChart points={chart} isUp={isUp} tfIdx={tfIdx} onTf={setTfIdx} fmt={(n) => fmtCoinPrice(n)} yFmt={yFmt} />

      <ActionSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={ko} actions={actions} />
      {trade && c && (
        <VirtualTradeModal symbol={symbol} name={en} assetType="crypto" price={c.price} currency="USD" onClose={() => setTrade(false)} />
      )}
    </div>
  );
}
