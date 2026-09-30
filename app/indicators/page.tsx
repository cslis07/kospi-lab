'use client';

/** 환율 · 시장지표 — 메뉴(시장 탭) 전체 화면. 본문은 홈(PC)과 공용인 섹션 컴포넌트(components/naver/sections/IndicatorsSection). */
import IndicatorsSection from '@/components/naver/sections/IndicatorsSection';

export default function Page() {
  return (
    <div style={{ paddingBottom: 24 }}>
      <IndicatorsSection />
    </div>
  );
}
