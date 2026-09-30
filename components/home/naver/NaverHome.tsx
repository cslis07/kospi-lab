'use client';

/**
 * 네이버 금융 스타일 홈(신규) — 미리보기용 조립.
 * 상단 지수 카드 레일 → 2단(메인: 지수 보드·AI 브리핑·주요 뉴스 / 사이드: 최근 소식·인기·관심).
 * 데스크탑 2단, 모바일은 1단 세로 스택(사이드바가 메인 아래로).
 */
import IndexRail from './IndexRail';
import IndexBoard from './IndexBoard';
import HomeBriefing from './HomeBriefing';
import HomeNews from './HomeNews';
import HomeSidebar from './HomeSidebar';

export default function NaverHome() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <IndexRail />
      <div className="nh-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <IndexBoard />
          <HomeBriefing />
          <HomeNews />
        </div>
        <HomeSidebar />
      </div>
      <style jsx>{`
        .nh-grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px; align-items: start; }
        @media (max-width: 1024px) { .nh-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
