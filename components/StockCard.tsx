'use client';

import useSWR from 'swr';
import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import type { StockData, PortfolioEntry, AlertEntry } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function fmt(n: number) {
  return new Intl.NumberFormat('ko-KR').format(Math.round(n));
}

function lastTradingLabel(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay();
  const d = new Date(kst);
  if (day === 0) d.setUTCDate(d.getUTCDate() - 2);
  else if (day === 6) d.setUTCDate(d.getUTCDate() - 1);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

const BRAND: Record<string, { bg: string; color: string; label: string }> = {
  '005930': { bg: '#1428A0', color: '#fff', label: '삼성' },
  '000660': { bg: '#E2001A', color: '#fff', label: 'SK' },
  '005380': { bg: '#002C5F', color: '#fff', label: '현대' },
  '373220': { bg: '#A50034', color: '#fff', label: 'LG' },
  '000270': { bg: '#05141F', color: '#fff', label: '기아' },
  '005490': { bg: '#00388D', color: '#fff', label: 'PS' },
  '035420': { bg: '#00C73C', color: '#fff', label: 'N' },
  '035720': { bg: '#3A1D6E', color: '#FFCD00', label: 'K' },
  '051910': { bg: '#A50034', color: '#fff', label: 'LG' },
  '068270': { bg: '#0051A2', color: '#fff', label: 'CT' },
};

function CompanyLogo({ ticker, name }: { ticker: string; name: string }) {
  const brand = BRAND[ticker];
  const initials = brand?.label ?? name.slice(0, 2);
  const bg = brand?.bg ?? '#374151';
  const color = brand?.color ?? '#fff';
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 shadow-md"
      style={{ backgroundColor: bg, color }}
    >
      {initials}
    </div>
  );
}

interface Props {
  ticker: string;
  name: string;
  market: string;
  usdRate?: number;
  portfolio?: PortfolioEntry;
  alert?: AlertEntry;
  onRemove: (ticker: string) => void;
}

export default function StockCard({ ticker, name, market, usdRate, portfolio, alert, onRemove }: Props) {
  const { data, error, isLoading } = useSWR<StockData>(
    `/api/stock/${ticker}`,
    fetcher,
    { refreshInterval: 5000, revalidateOnFocus: true }
  );

  const prevPriceRef = useRef<number | null>(null);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (data?.price === undefined) return;
    if (prevPriceRef.current !== null && prevPriceRef.current !== data.price) {
      setFlash(data.price > prevPriceRef.current ? 'up' : 'down');
      const t = setTimeout(() => setFlash(null), 1400);
      prevPriceRef.current = data.price;
      return () => clearTimeout(t);
    }
    prevPriceRef.current = data.price;
  }, [data?.price]);

  useEffect(() => {
    if (!data || !alert) return;
    const notify = (title: string, body: string) => {
      if ('Notification' in window && Notification.permission === 'granted')
        new Notification(title, { body });
    };
    if (alert.above && data.price >= alert.above)
      notify(`${data.name} 목표가 도달`, `현재가 ₩${fmt(data.price)} >= 목표 ₩${fmt(alert.above)}`);
    if (alert.below && data.price <= alert.below)
      notify(`${data.name} 하락 알림`, `현재가 ₩${fmt(data.price)} <= 하한 ₩${fmt(alert.below)}`);
  }, [data?.price, alert, data]);

  const dateLabel = lastTradingLabel();
  const isPos = (data?.change ?? 0) >= 0;
  const usdPrice = data && usdRate ? (data.price / usdRate).toFixed(2) : null;
  const pnl = portfolio && data ? (data.price - portfolio.avgPrice) * portfolio.quantity : null;
  const pnlRate = portfolio && data ? ((data.price - portfolio.avgPrice) / portfolio.avgPrice) * 100 : null;

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 animate-pulse space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/10" />
          <div className="h-5 w-28 bg-white/10 rounded" />
        </div>
        <div className="h-3 w-32 bg-white/10 rounded" />
        <div className="h-9 w-40 bg-white/10 rounded" />
        <div className="h-3 w-24 bg-white/10 rounded" />
        <div className="space-y-2 pt-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-3 bg-white/5 rounded" />)}
        </div>
      </div>
    );
  }

  if (error || !data || 'error' in data) {
    return (
      <div className="relative rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
        <button onClick={() => onRemove(ticker)} className="absolute top-3 right-3 text-[var(--text-muted)] hover:text-red-400 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <CompanyLogo ticker={ticker} name={name} />
        <p className="mt-2 text-sm font-semibold text-[var(--text)]">{name}</p>
        <p className="text-xs text-red-400 mt-1">데이터 로드 실패</p>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
      flash === 'up' ? 'flash-green border-emerald-500/25' :
      flash === 'down' ? 'flash-red border-red-500/25' :
      'border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-hover)]'
    }`}>
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <CompanyLogo ticker={ticker} name={data.name} />
            <div>
              <p className="font-bold text-[var(--text)] text-base leading-tight">{data.name}</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium mt-0.5 inline-block ${
                (data.market || market) === 'KOSDAQ'
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'bg-blue-500/20 text-blue-400'
              }`}>{data.market || market}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {alert && (alert.above || alert.below) && <span className="text-yellow-400 text-sm">🔔</span>}
            <button onClick={() => onRemove(ticker)} className="text-[var(--text-dim)] hover:text-red-400 transition-colors" title="제거">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Overseas price label */}
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-[var(--text-muted)]">해외 실시간 추정가</span>
        </div>

        {/* Price */}
        <Link href={`/stock/${ticker}`} className="block group">
          <div className="flex items-baseline gap-1.5 mb-0.5">
            <span className="text-3xl font-bold tabular-nums text-[var(--text)] group-hover:text-sky-300 transition-colors">
              ₩{fmt(data.price)}
            </span>
            <span className="text-base text-[var(--text-muted)]">원</span>
          </div>
          {usdPrice && (
            <p className="text-sm text-[var(--text-muted)] mb-2">≈ ${usdPrice} USD</p>
          )}
          <div className={`flex items-center gap-1 text-sm font-medium ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
            <span>{dateLabel} 종가 대비</span>
            <span>{isPos ? '▲' : '▼'}</span>
            <span className="tabular-nums">{fmt(Math.abs(data.change))}원</span>
            <span className="text-[var(--text-dim)]">|</span>
            <span className="tabular-nums">{isPos ? '+' : ''}{data.changeRate.toFixed(2)}%</span>
          </div>
        </Link>

        {/* Stats */}
        <div className="mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">{dateLabel} 거래량 (KRX+NXT)</span>
            <span className="text-[var(--text)] tabular-nums">{data.volume}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">{dateLabel} 거래대금 (KRX+NXT)</span>
            <span className="text-[var(--text)] tabular-nums">{data.tradingValue}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">시가총액</span>
            <span className="text-[var(--text)]">{data.marketCap}</span>
          </div>
        </div>

        <hr className="border-[var(--border)] my-3" />

        {/* Korean market */}
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">{dateLabel} 한국 종가</span>
            <span className="text-[var(--text)] tabular-nums">
              {data.prevClose ? `₩${fmt(data.prevClose)}` : '-'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">{dateLabel} 애프터마켓 마감가</span>
            <span className="text-[var(--text-muted)] tabular-nums">
              변동없음 {data.prevClose ? `₩${fmt(data.prevClose)}` : '-'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">한국 애프터마켓 대비</span>
            <span className={`font-medium tabular-nums ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
              {isPos ? '+' : ''}{data.changeRate.toFixed(2)}% · {isPos ? '+' : ''}₩{fmt(Math.abs(data.change))}
            </span>
          </div>
        </div>

        {/* Portfolio */}
        {pnl !== null && pnlRate !== null && portfolio && (
          <>
            <hr className="border-[var(--border)] my-3" />
            <div className="flex justify-between text-xs">
              <span className="text-[var(--text-muted)]">보유 {fmt(portfolio.quantity)}주</span>
              <span className={`font-semibold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {pnl >= 0 ? '+' : ''}{fmt(pnl)}원 ({pnlRate.toFixed(2)}%)
              </span>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <Link href={`/stock/${ticker}`} className="block border-t border-[var(--border)] px-5 py-2.5 text-center text-xs text-[var(--text-muted)] hover:text-sky-400 hover:bg-white/3 transition-colors">
        누르면 오늘 시장 정보로 전환됩니다
      </Link>
    </div>
  );
}
