'use client';

/**
 * PriceChart(해외·코인 공용) 지연 로딩 래퍼 — Recharts 를 페이지 첫 번들에서 뺀다.
 * 로딩 중엔 같은 높이의 카드 자리를 잡아 레이아웃이 밀리지 않게 한다.
 */
import dynamic from 'next/dynamic';
import { PRICE_CHART_CARD_H } from './chartLayout';

const PriceChartLazy = dynamic(() => import('./PriceChart'), {
  ssr: false,
  loading: () => <div className="fin-card mb-3 skeleton" style={{ height: PRICE_CHART_CARD_H }} aria-label="차트 로딩 중" />,
});
export default PriceChartLazy;
