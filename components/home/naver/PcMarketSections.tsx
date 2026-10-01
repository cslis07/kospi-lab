'use client';

/**
 * 홈 시장 섹션 — 네이버 증권 홈처럼 큰 부제목 기준으로 간격을 두고 5개 기능을 모두 펼친다.
 * 순서 = stock.naver.com 홈 페이지 코드의 위젯 배치 순서(실시간 랭킹 → 산업 트렌드 → 리서치 → 테마 ETF → 환율·시장지표).
 *
 * 모든 화면 폭에서 노출(10-01 사용자 지시 "어떤 상황에서도"). 예전엔 ≥1024px 에서만 마운트해서
 * 창을 줄이거나 배율 150%(CSS 폭 960px) 노트북에선 섹션이 통째로 사라졌다.
 * 대신 섹션마다 화면 800px 앞에 다가오면 마운트(LazyMount) — 폰에서 홈을 열자마자 5개 API 폴링이 몰리지 않게.
 * 한 번 마운트되면 유지(스크롤로 오가도 다시 로딩하지 않음). 화면 밖에서 미리 그려지므로 보이는 순간 밀림도 없다.
 */
import { useEffect, useState } from 'react';
import RankingSection from '@/components/naver/sections/RankingSection';
import IndustrySection from '@/components/naver/sections/IndustrySection';
import ResearchSection from '@/components/naver/sections/ResearchSection';
import ThemeEtfSection from '@/components/naver/sections/ThemeEtfSection';
import IndicatorsSection from '@/components/naver/sections/IndicatorsSection';

function LazyMount({ minHeight, children }: { minHeight: number; children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!el || on) return;
    if (typeof IntersectionObserver === 'undefined') { setOn(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setOn(true); }, { rootMargin: '800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [el, on]);
  return <div ref={setEl} style={on ? undefined : { minHeight }}>{on ? children : null}</div>;
}

export default function PcMarketSections() {
  return (
    <div className="nv-home-secs">
      <LazyMount minHeight={720}><RankingSection home /></LazyMount>
      <LazyMount minHeight={420}><IndustrySection home /></LazyMount>
      <LazyMount minHeight={560}><ResearchSection home /></LazyMount>
      <LazyMount minHeight={520}><ThemeEtfSection home /></LazyMount>
      <LazyMount minHeight={300}><IndicatorsSection home /></LazyMount>
    </div>
  );
}
