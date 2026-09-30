/**
 * 차트 레이아웃 상수 — Recharts 를 import 하지 않는 가벼운 모듈.
 * 차트 컴포넌트는 지연 로딩하므로, 페이지가 필요한 값(기간 목록·자리 높이)은 여기서 가져간다
 * (차트 파일에서 직접 import 하면 Recharts 가 페이지 번들에 다시 딸려 온다).
 */
export const TIMEFRAMES = [
  { label: '1개월', months: 1 },
  { label: '3개월', months: 3 },
  { label: '6개월', months: 6 },
  { label: '1년',   months: 12 },
];

/** 국내 상세 차트 로딩 자리 높이 = 실제 차트 높이(레이아웃 밀림 방지) */
export function krChartHeight(o: { compare: boolean; showVol: boolean; showRSI: boolean }) {
  if (o.compare) return 220;
  return 240 + (o.showVol ? 60 : 0) + (o.showRSI ? 117 : 0);
}

/** 해외·코인 공용 PriceChart 카드 높이(로딩 자리) */
export const PRICE_CHART_CARD_H = 372;
