/**
 * 공포·탐욕 지수 구간(0~100) — 서버 집계(lib/coinEnvLive)와 화면 게이지(components/FearGreedGauge)가 같이 쓴다.
 * 구간은 CNN Fear & Greed Index 와 같은 5단계: 0~25 극단적 공포 · 26~45 공포 · 46~55 중립 · 56~75 탐욕 · 76~100 극단적 탐욕.
 */
export interface FngBand { from: number; to: number; label: string; en: string; color: string; face: string }

export const FNG_BANDS: FngBand[] = [
  { from: 0, to: 25, label: '극단적 공포', en: 'Extreme Fear', color: '#ef5350', face: '😱' },
  { from: 25, to: 45, label: '공포', en: 'Fear', color: '#ffb74d', face: '😨' },
  { from: 45, to: 55, label: '중립', en: 'Neutral', color: '#f2ee3f', face: '😐' },
  { from: 55, to: 75, label: '탐욕', en: 'Greed', color: '#bcd85a', face: '😊' },
  { from: 75, to: 100, label: '극단적 탐욕', en: 'Extreme Greed', color: '#3fa96b', face: '🤑' },
];

/** 값이 속한 구간 — 경계값은 아래 구간(25 = 극단적 공포, 45 = 공포, 55 = 중립, 75 = 탐욕) */
export function fngBand(v: number): FngBand {
  const x = Math.max(0, Math.min(100, v));
  return FNG_BANDS.find((b) => x <= b.to) ?? FNG_BANDS[FNG_BANDS.length - 1];
}
export const fngLabel = (v: number) => fngBand(v).label;

export interface FngCompare { label: string; value: number }

/** 전일·1주 전·1개월 전·1년 전 값 — 그 날짜(또는 그 이전 가장 가까운 날)의 값. 자료가 거기까지 없으면 뺀다 */
export function fngCompare(series: { date: string; value: number }[]): FngCompare[] {
  if (series.length < 2) return [];
  const last = series[series.length - 1].date;
  const at = (days: number) => {
    const target = new Date(Date.parse(`${last}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
    if (series[0].date > target) return null;
    let hit: number | null = null;
    for (const p of series) { if (p.date <= target) hit = p.value; else break; }
    return hit;
  };
  const rows: [string, number][] = [['전일', 1], ['1주 전', 7], ['1개월 전', 30], ['1년 전', 365]];
  return rows.map(([label, d]) => ({ label, value: at(d) })).filter((r): r is FngCompare => r.value != null);
}
