'use client';

/**
 * 홈 — 네이버 금융 스타일(모바일·데스크탑 공통, 2026-09-30 사용자 지시로 데스크탑도 교체).
 * 지수 레일 → 2단(메인: 큰 차트[접기]·시장현황·52주·투자자 수급·AI 브리핑·주요 뉴스[접기] / 사이드: 최근 소식·인기·관심).
 * 모바일(<1024px)만 큰 차트·주요 뉴스가 스프링 아코디언으로 접힘, 데스크탑은 항상 펼침.
 * '이 도구의 역할' 상자는 2026-10-29 홈에서 뺐다(같은 고지가 사이트 하단 푸터에 있음).
 */
import { Suspense } from 'react';
import NaverHome from '@/components/home/naver/NaverHome';
import PcMarketSections from '@/components/home/naver/PcMarketSections';
import MyReviewLine from '@/components/home/MyReviewLine';
import MyStatusLine from '@/components/home/MyStatusLine';
import HomeKpis from '@/components/home/HomeKpis';
import DesktopOnly from '@/components/home/DesktopOnly';
import MobileMarketLinks from '@/components/home/MobileMarketLinks';

function DashboardInner() {
  return (
    <>
      {/* 지금 내 상태 — 가드·포지션 손절·냉각(잠금 해제 기기만) */}
      <MyStatusLine />
      {/* 내 매매 KPI 타일 4개 + 바로가기(PC는 타일 옆 2×2) — 잠금 안 된 기기는 바로가기 줄만 */}
      <HomeKpis />
      <MyReviewLine />
      <NaverHome />
      {/* 데스크탑 — 실시간 랭킹·산업 트렌드·리서치·테마 ETF(섹션별 지연 마운트). 모바일은 시장 탭에서 */}
      <DesktopOnly><PcMarketSections /></DesktopOnly>
      {/* 모바일 — 데스크탑에만 남긴 시장 섹션으로 가는 길(2026-10-26 메뉴 2단계: 홈 7화면 → 매매자 기준) */}
      <MobileMarketLinks />
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
