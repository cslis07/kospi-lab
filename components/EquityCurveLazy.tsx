'use client';

/**
 * 에쿼티 커브 지연 로딩 래퍼 — Recharts 를 페이지 첫 번들에서 뺀다(⛔ EquityCurve 를 직접 import 금지).
 * 로딩 중엔 같은 높이의 카드 자리를 잡아 레이아웃이 밀리지 않게 한다.
 */
import dynamic from 'next/dynamic';
import { EQUITY_CARD_H } from './detail/chartLayout';

const EquityCurveLazy = dynamic(() => import('./EquityCurve'), {
  ssr: false,
  loading: () => <div className="fin-card mb-3 skeleton" style={{ height: EQUITY_CARD_H }} aria-label="자산 곡선 로딩 중" />,
});
export default EquityCurveLazy;
