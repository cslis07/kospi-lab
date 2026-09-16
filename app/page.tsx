'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import MarketHero from '@/components/MarketHero';
import CoinDashboard from '@/components/CoinDashboard';
import { MENU, ICON, type MenuItem } from '@/lib/menu';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useOverseasWatchlist } from '@/hooks/useOverseasWatchlist';
import { useCryptoWatchlist } from '@/hooks/useCryptoWatchlist';

/* ── 빠른 이동 카드 (lib/menu 단일 소스 · SVG 아이콘) ───────── */
function MenuCard({ item, color }: { item: MenuItem; color: string }) {
  const inner = (
    <>
      <span className={`w-9 h-9 rounded-xl grid place-items-center mb-2 bg-[var(--surface-2)] ${color}`}>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d={ICON[item.icon]} /></svg>
      </span>
      <p className="text-sm font-semibold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">{item.label}</p>
      {item.desc && <p className="text-xs text-[var(--text-muted)] mt-0.5">{item.desc}</p>}
    </>
  );
  const cls = 'surface hover-lift block p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] group';
  return item.external ? <a href={item.href} className={cls}>{inner}</a> : <Link href={item.href} className={cls}>{inner}</Link>;
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
      className="surface hover-lift flex items-center justify-between p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] group"
    >
      <div>
        <p className="text-sm font-semibold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
          ⭐ 내 관심종목
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          {total > 0 ? `총 ${total}개 종목 등록됨` : '종목을 추가해 보세요'}
          {mounted && watchlist.length > 0 && ` · 국내 ${watchlist.length}`}
          {om && overseas.length > 0 && ` · 해외 ${overseas.length}`}
          {cm && cryptos.length > 0 && ` · 코인 ${cryptos.length}`}
        </p>
      </div>
      <svg className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors"
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
    <div className="space-y-8">
      {/* ── 주식 ── 지수 4종 (코스피·코스닥·코스피200·나스닥) */}
      <section>
        <div className="flex items-baseline gap-2 mb-3">
          <h2 className="eyebrow text-base font-bold text-[var(--text)]">주식</h2>
          <span className="text-xs text-[var(--text-muted)]">주요 지수</span>
          <Link href="/krx" className="text-xs text-[var(--accent)] hover:underline ml-auto">KRX 시장 →</Link>
        </div>
        <MarketHero />
      </section>

      {/* ── 코인 ── 시장환경 + 현물 ETF (첨부 이미지 구성) */}
      <section>
        <div className="flex items-baseline gap-2 mb-3">
          <h2 className="eyebrow text-base font-bold text-[var(--text)]">코인</h2>
          <span className="text-xs text-[var(--text-muted)]">거시 환경 · 기관 수급</span>
          <Link href="/coin-analysis" className="text-xs text-[var(--accent)] hover:underline ml-auto">코인선물 분석 →</Link>
        </div>
        <CoinDashboard />
      </section>

      {/* 관심종목 바로가기 — 전체 메뉴는 상단 '메뉴' 버튼(NavTabs) 팝업으로 이동 */}
      <WatchlistSummary />

      {/* 이 앱은 진입 신호를 주는 도구가 아니다 — 대규모 백테스트에서 엣지가 확인되지 않았고(승률 49.7%),
          실제 가치는 손절 강제·사이징·기록에 있다. 첫 화면에서 그 성격을 분명히 한다(모바일·데스크탑 모두 노출). */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
        <p className="text-xs font-semibold text-[var(--text)] mb-1">이 도구의 역할</p>
        <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
          <strong className="text-[var(--text)]">방향 판단은 사용자 몫</strong>이고, 앱은
          <strong className="text-[var(--text)]"> 손절·사이징·청산가·기록</strong>을 맡습니다.
          룰 엔진 점수는 체크리스트일 뿐 매수·매도 신호가 아닙니다 —
          자체 대규모 측정에서 <strong className="text-[var(--text)]">코인·주식 엔진 모두 예측 우위가 확인되지 않았습니다</strong>
          (코인 727건 49.7%·81건 41.7% / 주식 362건 54.1%인데 <strong className="text-[var(--text)]">진입 판정을 뺀 대조군이 54.8%로 더 높음</strong> — 상승장 베타).
        </p>
      </div>

      {/* 카테고리별 바로가기 — lib/menu 단일 소스(4그룹). 모바일은 상단 메뉴 팝업이 대신하므로 데스크탑만 */}
      <div className="hidden md:block space-y-8">
        {MENU.map((g) => (
          <Section key={g.key} title={g.label}>
            {g.items.map((it) => <MenuCard key={it.href} item={it} color={g.color} />)}
          </Section>
        ))}
      </div>
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
