'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';

interface FuturesRow {
  symbol: string;
  price: number;
  changeRate: number;
  high24h: number;
  low24h: number;
  quoteVolume: number;
  fundingRate: number | null;
  holdingAmount: number | null;
}

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const fmtPrice = (n: number) => {
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 1)    return n.toFixed(4);
  return n.toPrecision(4);
};
const fmtVol = (n: number) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

type SortKey = 'volume' | 'change' | 'funding';
type Filter  = 'all' | 'up' | 'down';

export default function FuturesPage() {
  const { data, isLoading } = useSWR<FuturesRow[]>('/api/futures/tickers', fetcher, {
    refreshInterval: 10000,
    revalidateOnFocus: false,
  });

  const [query, setQuery]   = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('volume');

  const rows = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const q = query.trim().toUpperCase();
    const filtered = data.filter((r) => {
      if (q && !r.symbol.includes(q)) return false;
      if (filter === 'up'   && r.changeRate <= 0) return false;
      if (filter === 'down' && r.changeRate >= 0) return false;
      return true;
    });
    filtered.sort((a, b) => {
      if (sortBy === 'volume')  return b.quoteVolume - a.quoteVolume;
      if (sortBy === 'change')  return b.changeRate  - a.changeRate;
      if (sortBy === 'funding') return (b.fundingRate ?? -Infinity) - (a.fundingRate ?? -Infinity);
      return 0;
    });
    return filtered.slice(0, 100);
  }, [data, query, filter, sortBy]);

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <h1 className="text-xl font-bold text-[var(--text)] mb-1">선물 시세 (USDT 무기한)</h1>
      <p className="text-sm text-[var(--text-muted)] mb-5">Bitget USDT-Margined Perpetual Futures · 10초마다 갱신</p>

      {/* 컨트롤 바 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input type="text" placeholder="심볼 검색 (예: BTC)"
          value={query} onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[160px] bg-white/5 border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-sky-500/50" />
        <div className="flex gap-1">
          {([['all', '전체'], ['up', '상승'], ['down', '하락']] as [Filter, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-2.5 py-1 rounded-lg border text-xs transition-all ${
                filter === k ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-[var(--border)] text-[var(--text-muted)]'
              }`}>{l}</button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          <span className="text-xs text-[var(--text-muted)] self-center">정렬</span>
          {([['volume', '거래대금'], ['change', '상승률'], ['funding', '펀딩비']] as [SortKey, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setSortBy(k)}
              className={`px-2.5 py-1 rounded-lg border text-xs transition-all ${
                sortBy === k ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-[var(--border)] text-[var(--text-muted)]'
              }`}>{l}</button>
          ))}
        </div>
      </div>

      {/* 테이블 */}
      {isLoading && (
        <div className="space-y-2">
          {[...Array(10)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-white/5 animate-pulse" />)}
        </div>
      )}

      {!isLoading && (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
                <th className="text-left  px-3 py-2.5 text-[var(--text-muted)] font-medium">심볼</th>
                <th className="text-right px-3 py-2.5 text-[var(--text-muted)] font-medium">현재가</th>
                <th className="text-right px-3 py-2.5 text-[var(--text-muted)] font-medium">24h%</th>
                <th className="text-right px-3 py-2.5 text-[var(--text-muted)] font-medium hidden sm:table-cell">고가</th>
                <th className="text-right px-3 py-2.5 text-[var(--text-muted)] font-medium hidden sm:table-cell">저가</th>
                <th className="text-right px-3 py-2.5 text-[var(--text-muted)] font-medium">거래대금</th>
                <th className="text-right px-3 py-2.5 text-[var(--text-muted)] font-medium hidden sm:table-cell">펀딩비</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const up = r.changeRate >= 0;
                return (
                  <tr key={r.symbol} className={`border-t border-[var(--border)] hover:bg-white/3 ${i % 2 === 0 ? '' : 'bg-[var(--bg)]/20'}`}>
                    <td className="px-3 py-2.5 font-mono font-semibold text-[var(--text)]">{r.symbol}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text)]">${fmtPrice(r.price)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                      {up ? '+' : ''}{r.changeRate.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-muted)] hidden sm:table-cell">${fmtPrice(r.high24h)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-muted)] hidden sm:table-cell">${fmtPrice(r.low24h)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text)]">{fmtVol(r.quoteVolume)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums hidden sm:table-cell ${
                      r.fundingRate == null ? 'text-[var(--text-muted)]' :
                      r.fundingRate > 0     ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {r.fundingRate != null ? `${r.fundingRate > 0 ? '+' : ''}${r.fundingRate.toFixed(4)}%` : '-'}
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr><td colSpan={7} className="text-center py-8 text-[var(--text-muted)]">조건에 맞는 종목이 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-center text-[11px] text-[var(--text-muted)] mt-4 opacity-60">
        * 펀딩비는 8시간마다 정산 · 최대 100개 표시
      </p>
    </div>
  );
}
