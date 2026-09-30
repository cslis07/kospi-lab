'use client';

/** 리서치(애널리스트 산업·목표주가) — 메뉴(시장 탭) 전체 화면. 본문은 홈(PC)과 공용인 섹션 컴포넌트(components/naver/sections/ResearchSection). */
import ResearchSection from '@/components/naver/sections/ResearchSection';

export default function Page() {
  return (
    <div style={{ paddingBottom: 24 }}>
      <ResearchSection />
    </div>
  );
}
