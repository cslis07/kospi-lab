'use client';

/**
 * 홈 — KOSPI LAB 2.0 Market Command Center(기획서 §5.1). 12열 Bento:
 *   지금 내 상태(가드 경보) · Quick Actions → 오늘의 시장(지수 6개) → 대표 시장 차트 8 + AI 마켓 브리핑 4
 *   → 시장 폭 4 · 관심종목 4 · 리스크 센터 4 → 발견 탭(랭킹·뉴스·산업·ETF·리서치, 5행 + 전체보기) → 고지 요약.
 * 상세 콘텐츠는 각 전문 페이지로(정보 삭제가 아니라 표시 우선순위 조정). 폰 1열 · 600~1023 2열 · PC 12열.
 * 화면 아래쪽 카드는 다가올 때 마운트(LazyMount) — 첫 로드 API 수를 늘리지 않는다.
 */
import { Suspense } from 'react';
import Link from 'next/link';
import MyStatusLine from '@/components/home/MyStatusLine';
import MyReviewLine from '@/components/home/MyReviewLine';
import QuickChips from '@/components/home/QuickChips';
import IndexRail from '@/components/home/naver/IndexRail';
import IndexBoard from '@/components/home/naver/IndexBoard';
import HomeBriefing from '@/components/home/naver/HomeBriefing';
import { StockTabs } from '@/components/home/naver/HomeSidebar';
import MarketBreadth from '@/components/home/MarketBreadth';
import RiskCenter from '@/components/home/RiskCenter';
import DiscoveryTabs from '@/components/home/DiscoveryTabs';
import LazyMount from '@/components/home/LazyMount';

function DashboardInner() {
  return (
    <div className="space-y-5">
      {/* 지금 내 상태 — 가드·포지션 손절·냉각(잠금 해제 기기만) */}
      <MyStatusLine />
      <MyReviewLine />
      <QuickChips />
      <IndexRail />
      <div className="bento">
        <div className="b-8"><IndexBoard breadth={false} /></div>
        <div className="b-4"><HomeBriefing /></div>
        <div className="b-4 t-6"><LazyMount minHeight={230}><MarketBreadth /></LazyMount></div>
        <div className="b-4 t-6"><LazyMount minHeight={300}><StockTabs initial="watch" limit={6} /></LazyMount></div>
        <div className="b-4"><RiskCenter /></div>
        <div className="b-12"><LazyMount minHeight={360}><DiscoveryTabs /></LazyMount></div>
      </div>
      {/* 고지 요약 — 상세 측정 결과·투자 위험은 사이트 하단 푸터 */}
      <p className="text-[11.5px] text-[var(--text-muted)] leading-relaxed">
        모든 수치·AI 요약은 참고 정보이며 매수·매도 신호가 아닙니다. 자체 측정에서 예측 우위는 확인되지 않았습니다.{' '}
        <Link href="/principles" className="text-[var(--accent-ink)] font-semibold">매매 대원칙</Link>
      </p>
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
