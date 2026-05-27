'use client';

import Link from 'next/link';
import { useRef, useEffect, useState } from 'react';
import type { CryptoData } from '@/lib/types';

// ── 코인 브랜드 ──────────────────────────────────────────
const BRAND: Record<string, { bg: string; color: string; label: string }> = {
  BTC:  { bg: '#F7931A', color: '#fff',    label: '₿' },
  ETH:  { bg: '#627EEA', color: '#fff',    label: 'Ξ' },
  XRP:  { bg: '#346AA9', color: '#fff',    label: 'X' },
  SOL:  { bg: '#9945FF', color: '#fff',    label: 'S' },
  BNB:  { bg: '#F3BA2F', color: '#1a1a1a', label: 'B' },
  ADA:  { bg: '#0033AD', color: '#fff',    label: 'A' },
  DOGE: { bg: '#C2A633', color: '#fff',    label: 'D' },
  AVAX: { bg: '#E84142', color: '#fff',    label: 'A' },
  DOT:  { bg: '#E6007A', color: '#fff',    label: 'D' },
  MATIC:{ bg: '#8247E5', color: '#fff',    label: 'M' },
};

function CryptoLogo({ base }: { base: string }) {
  const b = BRAND[base];
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-base font-bold shrink-0 shadow-md"
      style={{ backgroundColor: b?.bg ?? '#374151', color: b?.color ?? '#fff' }}
    >
      {b?.label ?? base.slice(0, 2)}
    </div>
  );
}

// ── 숫자 포맷 ────────────────────────────────────────────
function fmtPrice(n: number) {
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1)    return n.toFixed(4);
  return n.toFixed(6);
}
function fmtVol(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(2);
}

// ── Props ────────────────────────────────────────────────
interface Props {
  symbol: string;
  base: string;
  name: string;
  data?: CryptoData;
  usdRate?: number;
  onRemove: (symbol: string) => void;
}

export default function CryptoCard({ symbol, base, name, data, usdRate, onRemove }: Props) {
  const prevRef = useRef<number | null>(null);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

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

  const isPos    = (data?.changeRate ?? 0) >= 0;
  const clr      = isPos ? 'text-emerald-400' : 'text-red-400';
  const krwPrice = data && usdRate ? Math.round(data.price * usdRate) : null;

  // ── 로딩 스켈레톤 ──
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
          {[0, 1, 2].map((i) => <div key={i} className="h-3 bg-[var(--border)] rounded" />)}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ boxShadow: 'var(--shadow-card)' }}
      className={`card-shadow rounded-2xl border transition-all duration-300 overflow-hidden ${
        flash === 'up'   ? 'flash-green border-emerald-500/25' :
        flash === 'down' ? 'flash-red   border-red-500/25'     :
        'border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-hover)]'
      }`}
    >
      <div className="p-5">
        {/* 헤더 */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <CryptoLogo base={base} />
            <div>
              <p className="font-bold text-[var(--text)] text-base leading-tight">{name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-amber-500/20 text-amber-400">
                  {base}/USDT
                </span>
                <span className="text-[10px] text-[var(--text-muted)] font-mono">Binance</span>
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
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs text-[var(--text-muted)]">Binance 실시간</span>
        </div>

        {/* 가격 */}
        <Link href={`/crypto/${symbol}`} className="block group">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tabular-nums text-[var(--text)] group-hover:text-amber-400 transition-colors">
              ${fmtPrice(data.price)}
            </span>
            <span className="text-base text-[var(--text-muted)]">USDT</span>
          </div>
          {krwPrice !== null && (
            <p className="text-sm text-[var(--text-muted)] mt-0.5">
              ≈ ₩{krwPrice.toLocaleString('ko-KR')} KRW
            </p>
          )}
          <div className={`flex items-center gap-1 text-sm font-medium mt-1 ${clr}`}>
            <span>{isPos ? '▲' : '▼'}</span>
            <span className="tabular-nums">${Math.abs(data.change).toFixed(data.price >= 1 ? 2 : 6)}</span>
            <span className="text-[var(--text-dim)]">|</span>
            <span className="tabular-nums">{isPos ? '+' : ''}{data.changeRate.toFixed(2)}%</span>
          </div>
        </Link>

        {/* 24h 통계 */}
        <div className="mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">24h 최고</span>
            <span className="text-emerald-400 tabular-nums">${fmtPrice(data.high24h)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">24h 최저</span>
            <span className="text-red-400 tabular-nums">${fmtPrice(data.low24h)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">24h 거래량</span>
            <span className="text-[var(--text)] tabular-nums">{fmtVol(data.volume24h)} {base}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">24h 거래대금</span>
            <span className="text-[var(--text)] tabular-nums">${fmtVol(data.quoteVolume24h)}</span>
          </div>
        </div>
      </div>

      {/* 푸터 */}
      <Link href={`/crypto/${symbol}`}
        className="block border-t border-[var(--border)] px-5 py-2.5 text-center text-xs text-[var(--text-muted)] hover:text-amber-400 hover:bg-white/3 transition-colors">
        차트 보기 →
      </Link>
    </div>
  );
}
