'use client';

/**
 * 해외 종목 상세 — 모달 대신 드릴다운 화면(뒤로가기).
 * 헤더(☆·⋮) → 가격 차트(지표 시트) → 접는 정보(52주 위치). 관심목록 안에선 옆으로 밀어 이전/다음 종목.
 * 색은 한국 관행(상승=빨강·하락=파랑). 데이터: /api/overseas/batch(15초) · /api/overseas/chart(5분).
 */
import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import PriceChart, { TIMEFRAMES } from '@/components/detail/PriceChart';
import SwipeNav from '@/components/detail/SwipeNav';
import Collapsible from '@/components/ui/Collapsible';
import ActionSheet, { KebabButton, type SheetAction } from '@/components/ui/ActionSheet';
import VirtualTradeModal from '@/components/VirtualTradeModal';
import { badgeTint } from '@/components/WatchRow';
import { useOverseasWatchlist } from '@/hooks/useOverseasWatchlist';
import type { OverseasStockData, ChartPoint } from '@/lib/types';

const UP = '#f04452';
const DOWN = '#3182f6';
const fetcher = (u: string) => fetch(u).then((r) => r.json());
// Yahoo 내부 거래소 코드 → 통용 명칭(NMS 같은 코드가 그대로 노출되지 않게)
const EXCHANGE: Record<string, string> = { NMS: 'NASDAQ', NGM: 'NASDAQ', NCM: 'NASDAQ', NASDAQGS: 'NASDAQ', NASDAQGM: 'NASDAQ', NYQ: 'NYSE', NYSE: 'NYSE', PCX: 'NYSE Arca', ASE: 'NYSE American', BTS: 'Cboe' };
const exName = (code: string) => EXCHANGE[code.replace(/\s/g, '').toUpperCase()] ?? code;
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const yFmt = (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v.toFixed(v >= 100 ? 0 : 2)}`);
function fmtCap(n?: number | null) {
  if (!n) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}
function fmtVol(n?: number | null) {
  if (!n) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return `${(n / 1e3).toFixed(0)}K`;
}

export default function OverseasDetailPage() {
  const symbol = decodeURIComponent(String(useParams().symbol ?? '')).toUpperCase();
  const [tfIdx, setTfIdx] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [trade, setTrade] = useState(false);
  const wl = useOverseasWatchlist();

  const { data: batch, error } = useSWR<Record<string, OverseasStockData>>(
    symbol ? `/api/overseas/batch?symbols=${encodeURIComponent(symbol)}` : null, fetcher, { refreshInterval: 15000 });
  const { data: chart } = useSWR<ChartPoint[]>(
    symbol ? `/api/overseas/chart?symbol=${encodeURIComponent(symbol)}&months=${TIMEFRAMES[tfIdx].months}` : null, fetcher, { refreshInterval: 300000 });
  const { data: market } = useSWR<{ usdkrw?: { value: number } | null }>('/api/market', fetcher, { refreshInterval: 60000, revalidateOnFocus: false });

  const d = batch?.[symbol];
  const saved = wl.watchlist.find((w) => w.symbol === symbol);
  const name = d?.name ?? saved?.name ?? symbol;
  const exchange = exName(saved?.exchange || d?.exchange || '');
  const watched = !!saved;
  const isUp = (d?.change ?? 0) >= 0;
  const krw = d && market?.usdkrw?.value ? Math.round(d.price * market.usdkrw.value) : null;

  const toggleWatch = () => (watched ? wl.remove(symbol) : wl.add({ symbol, name, exchange }));
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${name} (${symbol})`, url });
      else await navigator.clipboard.writeText(url);
    } catch { /* 사용자가 공유를 취소함 */ }
  };
  const actions: SheetAction[] = [
    { label: watched ? '관심종목에서 삭제' : '관심종목에 추가', icon: 'star', onClick: toggleWatch, danger: watched },
    ...(d ? [{ label: '가상투자', sub: '모의 매수·매도', icon: 'virtual', onClick: () => setTrade(true) }] : []),
    { label: '매매 계획 세우기', sub: '손절·사이징 먼저', icon: 'planner', href: '/planner' },
    { label: 'Yahoo Finance에서 열기', icon: 'news', href: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`, external: true },
    { label: '공유 · 링크 복사', icon: 'report', onClick: share },
  ];
  const nav = wl.watchlist.map((w) => ({ key: w.symbol, href: `/overseas/${encodeURIComponent(w.symbol)}`, label: w.name }));

  if (!d && error) {
    return <div className="fin-card p-8 text-center text-sm text-[var(--warn)] max-w-4xl mx-auto">시세를 불러오지 못했습니다 · {symbol}</div>;
  }

  const pos = d?.high52w && d?.low52w && d.high52w > d.low52w ? (d.price - d.low52w) / (d.high52w - d.low52w) : null;

  return (
    <div className="max-w-4xl mx-auto">
      <SwipeNav items={nav} current={symbol}>
        <div className="fin-card p-5 mb-3">
          <div className="flex items-start gap-1">
            <span className={`wl-badge ${badgeTint(name + symbol)} !w-11 !h-11 mr-2`} aria-hidden>{symbol.slice(0, 2)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[20px] font-extrabold tracking-tight text-[var(--text)] truncate">{name}</h1>
                {exchange && <span className="text-[11px] px-2 py-0.5 rounded-md font-bold bg-[var(--accent-soft)] text-[var(--accent)]">{exchange}</span>}
              </div>
              <span className="text-[12px] text-[var(--text-muted)] tabular-nums">{symbol}</span>
            </div>
            <button type="button" onClick={toggleWatch} className={`srch-star ${watched ? 'on' : ''}`} aria-pressed={watched} aria-label={watched ? '관심종목 해제' : '관심종목 추가'}>
              <svg viewBox="0 0 24 24" fill={watched ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden>
                <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" />
              </svg>
            </button>
            <KebabButton onClick={() => setMenuOpen(true)} label={`${name} 메뉴`} />
          </div>

          {d ? (
            <>
              <p className="text-[32px] font-extrabold tabular-nums tracking-tight text-[var(--text)] mt-3 leading-none">{usd(d.price)}</p>
              <p className="text-[15px] font-bold tabular-nums mt-1.5" style={{ color: d.change === 0 ? 'var(--faint)' : isUp ? UP : DOWN }}>
                {d.change === 0 ? '' : isUp ? '▲ ' : '▼ '}{usd(Math.abs(d.change))} ({isUp ? '+' : ''}{d.changeRate.toFixed(2)}%)
              </p>
              {krw !== null && <p className="text-[12px] text-[var(--text-muted)] mt-0.5 tabular-nums">≈ {krw.toLocaleString('ko-KR')}원</p>}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 mt-4 pt-4 border-t border-[var(--line-2)] text-sm">
                <div><p className="text-[var(--text-muted)] text-[11px] mb-0.5">시가총액</p><p className="font-bold text-[var(--text)] tabular-nums">{fmtCap(d.marketCap)}</p></div>
                <div><p className="text-[var(--text-muted)] text-[11px] mb-0.5">거래량</p><p className="font-bold text-[var(--text)] tabular-nums">{fmtVol(d.volume)}</p></div>
                <div><p className="text-[var(--text-muted)] text-[11px] mb-0.5">52주 최고</p><p className="font-bold tabular-nums" style={{ color: UP }}>{d.high52w ? usd(d.high52w) : '—'}</p></div>
                <div><p className="text-[var(--text-muted)] text-[11px] mb-0.5">52주 최저</p><p className="font-bold tabular-nums" style={{ color: DOWN }}>{d.low52w ? usd(d.low52w) : '—'}</p></div>
              </div>
            </>
          ) : (
            <div className="space-y-2 mt-3"><span className="skeleton h-8 w-40" /><span className="skeleton h-4 w-28" /><span className="skeleton h-16 w-full mt-3" /></div>
          )}
        </div>
      </SwipeNav>

      <PriceChart points={chart} isUp={isUp} tfIdx={tfIdx} onTf={setTfIdx} fmt={usd} yFmt={yFmt} />

      {d && pos !== null && (
        <Collapsible title="52주 위치" sub={`하단에서 ${Math.round(pos * 100)}%`} defaultOpen>
          <div className="relative h-2 rounded-full bg-[var(--surface-2)] mt-1">
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pos * 100}%`, background: `linear-gradient(90deg, ${DOWN}, ${UP})`, opacity: 0.55 }} />
            <span className="absolute top-1/2 w-3.5 h-3.5 -mt-[7px] -ml-[7px] rounded-full bg-[var(--surface)] border-2" style={{ left: `${pos * 100}%`, borderColor: 'var(--ink)' }} />
          </div>
          <div className="flex justify-between text-[11.5px] font-semibold mt-2 tabular-nums">
            <span style={{ color: DOWN }}>{usd(d.low52w!)}</span>
            <span className="text-[var(--faint)]">전일 종가 {d.prevClose ? usd(d.prevClose) : '—'}</span>
            <span style={{ color: UP }}>{usd(d.high52w!)}</span>
          </div>
        </Collapsible>
      )}

      <ActionSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={name} actions={actions} />
      {trade && d && (
        <VirtualTradeModal symbol={symbol} name={d.name} assetType="overseas" price={d.price} currency="USD" onClose={() => setTrade(false)} />
      )}
    </div>
  );
}
