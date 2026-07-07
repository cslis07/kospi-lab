'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import KospiBar from '@/components/KospiBar';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useOverseasWatchlist } from '@/hooks/useOverseasWatchlist';
import { useCryptoWatchlist } from '@/hooks/useCryptoWatchlist';

/* ── 빠른 이동 카드 ─────────────────────────────────────── */
function QuickCard({
  href, emoji, title, desc, accent,
}: {
  href: string;
  emoji: string;
  title: string;
  desc: string;
  accent?: string;
}) {
  return (
    <Link
      href={href}
      className={`block p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-white/20 transition-all group ${accent ?? ''}`}
    >
      <div className="text-2xl mb-2">{emoji}</div>
      <p className="text-sm font-semibold text-[var(--text)] group-hover:text-white transition-colors">{title}</p>
      <p className="text-xs text-[var(--text-muted)] mt-0.5">{desc}</p>
    </Link>
  );
}

/* ── 관심종목 요약 카드 ─────────────────────────────────── */
function WatchlistSummary() {
  const { watchlist, mounted }                 = useWatchlist();
  const { watchlist: overseas, mounted: om }   = useOverseasWatchlist();
  const { watchlist: cryptos, mounted: cm }    = useCryptoWatchlist();

  const total = (mounted ? watchlist.length : 0)
              + (om ? overseas.length : 0)
              + (cm ? cryptos.length : 0);

  return (
    <Link
      href="/my-stocks"
      className="flex items-center justify-between p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-sky-500/40 hover:bg-sky-500/5 transition-all group"
    >
      <div>
        <p className="text-sm font-semibold text-[var(--text)] group-hover:text-sky-400 transition-colors">
          ⭐ 내 관심종목
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          {total > 0 ? `총 ${total}개 종목 등록됨` : '종목을 추가해 보세요'}
          {mounted && watchlist.length > 0 && ` · 국내 ${watchlist.length}`}
          {om && overseas.length > 0 && ` · 해외 ${overseas.length}`}
          {cm && cryptos.length > 0 && ` · 코인 ${cryptos.length}`}
        </p>
      </div>
      <svg className="w-5 h-5 text-[var(--text-muted)] group-hover:text-sky-400 transition-colors"
        fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

/* ── 카테고리 섹션 래퍼 ─────────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wide">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{children}</div>
    </div>
  );
}

/* ── 대시보드 내부 ──────────────────────────────────────── */
function DashboardInner() {
  return (
    <div className="space-y-6">
      {/* 시장 지수 바 */}
      <KospiBar />

      {/* 관심종목 바로가기 */}
      <WatchlistSummary />

      {/* 카테고리별 바로가기 — NavTabs 그룹과 동일 구조 */}
      <Section title="📈 시장">
        <QuickCard href="/domestic"               emoji="🇰🇷" title="국내주식" desc="KOSPI·KOSDAQ" />
        <QuickCard href="/overseas"               emoji="🌐" title="해외주식" desc="US 등 글로벌" />
        <QuickCard href="/my-stocks?market=crypto" emoji="₿"  title="코인"     desc="실시간 시세" />
        <QuickCard href="/futures"                emoji="⚡" title="선물"     desc="USDT 무기한" />
      </Section>

      <Section title="💼 내 자산">
        <QuickCard href="/portfolio" emoji="💰" title="통합 자산"         desc="국내·해외·코인 합산" />
        <QuickCard href="/my-stocks" emoji="⭐" title="내 주식"           desc="관심·포트폴리오" />
        <QuickCard href="/bitget"    emoji="🪙" title="비트겟 포트폴리오" desc="내 코인 잔고" />
      </Section>

      <Section title="📊 분석">
        <QuickCard href="/screener" emoji="🔍" title="버핏 스크리너" desc="ROE·PER 7기준" />
        <QuickCard href="/krx"      emoji="🏅" title="KRX 랭킹"     desc="전종목 등락·거래 순위" />
        <QuickCard href="/news"     emoji="📰" title="뉴스"          desc="시장 소식" />
        <QuickCard href="/dart"     emoji="📋" title="공시"          desc="DART 전자공시" />
        <QuickCard href="/report"   emoji="📊" title="리포트"        desc="증권사 리포트" />
        <QuickCard href="/calendar" emoji="📅" title="캘린더"        desc="경제 이벤트" />
      </Section>

      <Section title="🎯 설계">
        <QuickCard href="/invest"    emoji="🧭" title="투자설계"   desc="계좌·자산 추천" />
        <QuickCard href="/tax"       emoji="💸" title="세제혜택"   desc="ISA·IRP·연금 절세" />
        <QuickCard href="/simulate"  emoji="📈" title="시뮬레이션" desc="복리 FV 계산" />
        <QuickCard href="/brokerage" emoji="🏦" title="증권사 비교" desc="수수료·CMA" />
      </Section>
    </div>
  );
}

/* ── export ──────────────────────────────────────────────── */
export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="space-y-4">
        <div className="h-20 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] animate-pulse" />
          ))}
        </div>
      </div>
    }>
      <DashboardInner />
    </Suspense>
  );
}
