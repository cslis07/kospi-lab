'use client';

/**
 * 홈 — 네이버 금융 스타일(모바일·데스크탑 공통, 2026-09-30 사용자 지시로 데스크탑도 교체).
 * 지수 레일 → 2단(메인: 큰 차트[접기]·시장현황·52주·투자자 수급·AI 브리핑·주요 뉴스[접기] / 사이드: 최근 소식·인기·관심).
 * 모바일(<1024px)만 큰 차트·주요 뉴스가 스프링 아코디언으로 접힘, 데스크탑은 항상 펼침.
 */
import { Suspense } from 'react';
import NaverHome from '@/components/home/naver/NaverHome';
import PcMarketSections from '@/components/home/naver/PcMarketSections';

const ROLE_TEXT = (
  <>
    <strong className="text-[var(--text)]">방향 판단은 사용자 몫</strong>이고, 앱은 <strong className="text-[var(--text)]">손절·사이징·청산가·기록</strong>을 맡습니다.
    룰 엔진 점수는 체크리스트일 뿐 매수·매도 신호가 아닙니다 — 자체 대규모 측정에서 <strong className="text-[var(--text)]">코인·주식 엔진 모두 예측 우위가 확인되지 않았습니다</strong>
    (코인 727건 49.7%·81건 41.7% / 주식 362건 54.1%인데 <strong className="text-[var(--text)]">진입 판정을 뺀 대조군이 54.8%로 더 높음</strong> — 상승장 베타).
  </>
);

function DashboardInner() {
  return (
    <>
      <NaverHome />
      {/* PC(≥1024px) 전용 — 실시간 랭킹·산업 트렌드·리서치·테마 ETF·시장지표를 부제목 기준으로 모두 노출(모바일은 시장 탭 메뉴로) */}
      <PcMarketSections />
      {/* 이 도구의 역할 — 모바일 접기 / 데스크탑 전문 */}
      <details className="md:hidden fin-card px-4 py-3 mt-6 text-[11px] leading-relaxed text-[var(--text-muted)]">
        <summary className="cursor-pointer list-none flex items-center gap-2">
          <span className="text-xs font-bold text-[var(--text)]">이 도구의 역할</span>
          <span className="truncate">매매 신호 아님 · 손절·사이징·기록 도구</span>
          <span className="ml-auto shrink-0 text-[var(--accent)] font-semibold">자세히</span>
        </summary>
        <p className="mt-2">{ROLE_TEXT}</p>
      </details>
      <div className="hidden md:block rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 mt-6">
        <p className="text-xs font-semibold text-[var(--text)] mb-1">이 도구의 역할</p>
        <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">{ROLE_TEXT}</p>
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
