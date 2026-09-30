'use client';

/**
 * 홈 — 분기:
 *  · 모바일(<md): 네이버 금융 스타일 홈(NaverHome) — 지수 레일·큰 차트(접기)·AI 브리핑·주요 뉴스(접기)·최근 소식·인기/관심.
 *  · 데스크탑(md+): 기존 대시보드 유지(시장 요약·관심종목·이벤트 캘린더·코인 거시환경).  ← 사용자 지시(2026-09-30): PC는 현행 유지.
 */
import { Suspense } from 'react';
import Link from 'next/link';
import MarketHero from '@/components/MarketHero';
import CoinDashboard from '@/components/CoinDashboard';
import WatchlistPreview from '@/components/home/WatchlistPreview';
import EventCalendar from '@/components/home/EventCalendar';
import NaverHome from '@/components/home/naver/NaverHome';

const ROLE_TEXT = (
  <>
    <strong className="text-[var(--text)]">방향 판단은 사용자 몫</strong>이고, 앱은 <strong className="text-[var(--text)]">손절·사이징·청산가·기록</strong>을 맡습니다.
    룰 엔진 점수는 체크리스트일 뿐 매수·매도 신호가 아닙니다 — 자체 대규모 측정에서 <strong className="text-[var(--text)]">코인·주식 엔진 모두 예측 우위가 확인되지 않았습니다</strong>
    (코인 727건 49.7%·81건 41.7% / 주식 362건 54.1%인데 <strong className="text-[var(--text)]">진입 판정을 뺀 대조군이 54.8%로 더 높음</strong> — 상승장 베타).
  </>
);

/* ── 데스크탑 대시보드 (기존 유지) ── */
function DesktopDashboard() {
  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-baseline gap-2 mb-3">
          <h2 className="eyebrow text-base font-bold text-[var(--text)]">시장 요약</h2>
          <span className="text-xs text-[var(--text-muted)]">주요 지수</span>
          <Link href="/domestic" className="text-xs text-[var(--accent)] hover:underline ml-auto">국내 시장 →</Link>
        </div>
        <MarketHero />
      </section>

      <WatchlistPreview />
      <EventCalendar />

      <section>
        <div className="flex items-baseline gap-2 mb-3">
          <h2 className="eyebrow text-base font-bold text-[var(--text)]">코인 · 거시 환경</h2>
          <span className="text-xs text-[var(--text-muted)]">금리 · 유가 · 심리 · ETF 수급</span>
          <Link href="/coins" className="text-xs text-[var(--accent)] hover:underline ml-auto">코인 시장 →</Link>
        </div>
        <CoinDashboard />
      </section>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
        <p className="text-xs font-semibold text-[var(--text)] mb-1">이 도구의 역할</p>
        <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">{ROLE_TEXT}</p>
      </div>
    </div>
  );
}

function DashboardInner() {
  return (
    <>
      <div className="md:hidden">
        <NaverHome />
        {/* 이 도구의 역할 — 모바일 한 줄 접기 */}
        <details className="fin-card px-4 py-3 mt-6 text-[11px] leading-relaxed text-[var(--text-muted)]">
          <summary className="cursor-pointer list-none flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--text)]">이 도구의 역할</span>
            <span className="truncate">매매 신호 아님 · 손절·사이징·기록 도구</span>
            <span className="ml-auto shrink-0 text-[var(--accent)] font-semibold">자세히</span>
          </summary>
          <p className="mt-2">{ROLE_TEXT}</p>
        </details>
      </div>
      <div className="hidden md:block">
        <DesktopDashboard />
      </div>
    </>
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
