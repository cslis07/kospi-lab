'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import HBarChart, { type BarItem } from '@/components/HBarChart';

// 코인선물 분석 엔진 지원 종목(그 외는 분석 버튼 없음)
const ANALYZABLE = new Set(['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'SOLUSDT']);

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
// 심볼에서 USDT 꼬리를 떼어 막대 라벨을 짧게(예: BTCUSDT → BTC)
const baseOf = (s: string) => s.replace(/USDT$/, '');

type SortKey = 'volume' | 'change' | 'funding';
type Filter  = 'all' | 'up' | 'down';
type ChartView = 'gainers' | 'losers' | 'volume';

export default function FuturesPage() {
  const { data, isLoading } = useSWR<FuturesRow[]>('/api/futures/tickers', fetcher, {
    refreshInterval: 10000,
    revalidateOnFocus: false,
  });

  const [filter, setFilter] = useState<Filter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('volume');
  const [chartView, setChartView] = useState<ChartView>('gainers');

  // ── 한눈에 보는 막대그래프 (상승·하락·거래대금 TOP 12) ──
  const chart = useMemo(() => {
    if (!Array.isArray(data) || !data.length) return { items: [] as BarItem[], mode: 'divergent' as const };
    if (chartView === 'volume') {
      const items = [...data]
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 12)
        .map((r) => ({ label: baseOf(r.symbol), value: r.quoteVolume, display: fmtVol(r.quoteVolume) }));
      return { items, mode: 'magnitude' as const };
    }
    const sorted = [...data].sort((a, b) =>
      chartView === 'gainers' ? b.changeRate - a.changeRate : a.changeRate - b.changeRate,
    );
    const items = sorted.slice(0, 12).map((r) => ({
      label: baseOf(r.symbol),
      value: r.changeRate,
      display: `${r.changeRate >= 0 ? '+' : ''}${r.changeRate.toFixed(2)}%`,
    }));
    return { items, mode: 'divergent' as const };
  }, [data, chartView]);

  const rows = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const filtered = data.filter((r) => {
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
  }, [data, filter, sortBy]);

  const CHART_TABS: [ChartView, string][] = [['gainers', '상승 TOP'], ['losers', '하락 TOP'], ['volume', '거래대금 TOP']];

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <h1 className="text-xl font-bold text-[var(--text)] mb-1">선물 시세 (USDT 무기한)</h1>
      <p className="text-sm text-[var(--text-muted)] mb-5">Bitget USDT-Margined Perpetual Futures · 10초마다 갱신</p>

      {/* ── 한눈에 보기: 막대그래프 ── */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-5">
        <div className="seg mb-4" role="tablist" aria-label="막대그래프 종류">
          {CHART_TABS.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={chartView === k}
              onClick={() => setChartView(k)}
              className={`seg-i ${chartView === k ? 'on' : ''}`}>{l}</button>
          ))}
        </div>
        {isLoading && !data ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => <div key={i} className="h-3 rounded bg-white/5 animate-pulse" />)}
          </div>
        ) : (
          <HBarChart items={chart.items} mode={chart.mode}
            posColor="bg-emerald-400/70" negColor="bg-red-400/70"
            posText="text-emerald-400" negText="text-red-400" />
        )}
        <p className="text-[11px] text-[var(--text-muted)] mt-3 opacity-60">
          {chartView === 'volume' ? '24시간 거래대금 상위 12종목' : `24시간 ${chartView === 'gainers' ? '상승률' : '하락률'} 상위 12종목`} · 참고용
        </p>
      </div>

      {/* 컨트롤 바 (검색 제거 — 표는 필터·정렬만) */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
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
                    <td className="px-3 py-2.5 font-mono font-semibold text-[var(--text)]">
                      <span className="inline-flex items-center gap-1.5">
                        {r.symbol}
                        {ANALYZABLE.has(r.symbol) && (
                          <Link href={`/coin-analysis?symbol=${r.symbol}&run=1`} onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-0.5 text-[10.5px] font-sans font-bold px-1.5 py-0.5 rounded-md text-[var(--accent)] bg-[var(--accent-soft)] border border-[var(--accent)]/25 hover:brightness-105"
                            aria-label={`${r.symbol} 분석`}>
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0M20 20l-3.5-3.5" /></svg>
                            분석
                          </Link>
                        )}
                      </span>
                    </td>
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
