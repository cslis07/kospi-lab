'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useVirtualPortfolio } from '@/hooks/useVirtualPortfolio';
import type { StockData, OverseasStockData, CryptoData, VirtualHolding } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function fmtKrw(n: number) {
  return `₩${Math.round(n).toLocaleString('ko-KR')}`;
}
function fmtUsd(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtNum(n: number, cur: 'KRW' | 'USD') {
  return cur === 'KRW' ? fmtKrw(n) : fmtUsd(n);
}
function fmtTs(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

type TabKey = 'portfolio' | 'ranking' | 'history';

export default function VirtualPage() {
  const { state, mounted, sell, reset } = useVirtualPortfolio();
  const [tab, setTab] = useState<TabKey>('portfolio');

  // 보유 종목 분류
  const domesticSymbols = Object.values(state.holdings)
    .filter((h) => h.assetType === 'domestic').map((h) => h.symbol);
  const overseasSymbols = Object.values(state.holdings)
    .filter((h) => h.assetType === 'overseas').map((h) => h.symbol);
  const cryptoSymbols   = Object.values(state.holdings)
    .filter((h) => h.assetType === 'crypto').map((h) => h.symbol);

  // 현재가 조회
  const { data: domesticData } = useSWR<Record<string, StockData>>(
    domesticSymbols.length ? `/api/stock/batch?tickers=${domesticSymbols.join(',')}` : null,
    fetcher, { refreshInterval: 5000 }
  );
  const { data: overseasData } = useSWR<Record<string, OverseasStockData>>(
    overseasSymbols.length ? `/api/overseas/batch?symbols=${overseasSymbols.join(',')}` : null,
    fetcher, { refreshInterval: 15000 }
  );
  const { data: cryptoData } = useSWR<Record<string, CryptoData>>(
    cryptoSymbols.length ? `/api/crypto/batch?symbols=${cryptoSymbols.join(',')}` : null,
    fetcher, { refreshInterval: 5000 }
  );

  // USD/KRW 환율
  const { data: market } = useSWR('/api/market', fetcher, { refreshInterval: 10000 });
  const usdRate = (market?.usdkrw?.value as number | undefined) ?? 1400;

  // 현재가 조회 헬퍼
  const getCurrentPrice = (h: VirtualHolding): number | null => {
    if (h.assetType === 'domestic') return domesticData?.[h.symbol]?.price ?? null;
    if (h.assetType === 'overseas') return overseasData?.[h.symbol]?.price ?? null;
    if (h.assetType === 'crypto')   return cryptoData?.[h.symbol]?.price   ?? null;
    return null;
  };

  // 포트폴리오 요약 계산
  const summary = useMemo(() => {
    let totalKrw = state.krw;
    let totalUsdAsKrw = state.usd * usdRate;
    let unrealizedKrw = 0;
    let unrealizedUsd = 0;

    Object.values(state.holdings).forEach((h) => {
      const curPrice = getCurrentPrice(h);
      if (curPrice === null) return;
      const marketVal = h.qty * curPrice;
      const costVal   = h.qty * h.avgPrice;
      if (h.currency === 'KRW') {
        totalKrw      += marketVal;
        unrealizedKrw += marketVal - costVal;
      } else {
        totalUsdAsKrw += marketVal * usdRate;
        unrealizedUsd += marketVal - costVal;
      }
    });

    const totalKrwEquiv   = totalKrw + totalUsdAsKrw;
    const initialKrwEquiv = state.initialKrw + state.initialUsd * usdRate;
    const totalUnrealized = unrealizedKrw + unrealizedUsd * usdRate;
    const totalPnl        = totalKrwEquiv - initialKrwEquiv;

    return { totalKrw, totalUsdAsKrw, totalKrwEquiv, initialKrwEquiv, totalUnrealized, totalPnl };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, domesticData, overseasData, cryptoData, usdRate]);

  // 수익률 랭킹 (보유 종목 P&L 정렬)
  const rankedHoldings = useMemo(() => {
    return Object.values(state.holdings)
      .map((h) => {
        const curPrice  = getCurrentPrice(h);
        const marketVal = curPrice !== null ? h.qty * curPrice : null;
        const costVal   = h.qty * h.avgPrice;
        const pnl       = marketVal !== null ? marketVal - costVal : null;
        const pnlRate   = pnl !== null && costVal > 0 ? (pnl / costVal) * 100 : null;
        return { h, curPrice, pnl, pnlRate };
      })
      .filter((r) => r.pnlRate !== null)
      .sort((a, b) => (b.pnlRate ?? 0) - (a.pnlRate ?? 0));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, domesticData, overseasData, cryptoData]);

  if (!mounted) {
    return (
      <div className="max-w-4xl mx-auto animate-pulse space-y-4">
        <div className="h-36 bg-[var(--bg-card)] rounded-2xl" />
        <div className="h-64 bg-[var(--bg-card)] rounded-2xl" />
      </div>
    );
  }

  const isPnlPos = summary.totalPnl >= 0;

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'portfolio', label: '보유 종목' },
    { key: 'ranking',   label: '수익률 랭킹' },
    { key: 'history',   label: '거래 내역' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-12">
      {/* ── 포트폴리오 요약 ── */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-base font-bold text-[var(--text)]">가상 포트폴리오</h1>
          <button
            onClick={() => {
              if (confirm('초기화하면 모든 가상 거래 내역이 삭제됩니다. 계속할까요?')) reset();
            }}
            className="text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors border border-[var(--border)] rounded-lg px-3 py-1.5"
          >
            초기화
          </button>
        </div>

        {/* 총 자산 */}
        <div className="text-center py-4">
          <p className="text-xs text-[var(--text-muted)] mb-1">총 평가 자산 (KRW 환산)</p>
          <p className="text-4xl font-bold tabular-nums text-[var(--text)]">
            {fmtKrw(summary.totalKrwEquiv)}
          </p>
          <div className={`flex items-center justify-center gap-2 mt-2 text-sm font-semibold ${isPnlPos ? 'text-emerald-400' : 'text-red-400'}`}>
            <span>{isPnlPos ? '▲' : '▼'}</span>
            <span>{fmtKrw(Math.abs(summary.totalPnl))}</span>
            <span className="text-[var(--text-dim)]">|</span>
            <span>
              {isPnlPos ? '+' : ''}
              {summary.initialKrwEquiv > 0
                ? ((summary.totalPnl / summary.initialKrwEquiv) * 100).toFixed(2)
                : '0.00'}%
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1.5">
            미실현 손익 {summary.totalUnrealized >= 0 ? '+' : ''}{fmtKrw(summary.totalUnrealized)}
          </p>
        </div>

        {/* 잔고 */}
        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-[var(--border)]">
          <div className="text-center p-3 rounded-xl bg-white/5">
            <p className="text-xs text-[var(--text-muted)] mb-1">KRW 예수금</p>
            <p className="font-bold text-[var(--text)] tabular-nums">{fmtKrw(state.krw)}</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-white/5">
            <p className="text-xs text-[var(--text-muted)] mb-1">USD 예수금</p>
            <p className="font-bold text-[var(--text)] tabular-nums">{fmtUsd(state.usd)}</p>
          </div>
        </div>
      </div>

      {/* ── 탭 ── */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        {/* 탭 헤더 */}
        <div className="flex border-b border-[var(--border)]">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'text-sky-400 border-b-2 border-sky-400 -mb-px'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {t.label}
              {t.key === 'portfolio' && Object.values(state.holdings).length > 0 && (
                <span className="ml-1.5 text-[10px] bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded-full">
                  {Object.values(state.holdings).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* ── 보유 종목 탭 ── */}
          {tab === 'portfolio' && (
            <>
              {Object.values(state.holdings).length === 0 ? (
                <p className="text-center text-[var(--text-muted)] text-sm py-8">
                  보유 종목이 없습니다.<br />
                  <Link href="/" className="text-sky-400 hover:underline mt-1 inline-block">
                    대시보드에서 매수해보세요 →
                  </Link>
                </p>
              ) : (
                <div className="space-y-3">
                  {Object.values(state.holdings).map((h) => {
                    const curPrice  = getCurrentPrice(h);
                    const marketVal = curPrice !== null ? h.qty * curPrice : null;
                    const costVal   = h.qty * h.avgPrice;
                    const pnl       = marketVal !== null ? marketVal - costVal : null;
                    const pnlRate   = pnl !== null && costVal > 0 ? (pnl / costVal) * 100 : null;
                    const isPos     = (pnl ?? 0) >= 0;

                    return (
                      <div key={h.symbol}
                        className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] hover:border-[var(--border-hover)] transition-colors">
                        {/* 종류 뱃지 */}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ${
                          h.assetType === 'domestic' ? 'bg-blue-500/20 text-blue-400' :
                          h.assetType === 'overseas' ? 'bg-sky-500/20 text-sky-400'  :
                          'bg-amber-500/20 text-amber-400'
                        }`}>
                          {h.assetType === 'domestic' ? '국내' : h.assetType === 'overseas' ? '해외' : '코인'}
                        </span>

                        {/* 종목명 */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--text)] truncate">{h.name}</p>
                          <p className="text-[10px] text-[var(--text-muted)] font-mono">{h.symbol}</p>
                          {/* 목표가/손절가 */}
                          {(h.targetPrice || h.stopLoss) && (
                            <div className="flex gap-2 mt-0.5">
                              {h.targetPrice && (
                                <span className="text-[10px] text-emerald-400">
                                  목표 {fmtNum(h.targetPrice, h.currency)}
                                </span>
                              )}
                              {h.stopLoss && (
                                <span className="text-[10px] text-red-400">
                                  손절 {fmtNum(h.stopLoss, h.currency)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* 수량·평균단가 */}
                        <div className="text-right text-xs text-[var(--text-muted)] shrink-0">
                          <p>{h.qty.toLocaleString('en-US', { maximumFractionDigits: 8 })}주</p>
                          <p>평단 {fmtNum(h.avgPrice, h.currency)}</p>
                        </div>

                        {/* 평가손익 */}
                        <div className="text-right shrink-0 min-w-[80px]">
                          {pnl !== null ? (
                            <>
                              <p className={`text-sm font-bold tabular-nums ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                                {isPos ? '+' : ''}{fmtNum(pnl, h.currency)}
                              </p>
                              <p className={`text-[10px] tabular-nums ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                                {isPos ? '+' : ''}{pnlRate?.toFixed(2)}%
                              </p>
                            </>
                          ) : (
                            <p className="text-xs text-[var(--text-muted)]">로딩중...</p>
                          )}
                        </div>

                        {/* 전량 매도 */}
                        {curPrice !== null && (
                          <button
                            onClick={() => {
                              if (confirm(`${h.name} 전량 매도 (${h.qty}주)?`)) sell(h.symbol, h.qty, curPrice);
                            }}
                            className="text-[10px] px-2 py-1 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                          >
                            전량매도
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── 수익률 랭킹 탭 ── */}
          {tab === 'ranking' && (
            <>
              {rankedHoldings.length === 0 ? (
                <p className="text-center text-[var(--text-muted)] text-sm py-8">
                  수익률을 계산할 종목이 없습니다<br />
                  <span className="text-xs">현재가 로딩 중이거나 보유 종목이 없습니다</span>
                </p>
              ) : (
                <div className="space-y-2">
                  {rankedHoldings.map(({ h, curPrice, pnl, pnlRate }, idx) => {
                    const isPos = (pnlRate ?? 0) >= 0;
                    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}위`;
                    return (
                      <div key={h.symbol}
                        className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-white/2">
                        {/* 순위 */}
                        <span className="text-sm font-bold shrink-0 w-8 text-center">
                          {medal}
                        </span>

                        {/* 종목 */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--text)] truncate">{h.name}</p>
                          <p className="text-[10px] text-[var(--text-muted)] font-mono">{h.symbol}</p>
                        </div>

                        {/* 현재가 */}
                        <div className="text-right text-xs text-[var(--text-muted)] shrink-0">
                          {curPrice !== null && <p>{fmtNum(curPrice, h.currency)}</p>}
                          <p>매수 {fmtNum(h.avgPrice, h.currency)}</p>
                        </div>

                        {/* 수익률 */}
                        <div className="text-right shrink-0 min-w-[80px]">
                          <p className={`text-lg font-bold tabular-nums ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isPos ? '+' : ''}{pnlRate?.toFixed(2)}%
                          </p>
                          <p className={`text-xs tabular-nums ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                            {pnl !== null && <>{isPos ? '+' : ''}{fmtNum(pnl, h.currency)}</>}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {/* 통계 요약 */}
                  <div className="mt-4 pt-4 border-t border-[var(--border)] grid grid-cols-3 gap-3 text-center text-xs">
                    <div className="p-2 rounded-lg bg-emerald-500/10">
                      <p className="text-[var(--text-muted)] mb-0.5">최고 수익</p>
                      <p className="font-bold text-emerald-400">
                        +{rankedHoldings[0]?.pnlRate?.toFixed(2) ?? '0.00'}%
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-white/5">
                      <p className="text-[var(--text-muted)] mb-0.5">종목 수</p>
                      <p className="font-bold text-[var(--text)]">{rankedHoldings.length}개</p>
                    </div>
                    <div className="p-2 rounded-lg bg-red-500/10">
                      <p className="text-[var(--text-muted)] mb-0.5">최저 수익</p>
                      <p className="font-bold text-red-400">
                        {(rankedHoldings[rankedHoldings.length - 1]?.pnlRate ?? 0) >= 0 ? '+' : ''}
                        {rankedHoldings[rankedHoldings.length - 1]?.pnlRate?.toFixed(2) ?? '0.00'}%
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── 거래 내역 (투자 일지) 탭 ── */}
          {tab === 'history' && (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-[var(--text-muted)]">
                  총 {state.history.length}건 · 최근 50건 표시
                </span>
              </div>
              {state.history.length === 0 ? (
                <p className="text-center text-[var(--text-muted)] text-sm py-8">거래 내역이 없습니다</p>
              ) : (
                <div className="space-y-2">
                  {state.history.slice(0, 50).map((t) => (
                    <div key={t.id}
                      className="flex items-start gap-3 py-3 border-b border-[var(--border)] last:border-0">
                      {/* 매수/매도 */}
                      <span className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 mt-0.5 ${
                        t.side === 'buy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {t.side === 'buy' ? '매수' : '매도'}
                      </span>

                      {/* 종목명 + 메모 */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text)] truncate">{t.name}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{fmtTs(t.ts)}</p>
                        {t.memo && (
                          <p className="text-xs text-sky-400/80 mt-0.5 italic">💬 {t.memo}</p>
                        )}
                      </div>

                      {/* 체결 정보 */}
                      <div className="text-right text-xs text-[var(--text-muted)] shrink-0">
                        <p className="tabular-nums">
                          {t.qty.toLocaleString('en-US', { maximumFractionDigits: 8 })}주
                        </p>
                        <p className="tabular-nums">{fmtNum(t.price, t.currency)}</p>
                      </div>

                      {/* 총액 */}
                      <p className={`text-sm font-semibold tabular-nums shrink-0 min-w-[90px] text-right ${
                        t.side === 'buy' ? 'text-red-400' : 'text-emerald-400'
                      }`}>
                        {t.side === 'buy' ? '-' : '+'}{fmtNum(t.amount, t.currency)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
