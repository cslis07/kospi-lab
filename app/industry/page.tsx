'use client';

/** 산업 트렌드 — 메뉴(시장 탭) 전체 화면. 본문은 홈(PC)과 공용인 섹션 컴포넌트(components/naver/sections/IndustrySection). */
import IndustrySection from '@/components/naver/sections/IndustrySection';

export default function Page() {
  return (
    <div style={{ paddingBottom: 24 }}>
      <IndustrySection />
    </div>
  );
}
