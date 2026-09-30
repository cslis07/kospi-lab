'use client';

/**
 * 홈(PC 전용) 시장 섹션 — 네이버 증권 홈처럼 큰 부제목 기준으로 간격을 두고 5개 기능을 모두 펼친다.
 * 순서 = stock.naver.com 홈 페이지 코드의 위젯 배치 순서(실시간 랭킹 → 산업 트렌드 → 리서치 → 테마 ETF → 환율·시장지표).
 * ≥1024px(PC)에서만 렌더 — CSS 숨김이 아니라 아예 마운트하지 않아 모바일에선 API 호출도 없다(사용자 지시: PC만).
 */
import { useMediaQuery } from './Fold';
import RankingSection from '@/components/naver/sections/RankingSection';
import IndustrySection from '@/components/naver/sections/IndustrySection';
import ResearchSection from '@/components/naver/sections/ResearchSection';
import ThemeEtfSection from '@/components/naver/sections/ThemeEtfSection';
import IndicatorsSection from '@/components/naver/sections/IndicatorsSection';

export default function PcMarketSections() {
  const pc = useMediaQuery('(min-width: 1024px)');
  if (!pc) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 56, marginTop: 48 }}>
      <RankingSection home />
      <IndustrySection home />
      <ResearchSection home />
      <ThemeEtfSection home />
      <IndicatorsSection home />
    </div>
  );
}
