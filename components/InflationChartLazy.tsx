'use client';

/** Nowflation 허브 차트 지연 로딩 래퍼 — Recharts 를 페이지 첫 번들에서 뺀다(⛔ InflationChart 직접 import 금지). */
import dynamic from 'next/dynamic';
import type { CompareRow, ForecastRow, TrendRow, PriceRow } from '@/lib/inflation';

const Chart = dynamic(() => import('./InflationChart'), {
  ssr: false,
  loading: () => <div className="skeleton rounded-xl" style={{ height: 260 }} aria-label="차트 로딩 중" />,
});

export default function InflationChartLazy(props: { kind: 'compare' | 'forecast' | 'trend' | 'price'; rows: CompareRow[] | ForecastRow[] | TrendRow[] | PriceRow[]; height?: number; gaugeOverlay?: boolean }) {
  return <Chart {...props} />;
}
