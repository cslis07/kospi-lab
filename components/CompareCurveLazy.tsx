'use client';

/** 내 %곡선 vs 지수 % 비교 차트 지연 로딩 래퍼 — Recharts 를 페이지 첫 번들에서 뺀다. */
import dynamic from 'next/dynamic';
import type { CmpRow } from '@/lib/journalAnalytics';

const Chart = dynamic(() => import('./CompareCurve'), {
  ssr: false,
  loading: () => <div className="skeleton rounded-xl" style={{ height: 200 }} aria-label="차트 로딩 중" />,
});

export default function CompareCurveLazy(props: { rows: CmpRow[]; indexLabel: string }) {
  return <Chart {...props} />;
}
