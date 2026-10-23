'use client';

/**
 * 규율 점수 추이 차트 지연 로딩 래퍼 — Recharts 를 페이지 첫 번들에서 뺀다(⛔ DisciplineTrendChart 직접 import 금지).
 */
import dynamic from 'next/dynamic';

const DisciplineTrendLazy = dynamic(() => import('./DisciplineTrendChart'), {
  ssr: false,
  loading: () => <div className="skeleton rounded-lg" style={{ height: 140 }} aria-label="규율 점수 추이 로딩 중" />,
});
export default DisciplineTrendLazy;
