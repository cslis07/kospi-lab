'use client';

/** 경제지표 차트 지연 로딩 래퍼 — Recharts 를 페이지 첫 번들에서 뺀다(⛔ MacroChart 직접 import 금지). */
import dynamic from 'next/dynamic';

const MacroChartLazy = dynamic(() => import('./MacroChart'), {
  ssr: false,
  loading: () => <div className="skeleton rounded-xl" style={{ height: 240 }} aria-label="차트 로딩 중" />,
});
export default MacroChartLazy;
