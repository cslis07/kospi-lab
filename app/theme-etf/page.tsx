'use client';

/** 주목할 만한 테마 ETF — 메뉴(시장 탭) 전체 화면. 본문은 홈(PC)과 공용인 섹션 컴포넌트(components/naver/sections/ThemeEtfSection). */
import ThemeEtfSection from '@/components/naver/sections/ThemeEtfSection';

export default function Page() {
  return (
    <div style={{ paddingBottom: 24 }}>
      <ThemeEtfSection />
    </div>
  );
}
