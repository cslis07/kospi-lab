'use client';

import useSWR from 'swr';
import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import type { StockData, PortfolioEntry, AlertEntry } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function fmt(n: number) {
  return new Intl.NumberFormat('ko-KR').format(n);
}

interface Props {
  ticker: string;
  name: string;
  market: string;
  portfolio?: PortfolioEntry;
  alert?: AlertEntry;
  onRemove: (ticker: string) => void;
}

export default function StockCard({ ticker, name, market, portfolio, alert, onRemove }: Props) {
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
      const t = setTimeout(() => setFlash(null), 1200);
      prevPriceRef.current = data.price;
      return () => clearTimeout(t);
    }
    prevPriceRef.current = data.price;
  }, [data?.price]);

  // Price alert browser notification
  useEffect(() => {
    if (!data || !alert) return;
    const notify = (title: string, body: string) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    };
    if (alert.above && data.price >= alert.above) {
      notify(`${data.name} 목표가 도달`, `현재가 ₩${fmt(data.price)} ≥ ₩${fmt(alert.above)}`);
    }
    if (alert.below && data.price <= alert.below) {
      notify(`${data.name} 하락 알림`, `현재가 ₩${fmt(data.price)} ≤ ₩${fmt(alert.below)}`);
    }
  }, [data?.price, alert, data]);

  const isPos = (data?.change ?? 0) >= 0;
  const sign = isPos ? '+' : '';

  // Portfolio calc
  let pnl: number | null = null;
  let pnlRate: number | null = null;
  if (portfolio && data?.price) {
    pnl = (data.price - portfolio.avgPrice) * portfolio.quantity;
    pnlRate = ((data.price - portfolio.avgPrice) / portfolio.avgPrice) * 100;
  }

  // 52w bar position
  const barPct =
    data?.high52w && data?.low52w && data.high52w > data.low52w
      ? Math.min(100, Math.max(0, ((data.price - data.low52w) / (data.high52w - data.low52w)) * 100))
      : null;

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 animate-pulse">
        <div className="h-4 w-24 bg-white/10 rounded mb-3" />
        <div className="h-8 w-32 bg-white/10 rounded mb-2" />
        <div className="h-3 w-20 bg-white/10 rounded" />
      </div>
    );
  }

  if (error || !data || 'error' in data) {
    return (
      <div className="relative rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
        <button onClick={() => onRemove(ticker)} className="absolute top-3 right-3 text-gray-600 hover:text-red-400 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <p className="text-sm text-[var(--text-muted)]">{name}</p>
        <p className="text-xs text-red-400 mt-1">데이터 로드 실패</p>
      </div>
    );
  }

  return (
    <div className={`relative group rounded-2xl border transition-all duration-300 p-5 ${
      flash === 'up' ? 'flash-green border-emerald-500/30' :
      flash === 'down' ? 'flash-red border-red-500/30' :
      'border-[var(--border)] bg-[var(--bg-card)] hover:border-white/20'
    }`}>
      {/* Action buttons */}
      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
        {alert && (alert.above || alert.below) && (
          <span title="알림 설정됨" className="text-yellow-400 text-xs">🔔</span>
        )}
        <button onClick={() => onRemove(ticker)} className="text-gray-600 hover:text-red-400 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Header */}
      <Link href={`/stock/${ticker}`} className="block mb-3">
        <p className="text-sm font-semibold text-[var(--text)] leading-tight hover:text-sky-400 transition-colors">{data.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-[var(--text-muted)] font-mono">{ticker}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            (data.market || market) === 'KOSDAQ'
              ? 'bg-purple-500/20 text-purple-400'
              : 'bg-blue-500/20 text-blue-400'
          }`}>{data.market || market}</span>
        </div>
      </Link>

      {/* Price */}
      <p className="text-2xl font-bold tabular-nums text-[var(--text)]">₩{fmt(data.price)}</p>
      <div className={`flex items-center gap-1 mt-1 ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
        <svg className={`w-3 h-3 ${isPos ? '' : 'rotate-180'}`} viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l8 16H4z" /></svg>
        <span className="text-sm font-semibold tabular-nums">
          {sign}{fmt(data.change)}원 ({sign}{data.changeRate.toFixed(2)}%)
        </span>
      </div>

      {/* 52-week bar */}
      {barPct !== null && (
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-1">
            <span>52주 최저 ₩{fmt(data.low52w!)}</span>
            <span>최고 ₩{fmt(data.high52w!)}</span>
          </div>
          <div className="relative h-1.5 bg-white/10 rounded-full overflow-visible">
            <div
              className={`absolute h-full rounded-full ${isPos ? 'bg-emerald-500/60' : 'bg-red-500/60'}`}
              style={{ width: `${barPct}%` }}
            />
            <div
              className="absolute w-2.5 h-2.5 bg-white rounded-full -top-[3px] -translate-x-1/2 shadow"
              style={{ left: `${barPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="mt-4 pt-3 border-t border-[var(--border)] grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div>
          <p className="text-[var(--text-muted)]">거래량</p>
          <p className="text-[var(--text)] tabular-nums mt-0.5">{data.volume}</p>
        </div>
        <div>
          <p className="text-[var(--text-muted)]">시가총액</p>
          <p className="text-[var(--text)] mt-0.5">{data.marketCap}</p>
        </div>
      </div>

      {/* Portfolio */}
      {portfolio && pnl !== null && pnlRate !== null && (
        <div className={`mt-2 pt-2 border-t border-[var(--border)] text-xs flex justify-between ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          <span>{portfolio.quantity}주 보유</span>
          <span>{pnl >= 0 ? '+' : ''}{fmt(Math.round(pnl))}원 ({pnlRate.toFixed(2)}%)</span>
        </div>
      )}

      {/* Detail link */}
      <Link
        href={`/stock/${ticker}`}
        className="mt-3 flex items-center justify-center gap-1 text-xs text-[var(--text-muted)] hover:text-sky-400 transition-colors"
      >
        상세 보기
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
      </Link>
    </div>
  );
}
