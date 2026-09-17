'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import MarketHero from '@/components/MarketHero';
import CoinDashboard from '@/components/CoinDashboard';
import HeroIndex from '@/components/fin/HeroIndex';
import RankList from '@/components/fin/RankList';
import MarketBanner from '@/components/fin/MarketBanner';
import Greeting from '@/components/fin/Greeting';
import { FinIcon } from '@/components/fin/icons';
import { MENU, ICON, DEFAULT_QUICK, BY_HREF, type MenuItem } from '@/lib/menu';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useOverseasWatchlist } from '@/hooks/useOverseasWatchlist';
import { useCryptoWatchlist } from '@/hooks/useCryptoWatchlist';

/* ── 빠른 이동 카드 (데스크탑 · lib/menu 단일 소스 · SVG 아이콘) ───────── */
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

/* ── 관심종목 요약 ─────────────────────────────────── */
function WatchlistSummary() {
  const { watchlist, mounted }               = useWatchlist();
  const { watchlist: overseas, mounted: om } = useOverseasWatchlist();
  const { watchlist: cryptos, mounted: cm }  = useCryptoWatchlist();

  const total = (mounted ? watchlist.length : 0) + (om ? overseas.length : 0) + (cm ? cryptos.length : 0);
  const parts = [
    mounted && watchlist.length > 0 ? `국내 ${watchlist.length}` : null,
    om && overseas.length > 0 ? `해외 ${overseas.length}` : null,
    cm && cryptos.length > 0 ? `코인 ${cryptos.length}` : null,
  ].filter(Boolean);
  const sub = total > 0 ? `총 ${total}개 · ${parts.join(' · ')}` : '종목을 추가해 보세요';

  return (
    <>
      {/* 모바일: 핀테크 리스트 행 */}
      <Link href="/my-stocks" className="fin-card fin-row md:hidden">
        <span className="fin-badge tint-amber"><FinIcon name="star" /></span>
        <div className="min-w-0 flex-1">
          <div className="nm">내 관심종목</div>
          <div className="sb truncate">{sub}</div>
        </div>
        <FinIcon name="chevron" className="w-4 h-4 text-[var(--faint)] shrink-0" />
      </Link>

      {/* 데스크탑: 기존 */}
      <Link href="/my-stocks"
        className="surface hover-lift hidden md:flex items-center justify-between p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] group">
        <div>
          <p className="text-sm font-semibold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">⭐ 내 관심종목</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{sub}</p>
        </div>
        <svg className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </>
  );
}

/* ── 데스크탑 카테고리 섹션 래퍼 ─────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wide">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{children}</div>
    </div>
  );
}

const ROLE_TEXT = (
  <>
    <strong className="text-[var(--text)]">방향 판단은 사용자 몫</strong>이고, 앱은 <strong className="text-[var(--text)]">손절·사이징·청산가·기록</strong>을 맡습니다.
    룰 엔진 점수는 체크리스트일 뿐 매수·매도 신호가 아닙니다 — 자체 대규모 측정에서 <strong className="text-[var(--text)]">코인·주식 엔진 모두 예측 우위가 확인되지 않았습니다</strong>
    (코인 727건 49.7%·81건 41.7% / 주식 362건 54.1%인데 <strong className="text-[var(--text)]">진입 판정을 뺀 대조군이 54.8%로 더 높음</strong> — 상승장 베타).
  </>
);

/* ── 대시보드 ──────────────────────────────────────── */
function DashboardInner() {
  const quick = DEFAULT_QUICK.map((h) => BY_HREF.get(h)!).filter(Boolean);

  return (
    <div className="space-y-6 md:space-y-8">
      {/* ── 모바일 상단: 인사 → 히어로 → 퀵액션 → 배너 → 상승/하락 TOP ── */}
      <div className="md:hidden space-y-6">
        <div>
          <Greeting />
          <HeroIndex />
        </div>

        <div className="hm-quick">
          {quick.map((q) => (
            <Link key={q.href} href={q.href} className="surface">
              <span className={`qi ${q.qc}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICON[q.icon]} /></svg>
              </span>
              <span className="qt">{q.label}</span>
            </Link>
          ))}
        </div>

        <MarketBanner />
        <RankList kind="gainers" />
        <RankList kind="losers" />
      </div>

      {/* ── 데스크탑: 주식 지수 ── */}
      <section className="hidden md:block">
        <div className="flex items-baseline gap-2 mb-3">
          <h2 className="eyebrow text-base font-bold text-[var(--text)]">주식</h2>
          <span className="text-xs text-[var(--text-muted)]">주요 지수</span>
          <Link href="/krx" className="text-xs text-[var(--accent)] hover:underline ml-auto">KRX 시장 →</Link>
        </div>
        <MarketHero />
      </section>

      {/* ── 코인 시장환경 + 현물 ETF (공용 · 내부 반응형) ── */}
      <section>
        <div className="hidden md:flex items-baseline gap-2 mb-3">
          <h2 className="eyebrow text-base font-bold text-[var(--text)]">코인</h2>
          <span className="text-xs text-[var(--text-muted)]">거시 환경 · 기관 수급</span>
          <Link href="/coin-analysis" className="text-xs text-[var(--accent)] hover:underline ml-auto">코인선물 분석 →</Link>
        </div>
        <CoinDashboard />
      </section>

      <WatchlistSummary />

      {/* 이 앱은 진입 신호를 주는 도구가 아니다 — 모바일은 한 줄+접기, 데스크탑은 전문 */}
      <details className="md:hidden fin-card px-4 py-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
        <summary className="cursor-pointer list-none flex items-center gap-2">
          <span className="text-xs font-bold text-[var(--text)]">이 도구의 역할</span>
          <span className="truncate">매매 신호 아님 · 손절·사이징·기록 도구</span>
          <span className="ml-auto shrink-0 text-[var(--accent)] font-semibold">자세히</span>
        </summary>
        <p className="mt-2">{ROLE_TEXT}</p>
      </details>
      <div className="hidden md:block rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
        <p className="text-xs font-semibold text-[var(--text)] mb-1">이 도구의 역할</p>
        <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">{ROLE_TEXT}</p>
      </div>

      {/* 데스크탑 카테고리 바로가기 — 모바일은 하단 탭·더보기가 대신 */}
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

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="space-y-4">
        <div className="skeleton h-56 rounded-3xl" />
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-20" />)}
        </div>
      </div>
    }>
      <DashboardInner />
    </Suspense>
  );
}
