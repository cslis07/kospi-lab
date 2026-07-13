'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useOverseasWatchlist } from '@/hooks/useOverseasWatchlist';
import { useCryptoWatchlist } from '@/hooks/useCryptoWatchlist';

interface BatchQuote { price: number; changeRate: number; name?: string }
interface BitgetAsset { coin: string; amount: number; price: number; usdtValue: number }
interface BitgetResp  { configured?: boolean; totalUsdt?: number; assets?: BitgetAsset[]; error?: string; locked?: boolean }

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const fmtKRW = (n: number) => {
  if (n >= 1e8)  return `${(n / 1e8).toFixed(2)}억원`;
  if (n >= 1e4)  return `${Math.round(n / 1e4).toLocaleString()}만원`;
  return `${Math.round(n).toLocaleString()}원`;
};
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

export default function PortfolioPage() {
  // 보유 + 관심 상태
  const { portfolio }                            = usePortfolio();
  const { watchlist: krWatch,   mounted: krM }   = useWatchlist();
  const { watchlist: usWatch,   mounted: usM }   = useOverseasWatchlist();
  const { watchlist: cryWatch,  mounted: cryM }  = useCryptoWatchlist();

  // 환율
  const { data: market } = useSWR<{ usdkrw?: { value: number } }>('/api/market', fetcher, { refreshInterval: 60000 });
  const usdKrw = market?.usdkrw?.value ?? 1400;

  // 보유 국내주식 현재가 (배치)
  const krCodes = Object.keys(portfolio).join(',');
  const { data: krQuotes } = useSWR<Record<string, BatchQuote>>(
    krCodes ? `/api/stock/batch?tickers=${krCodes}` : null, fetcher, { refreshInterval: 30000 });

  // 비트겟 잔고
  const { data: bitget } = useSWR<BitgetResp>('/api/bitget/account', fetcher, { refreshInterval: 60000 });

  // 보유 종목 룰엔진 판정 — '신호 보기' 버튼으로만 실행 (서버 10분 캐시)
  const [verdictsOn, setVerdictsOn] = useState(false);
  const { data: verdicts, isValidating: verdictsLoading } = useSWR<Record<string, {
    stance: 'buy' | 'neutral' | 'reduce'; score: number; entryOk: boolean;
    price: number; stop: number; supplyMissing: boolean;
  }>>(
    verdictsOn && krCodes ? `/api/portfolio-verdicts?tickers=${krCodes}` : null,
    fetcher, { revalidateOnFocus: false },
  );

  // 보유 국내주식 평가
  const krHoldings = useMemo(() => {
    return Object.entries(portfolio).map(([ticker, e]) => {
      const q = krQuotes?.[ticker];
      const price   = q?.price ?? e.avgPrice;
      const value   = price * e.quantity;
      const cost    = e.avgPrice * e.quantity;
      const pnl     = value - cost;
      const pnlRate = cost > 0 ? (pnl / cost) * 100 : 0;
      return { ticker, name: q?.name ?? ticker, quantity: e.quantity, avgPrice: e.avgPrice, price, value, pnl, pnlRate, hasLive: !!q };
    }).sort((a, b) => b.value - a.value);
  }, [portfolio, krQuotes]);

  const krTotal = krHoldings.reduce((s, h) => s + h.value, 0);
  const krCost  = krHoldings.reduce((s, h) => s + h.avgPrice * h.quantity, 0);
  const krPnl   = krTotal - krCost;
  const krPnlR  = krCost > 0 ? (krPnl / krCost) * 100 : 0;

  // 비트겟 → KRW
  const bgUsd   = bitget?.totalUsdt ?? 0;
  const bgKrw   = bgUsd * usdKrw;
  const bgAssets = bitget?.assets ?? [];

  // 총자산
  const totalKrw = krTotal + bgKrw;

  // 자산군 비중
  const buckets = [
    { label: '국내주식 보유', krw: krTotal,            color: 'bg-sky-500',     accent: 'border-sky-500/40 bg-sky-500/5' },
    { label: '비트겟 코인',   krw: bgKrw,              color: 'bg-amber-500',   accent: 'border-amber-500/40 bg-amber-500/5' },
  ].filter((b) => b.krw > 0);

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <h1 className="text-xl font-bold text-[var(--text)] mb-1">통합 자산</h1>
      <p className="text-sm text-[var(--text-muted)] mb-5">
        국내주식 포트폴리오 + 비트겟 코인 잔고를 KRW로 환산해 한 화면에 보여줍니다 · USD/KRW {Math.round(usdKrw).toLocaleString()}원
      </p>

      {/* 총자산 + 자산군 비중 */}
      <div className="rounded-2xl border-2 border-sky-500/40 bg-sky-500/5 p-5 mb-4">
        <p className="text-xs text-[var(--text-muted)] mb-1">총 자산 (KRW 환산)</p>
        <p className="text-3xl font-bold text-sky-400 tabular-nums">{fmtKRW(totalKrw)}</p>

        {totalKrw > 0 && (
          <>
            <div className="flex h-2 rounded-full overflow-hidden mt-4 bg-white/5">
              {buckets.map((b) => (
                <div key={b.label} className={b.color} style={{ width: `${(b.krw / totalKrw) * 100}%` }} />
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-xs">
              {buckets.map((b) => (
                <div key={b.label} className={`rounded-lg border p-2 ${b.accent}`}>
                  <p className="text-[10px] text-[var(--text-muted)]">{b.label}</p>
                  <p className="font-bold text-[var(--text)] tabular-nums">{fmtKRW(b.krw)}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{((b.krw / totalKrw) * 100).toFixed(1)}%</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 국내주식 보유 */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--text)]">국내주식 보유</h2>
          <div className="flex items-center gap-2.5">
            {krHoldings.length > 0 && (
              <button onClick={() => setVerdictsOn(true)} disabled={verdictsLoading}
                className="px-2.5 py-1 rounded-lg border border-[var(--border)] text-[10px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50"
                title="보유 종목의 룰엔진 판정(매수우위/중립/비중축소)을 확인 — 일봉+수급 기반, 10분 캐시">
                {verdictsLoading ? '판정 중…' : '📊 신호 보기'}
              </button>
            )}
            {krHoldings.length > 0 && (
              <span className={`text-xs font-semibold ${krPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {krPnl >= 0 ? '+' : ''}{fmtKRW(krPnl)} ({fmtPct(krPnlR)})
              </span>
            )}
          </div>
        </div>

        {krHoldings.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] py-4 text-center">
            보유 종목이 없습니다 · 종목 상세에서 보유 수량·평균 매입가를 입력하세요
          </p>
        ) : (
          <div className="space-y-2">
            {krHoldings.map((h) => (
              <Link key={h.ticker} href={`/stock/${h.ticker}`}
                className="block rounded-xl bg-white/3 hover:bg-white/5 px-3 py-2.5 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)] flex items-center gap-1.5">
                      {h.name}
                      {verdicts?.[h.ticker] && (() => {
                        const vd = verdicts[h.ticker];
                        const style = vd.stance === 'buy'
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                          : vd.stance === 'reduce'
                            ? 'bg-red-500/15 text-red-400 border-red-500/40'
                            : 'bg-white/5 text-[var(--text-muted)] border-[var(--border)]';
                        const label = vd.stance === 'buy' ? '매수우위' : vd.stance === 'reduce' ? '비중축소' : '중립';
                        return (
                          <span className={`px-1.5 py-0.5 rounded-md border text-[9px] font-bold ${style}`}
                            title={`룰엔진 점수 ${vd.score > 0 ? '+' : ''}${vd.score}${vd.supplyMissing ? ' · 수급 데이터 없음' : ''}`}>
                            {label} {vd.score > 0 ? '+' : ''}{vd.score}
                          </span>
                        );
                      })()}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                      {h.quantity.toLocaleString()}주 · 평단 {h.avgPrice.toLocaleString()}원
                      {!h.hasLive && ' · 시세 미수신'}
                      {verdicts?.[h.ticker] && verdicts[h.ticker].price <= verdicts[h.ticker].stop * 1.02 && (
                        <span className="text-amber-400 font-semibold"> · ⚠ 손절 참고선({verdicts[h.ticker].stop.toLocaleString()}원) 부근</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-[var(--text)]">{fmtKRW(h.value)}</p>
                    <p className={`text-[10px] font-semibold ${h.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {h.pnl >= 0 ? '+' : ''}{fmtKRW(h.pnl)} ({fmtPct(h.pnlRate)})
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 비트겟 코인 */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--text)]">비트겟 코인 잔고</h2>
          {bitget?.configured && bgAssets.length > 0 && (
            <Link href="/bitget" className="text-[10px] text-sky-400 hover:underline">자세히 →</Link>
          )}
        </div>

        {!bitget && <div className="h-12 rounded-lg bg-white/5 animate-pulse" />}
        {bitget?.locked && (
          <p className="text-xs text-sky-400 py-3 text-center">
            🔒 계좌 잔고가 잠겨 있습니다 · <Link href="/bitget" className="hover:underline font-semibold">인증하기 →</Link>
          </p>
        )}
        {!bitget?.locked && bitget?.configured === false && (
          <p className="text-xs text-[var(--text-muted)] py-3 text-center">
            Bitget API 키가 설정되지 않음 · <Link href="/bitget" className="text-sky-400 hover:underline">설정 안내 보기</Link>
          </p>
        )}
        {!bitget?.locked && bitget?.error && (
          <p className="text-xs text-red-400 py-2">조회 실패: {bitget.error}</p>
        )}
        {bitget?.configured && !bitget.error && bgAssets.length === 0 && (
          <p className="text-xs text-[var(--text-muted)] py-3 text-center">보유 코인이 없습니다</p>
        )}
        {bgAssets.length > 0 && (
          <div className="space-y-1.5">
            {bgAssets.slice(0, 8).map((a) => (
              <div key={a.coin} className="flex items-center justify-between text-xs rounded-lg bg-white/3 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[var(--text)]">{a.coin}</span>
                  <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                    {a.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })}
                  </span>
                </div>
                <div className="text-right tabular-nums">
                  <p className="text-[var(--text)]">{fmtKRW(a.usdtValue * usdKrw)}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">${a.usdtValue.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 관심종목 요약 */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text)] mb-3">관심종목 요약</h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Link href="/my-stocks" className="rounded-xl bg-white/3 hover:bg-sky-500/10 p-3 transition-colors">
            <p className="text-[10px] text-[var(--text-muted)]">국내</p>
            <p className="text-lg font-bold text-[var(--text)] tabular-nums">{krM ? krWatch.length : '-'}</p>
            <p className="text-[10px] text-sky-400">종목 →</p>
          </Link>
          <Link href="/my-stocks?market=overseas" className="rounded-xl bg-white/3 hover:bg-sky-500/10 p-3 transition-colors">
            <p className="text-[10px] text-[var(--text-muted)]">해외</p>
            <p className="text-lg font-bold text-[var(--text)] tabular-nums">{usM ? usWatch.length : '-'}</p>
            <p className="text-[10px] text-sky-400">종목 →</p>
          </Link>
          <Link href="/my-stocks?market=crypto" className="rounded-xl bg-white/3 hover:bg-sky-500/10 p-3 transition-colors">
            <p className="text-[10px] text-[var(--text-muted)]">코인</p>
            <p className="text-lg font-bold text-[var(--text)] tabular-nums">{cryM ? cryWatch.length : '-'}</p>
            <p className="text-[10px] text-sky-400">종목 →</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
