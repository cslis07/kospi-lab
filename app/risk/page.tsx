'use client';

/**
 * 통합 리스크 — 계좌 전체 관점.
 *
 * 이 앱의 다른 화면은 전부 "이 매매 하나"를 본다. 계좌를 터뜨리는 건 매매 하나가 아니라
 * 동시에 다 틀리는 것이므로, 여기서는 종목을 합쳐서 본다.
 * 집계는 lib/riskDashboard.ts 순수 함수(테스트로 고정)에 있고 이 파일은 표시만 한다.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useCoinJournal } from '@/hooks/useCoinJournal';
import { usePortfolio } from '@/hooks/usePortfolio';
import { aggregateRisk, type FuturesPositionLike, type RiskSummary } from '@/lib/riskDashboard';

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const won = (v: number) => {
  if (!Number.isFinite(v)) return '-';
  const a = Math.abs(v);
  if (a >= 1e8) return `${(v / 1e8).toFixed(2)}억`;
  if (a >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만`;
  return Math.round(v).toLocaleString();
};

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' | 'bad' }) {
  const c = tone === 'bad' ? 'text-red-400' : tone === 'warn' ? 'text-amber-400' : tone === 'good' ? 'text-emerald-400' : 'text-[var(--text)]';
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <p className="text-[11px] text-[var(--text-muted)] mb-1">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${c}`}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-relaxed">{sub}</p>}
    </div>
  );
}

function Bar({ long, short }: { long: number; short: number }) {
  const t = long + short;
  if (t <= 0) return null;
  const lp = (long / t) * 100;
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-emerald-400 font-semibold">롱 {lp.toFixed(0)}%</span>
        <span className="text-red-400 font-semibold">숏 {(100 - lp).toFixed(0)}%</span>
      </div>
      <div aria-hidden className="flex h-2 rounded-full overflow-hidden bg-white/5">
        <div className="bg-emerald-500/60" style={{ width: `${lp}%` }} />
        <div className="bg-red-500/60" style={{ width: `${100 - lp}%` }} />
      </div>
    </div>
  );
}

export default function RiskPage() {
  const journal = useCoinJournal();
  const { portfolio } = usePortfolio();

  const { data: pos } = useSWR<{ configured?: boolean; error?: string; positions?: FuturesPositionLike[]; account?: { equity: number } | null }>(
    '/api/bitget/positions', fetcher, { refreshInterval: 30000, shouldRetryOnError: false },
  );
  const { data: market } = useSWR<{ usdkrw?: { value: number } }>('/api/market', fetcher, { refreshInterval: 60000 });

  const holdings = useMemo(
    () => Object.entries(portfolio).map(([ticker, e]) => ({
      ticker, quantity: e.quantity, avgPrice: e.avgPrice, price: null, currency: 'KRW' as const,
    })),
    [portfolio],
  );

  const risk: RiskSummary = useMemo(() => aggregateRisk({
    futures: pos?.positions ?? [],
    openPlans: journal.entries,
    holdings,
    futuresEquity: pos?.account?.equity ?? null,
    usdkrw: market?.usdkrw?.value ?? 1400,
  }), [pos, journal.entries, holdings, market]);

  const locked = pos && (pos as { locked?: boolean }).locked;
  const noData = risk.grossExposureKrw === 0 && journal.entries.filter((e) => e.result === 'open').length === 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-12">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-[var(--text)]">통합 리스크 <span className="text-xs font-normal text-[var(--text-muted)]">계좌 전체 관점</span></h1>
        <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
          다른 화면이 <strong className="text-[var(--text)]">이 매매 하나</strong>를 본다면, 여기서는 <strong className="text-[var(--text)]">전부 합쳐서</strong> 봅니다.
          계좌를 터뜨리는 건 종목 하나가 아니라 동시에 다 틀리는 경우입니다. 원화 환산 기준 ₩{Math.round(risk.usdkrw).toLocaleString()}/USD.
        </p>
      </div>

      {locked && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 mb-4 text-xs text-amber-400">
          잠금 상태라 선물 포지션을 읽지 못했습니다 — <Link href="/bitget" className="underline">/bitget</Link>에서 토큰을 1회 입력하면 실제 포지션까지 합산됩니다.
        </div>
      )}
      {pos?.error && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 mb-4 text-xs text-[var(--text-muted)]">
          선물 포지션 조회 실패 — {pos.error.includes('40014') ? 'Bitget 키에 선물 읽기 권한이 없습니다. 아래 수치는 매매일지·보유 기준입니다.' : pos.error}
        </div>
      )}

      {/* 경고 — 숫자에서 자동 유도된 것만 */}
      {risk.warnings.length > 0 && (
        <div className="space-y-2 mb-4">
          {risk.warnings.map((w, i) => (
            <div key={i} className={`rounded-xl border px-4 py-2.5 ${
              w.level === 'high' ? 'border-red-500/40 bg-red-500/[0.07]' : w.level === 'mid' ? 'border-amber-500/30 bg-amber-500/[0.05]' : 'border-[var(--border)] bg-[var(--bg-card)]'
            }`}>
              <p className={`text-xs font-bold ${w.level === 'high' ? 'text-red-400' : w.level === 'mid' ? 'text-amber-400' : 'text-[var(--text)]'}`}>
                {w.level === 'high' ? '🔴' : w.level === 'mid' ? '🟡' : '⚪'} {w.title}
              </p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">{w.detail}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="총 익스포저" value={`${won(risk.grossExposureKrw)}원`}
          sub={`선물 ${won(risk.futuresNotionalKrw)} · 보유 ${won(risk.equityValueKrw)}`} />
        <Stat label="동시 손절 시 손실" value={`-${won(risk.plannedStopLossKrw)}원`}
          tone={risk.plannedStopLossKrw > 0 ? 'bad' : undefined}
          sub={risk.plansWithoutStop > 0 ? `⚠ 손절 미설정 ${risk.plansWithoutStop}건은 미포함` : '열린 계획의 손절이 전부 체결될 경우'} />
        <Stat label="실효 레버리지"
          value={risk.effectiveLeverage != null ? `${risk.effectiveLeverage.toFixed(1)}배` : '-'}
          tone={risk.effectiveLeverage != null && risk.effectiveLeverage > 3 ? 'warn' : undefined}
          sub="자기자본 대비 시장 노출 배수" />
        <Stat label="미실현 손익" value={`${risk.unrealizedKrw >= 0 ? '+' : ''}${won(risk.unrealizedKrw)}원`}
          tone={risk.unrealizedKrw > 0 ? 'good' : risk.unrealizedKrw < 0 ? 'bad' : undefined}
          sub="선물 포지션 평가손익" />
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-4">
        <h3 className="text-sm font-bold text-[var(--text)] mb-3">방향 노출</h3>
        <Bar long={risk.longKrw} short={risk.shortKrw} />
        <p className="text-[11px] text-[var(--text-muted)] mt-2 tabular-nums">
          롱 {won(risk.longKrw)}원 · 숏 {won(risk.shortKrw)}원 · 순방향 {risk.netDirectionKrw >= 0 ? '롱' : '숏'} {won(Math.abs(risk.netDirectionKrw))}원
        </p>
        {risk.topConcentration && (
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            최대 집중: <strong className="text-[var(--text)]">{risk.topConcentration.label}</strong> {risk.topConcentration.pct.toFixed(0)}%
          </p>
        )}
        {risk.nearestLiq && (
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            청산 최근접: <strong className="text-[var(--text)]">{risk.nearestLiq.symbol}</strong> {risk.nearestLiq.distPct.toFixed(1)}%
          </p>
        )}
      </div>

      {noData && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] p-8 text-center">
          <p className="text-2xl mb-2">🛡</p>
          <p className="text-sm font-semibold text-[var(--text)] mb-1">집계할 포지션이 없습니다</p>
          <p className="text-xs text-[var(--text-muted)]">
            <Link href="/coin-analysis" className="text-sky-400 hover:underline">코인선물 분석</Link>에서 판정을 기록하거나,{' '}
            <Link href="/my-stocks" className="text-sky-400 hover:underline">내 주식</Link>에 보유를 입력하면 여기에 합산됩니다.
          </p>
        </div>
      )}

      <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
        ※ 보유 주식은 <strong className="text-[var(--text)]">평단 기준</strong>으로 집계됩니다{risk.unpricedHoldings > 0 ? `(현재가 미조회 ${risk.unpricedHoldings}건)` : ''} — 실시간 평가액과 다를 수 있습니다.
        청산가는 유지증거금 0.5% 가정 근사치이며 거래소 실제값과 다릅니다. 이 화면은 위험을 <strong className="text-[var(--text)]">보여줄 뿐 줄여주지 않습니다</strong>.
      </p>
    </div>
  );
}
