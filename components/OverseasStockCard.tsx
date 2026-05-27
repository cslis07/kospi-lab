'use client';

import { useRef, useEffect, useState } from 'react';
import type { OverseasStockData } from '@/lib/types';
import VirtualTradeModal from './VirtualTradeModal';

// ── 브랜드 색상 ──────────────────────────────────────
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
  CRM:   { bg: '#00A1E0', color: '#fff',    label: 'S' },
  QCOM:  { bg: '#3253DC', color: '#fff',    label: 'Q' },
  MU:    { bg: '#003087', color: '#fff',    label: 'M' },
  ASML:  { bg: '#009FDB', color: '#fff',    label: 'A' },
  TSM:   { bg: '#003366', color: '#fff',    label: 'T' },
  SONY:  { bg: '#000',    color: '#fff',    label: 'S' },
  ARM:   { bg: '#0091BD', color: '#fff',    label: 'A' },
  PLTR:  { bg: '#1B1B1B', color: '#60a5fa', label: 'P' },
  COIN:  { bg: '#1652F0', color: '#fff',    label: 'C' },
  NVO:   { bg: '#001965', color: '#fff',    label: 'N' },
  JPM:   { bg: '#003087', color: '#fff',    label: 'J' },
  V:     { bg: '#1A1F71', color: '#fff',    label: 'V' },
  MA:    { bg: '#EB001B', color: '#fff',    label: 'M' },
  BA:    { bg: '#1565C0', color: '#fff',    label: 'B' },
  GE:    { bg: '#0A66C2', color: '#fff',    label: 'G' },
};

function CompanyLogo({ symbol }: { symbol: string }) {
  const brand = BRAND[symbol];
  const label = brand?.label ?? symbol.slice(0, 2);
  const bg    = brand?.bg    ?? '#374151';
  const color = brand?.color ?? '#fff';
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 shadow-md"
      style={{ backgroundColor: bg, color }}
    >
      {label}
    </div>
  );
}

// ── 숫자 포맷 ────────────────────────────────────────
function fmtUsd(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtCap(n: number) {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}
function fmtVol(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

// ── Props ────────────────────────────────────────────
interface Props {
  symbol: string;
  name: string;
  exchange: string;
  data?: OverseasStockData;       // from batch SWR
  usdRate?: number;               // KRW per USD
  onRemove: (symbol: string) => void;
}

export default function OverseasStockCard({ symbol, name, exchange, data, usdRate, onRemove }: Props) {
  const prevRef = useRef<number | null>(null);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const [showTrade, setShowTrade] = useState(false);

  useEffect(() => {
    if (data?.price === undefined) return;
    if (prevRef.current !== null && prevRef.current !== data.price) {
      setFlash(data.price > prevRef.current ? 'up' : 'down');
      const t = setTimeout(() => setFlash(null), 1400);
      prevRef.current = data.price;
      return () => clearTimeout(t);
    }
    prevRef.current = data.price;
  }, [data?.price]);

  const isPos  = (data?.changeRate ?? 0) >= 0;
  const clr    = isPos ? 'text-emerald-400' : 'text-red-400';
  const krwPrice = data && usdRate ? Math.round(data.price * usdRate) : null;

  // Loading skeleton
  if (!data) {
    return (
      <div style={{ boxShadow: 'var(--shadow-card)' }}
        className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 animate-pulse space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[var(--border)]" />
          <div className="h-5 w-28 bg-[var(--border)] rounded" />
        </div>
        <div className="h-9 w-36 bg-[var(--border)] rounded" />
        <div className="h-3 w-24 bg-[var(--border)] rounded" />
        <div className="space-y-2 pt-2">
          {[0,1,2].map(i => <div key={i} className="h-3 bg-[var(--border)] rounded" />)}
        </div>
      </div>
    );
  }

  if ('error' in (data as unknown as Record<string, unknown>)) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
        <CompanyLogo symbol={symbol} />
        <p className="mt-2 text-sm font-semibold text-[var(--text)]">{name}</p>
        <p className="text-xs text-red-400 mt-1">데이터 로드 실패</p>
      </div>
    );
  }

  return (
    <div
      style={{ boxShadow: 'var(--shadow-card)' }}
      className={`card-shadow rounded-2xl border transition-all duration-300 overflow-hidden ${
        flash === 'up'   ? 'flash-green border-emerald-500/25' :
        flash === 'down' ? 'flash-red border-red-500/25' :
        'border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-hover)]'
      }`}
    >
      <div className="p-5">
        {/* 헤더 */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <CompanyLogo symbol={symbol} />
            <div>
              <p className="font-bold text-[var(--text)] text-base leading-tight">{data.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-sky-500/20 text-sky-400">
                  {data.exchange || exchange}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] font-mono">{symbol}</span>
              </div>
            </div>
          </div>
          <button onClick={() => onRemove(symbol)}
            className="text-[var(--text-dim)] hover:text-red-400 transition-colors mt-0.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 실시간 표시 */}
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-[var(--text-muted)]">해외 실시간 추정가</span>
        </div>

        {/* 가격 */}
        <div className="mb-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tabular-nums text-[var(--text)]">
              ${fmtUsd(data.price)}
            </span>
            <span className="text-base text-[var(--text-muted)]">USD</span>
          </div>
          {krwPrice !== null && (
            <p className="text-sm text-[var(--text-muted)] mt-0.5">
              ≈ ₩{krwPrice.toLocaleString('ko-KR')} KRW
            </p>
          )}
          <div className={`flex items-center gap-1 text-sm font-medium mt-1 ${clr}`}>
            <span>{isPos ? '▲' : '▼'}</span>
            <span className="tabular-nums">${Math.abs(data.change).toFixed(2)}</span>
            <span className="text-[var(--text-dim)]">|</span>
            <span className="tabular-nums">{isPos ? '+' : ''}{data.changeRate.toFixed(2)}%</span>
          </div>
        </div>

        {/* 통계 */}
        <div className="mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">거래량</span>
            <span className="text-[var(--text)] tabular-nums">
              {(data as unknown as Record<string,unknown>).volumeFmt as string || fmtVol(data.volume)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">시가총액</span>
            <span className="text-[var(--text)]">
              {(data as unknown as Record<string,unknown>).marketCapFmt as string || fmtCap(data.marketCap)}
            </span>
          </div>
        </div>

        <hr className="border-[var(--border)] my-3" />

        {/* 전일 종가 / 52주 */}
        <div className="space-y-1.5 text-sm">
          {data.prevClose !== undefined && (
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">전일 종가</span>
              <span className="text-[var(--text)] tabular-nums">${fmtUsd(data.prevClose)}</span>
            </div>
          )}
          {data.high52w && (
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">52주 최고</span>
              <span className="text-emerald-400 tabular-nums">${fmtUsd(data.high52w)}</span>
            </div>
          )}
          {data.low52w && (
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">52주 최저</span>
              <span className="text-red-400 tabular-nums">${fmtUsd(data.low52w)}</span>
            </div>
          )}
        </div>
      </div>

      {/* 푸터 */}
      <div className="border-t border-[var(--border)] flex">
        <span className="flex-1 px-4 py-2.5 text-center text-xs text-[var(--text-muted)]">
          Yahoo Finance · {data.currency}
        </span>
        <button
          onClick={() => setShowTrade(true)}
          className="flex-1 px-4 py-2.5 text-center text-xs text-emerald-400 hover:bg-emerald-500/10 transition-colors border-l border-[var(--border)]">
          💹 가상투자
        </button>
      </div>

      {showTrade && (
        <VirtualTradeModal
          symbol={symbol}
          name={data.name}
          assetType="overseas"
          price={data.price}
          currency="USD"
          onClose={() => setShowTrade(false)}
        />
      )}
    </div>
  );
}
