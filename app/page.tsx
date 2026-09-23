'use client';

/**
 * 홈 — 시장 요약 · 관심종목 · 오늘의 리스크 · 주요 이벤트 (IA 2026-09-18).
 * 모바일: 인사 → 코스피 히어로 → 주요 지표 스트립 → 관심종목 → 오늘의 리스크 → 주요 이벤트.
 * 데스크탑: 지수 히어로 → 3열(관심·리스크·이벤트) → 코인 시장환경. 섹션 이동은 헤더 우측 '전체메뉴' 팝업.
 * 상승/하락 TOP 은 시장 › 국내로, 코인 시장환경·ETF 전체는 시장 › 코인으로 옮겼다.
 */
import { Suspense } from 'react';
import Link from 'next/link';
import MarketHero from '@/components/MarketHero';
import CoinDashboard from '@/components/CoinDashboard';
import HeroIndex from '@/components/fin/HeroIndex';
import Greeting from '@/components/fin/Greeting';
import MarketStrip from '@/components/home/MarketStrip';
import WatchlistPreview from '@/components/home/WatchlistPreview';
import TodayRisk from '@/components/home/TodayRisk';
import EventList from '@/components/home/EventList';
import EventCalendar from '@/components/home/EventCalendar';
import { ICON } from '@/lib/menu';

const ROLE_TEXT = (
  <>
    <strong className="text-[var(--text)]">방향 판단은 사용자 몫</strong>이고, 앱은 <strong className="text-[var(--text)]">손절·사이징·청산가·기록</strong>을 맡습니다.
    룰 엔진 점수는 체크리스트일 뿐 매수·매도 신호가 아닙니다 — 자체 대규모 측정에서 <strong className="text-[var(--text)]">코인·주식 엔진 모두 예측 우위가 확인되지 않았습니다</strong>
    (코인 727건 49.7%·81건 41.7% / 주식 362건 54.1%인데 <strong className="text-[var(--text)]">진입 판정을 뺀 대조군이 54.8%로 더 높음</strong> — 상승장 베타).
  </>
);

function DashboardInner() {
  return (
    <div className="space-y-7 md:space-y-8">
      {/* ── 시장 요약 (모바일) ── */}
      <div className="md:hidden space-y-6">
        <div>
          <Greeting />
          <HeroIndex />
        </div>
        <MarketStrip />
      </div>

      {/* ── 시장 요약 (데스크탑) ── */}
      <section className="hidden md:block">
        <div className="flex items-baseline gap-2 mb-3">
          <h2 className="eyebrow text-base font-bold text-[var(--text)]">시장 요약</h2>
          <span className="text-xs text-[var(--text-muted)]">주요 지수</span>
          <Link href="/domestic" className="text-xs text-[var(--accent)] hover:underline ml-auto">국내 시장 →</Link>
        </div>
        <MarketHero />
      </section>

      {/* ── 관심종목 · 오늘의 리스크 · 주요 이벤트 ──
           주요 이벤트: 모바일=리스트(EventList) 그대로, 데스크탑(PC)=풀폭 월간 캘린더(EventCalendar) */}
      <div className="grid gap-7 md:gap-6 md:grid-cols-2 items-start">
        <WatchlistPreview />
        <TodayRisk />
        <div className="md:col-span-2">
          <div className="md:hidden"><EventList /></div>
          <EventCalendar />
        </div>
      </div>

      {/* ── 매매 대원칙 바로가기 ── */}
      <Link href="/principles" className="block rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 hover-lift group">
        <div className="flex items-center gap-3">
          <span className="shrink-0 w-10 h-10 rounded-xl grid place-items-center bg-[var(--surface-2)] text-[var(--accent)]">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d={ICON.principles} /></svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">매매 대원칙</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">잃을 돈 먼저 정하기 · 번 돈 빼기 · 잃어도 하던 대로 — 지킬 3·피할 3</p>
          </div>
          <svg className="w-4 h-4 shrink-0 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </div>
      </Link>

      {/* ── 코인 거시 환경 (데스크탑 — 모바일은 시장 › 코인) ── */}
      <section className="hidden md:block">
        <div className="flex items-baseline gap-2 mb-3">
          <h2 className="eyebrow text-base font-bold text-[var(--text)]">코인 · 거시 환경</h2>
          <span className="text-xs text-[var(--text-muted)]">금리 · 유가 · 심리 · ETF 수급</span>
          <Link href="/coins" className="text-xs text-[var(--accent)] hover:underline ml-auto">코인 시장 →</Link>
        </div>
        <CoinDashboard />
      </section>

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

      {/* 섹션 바로가기 카드는 제거 — 데스크탑은 헤더 우측 '전체메뉴' 팝업, 모바일은 하단 탭·전체 메뉴 시트가 대신 */}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="space-y-4">
        <div className="skeleton h-56 rounded-3xl" />
        <div className="skeleton h-40" />
      </div>
    }>
      <DashboardInner />
    </Suspense>
  );
}
