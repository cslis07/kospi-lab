'use client';

/** 실시간 랭킹 — 메뉴(시장 탭) 전체 화면. 본문은 홈(PC)과 공용인 섹션 컴포넌트(components/naver/sections/RankingSection). */
import RankingSection from '@/components/naver/sections/RankingSection';

export default function Page() {
  return (
    <div style={{ paddingBottom: 24 }}>
      <RankingSection />
    </div>
  );
}
