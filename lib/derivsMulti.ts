/**
 * 거래소별 파생 수급(참고: CoinGlass·Coinalyze·Velo) — 바이낸스·바이비트·OKX·비트겟·하이퍼리퀴드 공개 무키 API.
 * 계산만 여기(테스트 고정: tests/derivsMulti.test.ts), 호출은 app/api/coin/derivs.
 *
 * - 펀딩: 거래소마다 정산 주기가 달라(바이낸스·바이비트·OKX·비트겟 대개 8h, 하이퍼리퀴드 1h) **8시간 환산·연환산**으로 맞춰 비교.
 * - OI: **코인 수량** 기준(USD 는 가격만 올라도 커지므로 4분면엔 수량). 바이비트 openInterest 는 양쪽 합이라 singleOpenInterest(한쪽)을 쓴다.
 * - OI·가격 4분면: 지난 1h·24h 동안 '무슨 일이 있었나'의 흔한 해석일 뿐 — 다음 방향 예측 아님(앱 원칙, 엔진 49.7%).
 * - 롱숏: 계정 수 비율(돈 아님). 바이낸스 '상위 트레이더' = 증거금 상위 20% 계정(거래소 정의).
 */
export type Venue = 'binance' | 'bybit' | 'okx' | 'bitget' | 'hyperliquid';
export const VENUES: Venue[] = ['binance', 'bybit', 'okx', 'bitget', 'hyperliquid'];
export const VENUE_LABEL: Record<Venue, string> = { binance: '바이낸스', bybit: '바이비트', okx: 'OKX', bitget: '비트겟', hyperliquid: '하이퍼리퀴드' };

/** 한 거래소의 현재 스냅샷(실패 필드는 null) */
export interface VenueSnap {
  venue: Venue;
  fundingRate: number | null; // 다음 정산에 적용될(예상) 펀딩, 소수(0.0001 = 0.01%)
  intervalH: number | null;   // 정산 주기(시간)
  nextFundingTime: number | null;
  oiCoins: number | null;     // 한쪽 기준 미결제약정(코인 수량)
  mark: number | null;
  index: number | null;
}

const fin = (v: unknown): number | null => { const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN; return Number.isFinite(n) ? n : null; };
export const num = fin;

/** 펀딩을 8시간 환산(%)·연환산(%)으로 */
export function fundingNorm(rate: number | null, intervalH: number | null): { per8hPct: number; annualPct: number } | null {
  if (rate == null || !intervalH || intervalH <= 0) return null;
  const perH = rate / intervalH;
  return { per8hPct: perH * 8 * 100, annualPct: perH * 24 * 365 * 100 };
}

/** 마크가 − 인덱스(현물 기준가) 괴리 % = 무기한 베이시스 */
export function premiumPct(mark: number | null, index: number | null): number | null {
  if (mark == null || index == null || index <= 0) return null;
  return ((mark - index) / index) * 100;
}

/** OI 가중 평균 연환산 펀딩 + 최고·최저 거래소와 그 차이(연환산 %p) */
export function fundingSummary(snaps: VenueSnap[]): { weightedAnnualPct: number | null; max: { venue: Venue; annualPct: number } | null; min: { venue: Venue; annualPct: number } | null; spreadPct: number | null } {
  const rows = snaps.map((s) => ({ s, n: fundingNorm(s.fundingRate, s.intervalH) })).filter((r): r is { s: VenueSnap; n: { per8hPct: number; annualPct: number } } => !!r.n);
  if (!rows.length) return { weightedAnnualPct: null, max: null, min: null, spreadPct: null };
  const w = rows.filter((r) => r.s.oiCoins != null && r.s.oiCoins > 0);
  const wSum = w.reduce((a, r) => a + r.s.oiCoins!, 0);
  const weightedAnnualPct = wSum > 0 ? w.reduce((a, r) => a + r.n.annualPct * r.s.oiCoins!, 0) / wSum : rows.reduce((a, r) => a + r.n.annualPct, 0) / rows.length;
  const sorted = [...rows].sort((a, b) => b.n.annualPct - a.n.annualPct);
  const max = { venue: sorted[0].s.venue, annualPct: sorted[0].n.annualPct };
  const min = { venue: sorted[sorted.length - 1].s.venue, annualPct: sorted[sorted.length - 1].n.annualPct };
  return { weightedAnnualPct, max, min, spreadPct: rows.length > 1 ? max.annualPct - min.annualPct : null };
}

/**
 * 여러 거래소 OI 시계열(시각 → 코인 수량)을 **모든 시계열에 있는 시각만** 골라 합산(오름차순).
 * 한 거래소만 빠진 시각을 합치면 그 시각만 OI가 '줄어든' 것처럼 보이므로 교집합만 쓴다.
 */
export function sumAligned(series: Map<number, number>[]): { ts: number; sum: number }[] {
  const use = series.filter((m) => m.size > 0);
  if (!use.length) return [];
  return [...use[0].keys()].filter((t) => use.every((m) => m.has(t))).sort((a, b) => a - b)
    .map((ts) => ({ ts, sum: use.reduce((a, m) => a + m.get(ts)!, 0) }));
}

/** 마지막 점 대비 hours 시간 전 점의 변화율(%) — 정확히 그 시각 점이 없으면 null */
export function changeOver(points: { ts: number; v: number }[], hours: number): number | null {
  if (!points.length) return null;
  const last = points[points.length - 1];
  const prev = points.find((p) => p.ts === last.ts - hours * 3600_000);
  if (!prev || prev.v <= 0) return null;
  return ((last.v - prev.v) / prev.v) * 100;
}

export type Quadrant = 'longBuild' | 'shortCover' | 'shortBuild' | 'longUnwind' | 'rangeBuild' | 'rangeUnwind' | 'flat';
/** 창별 '변화 작음' 기준 — 가격 %, OI % (표시용 구분, 측정 신호 아님) */
export const QUAD_THRESH: Record<'1h' | '24h', { price: number; oi: number }> = { '1h': { price: 0.2, oi: 0.3 }, '24h': { price: 1, oi: 1.5 } };
export const QUAD_TEXT: Record<Quadrant, { label: string; desc: string; tone: 'build' | 'unwind' | 'flat' }> = {
  longBuild:   { label: '가격↑ · OI↑', desc: '새 포지션이 들어오며 상승 — 레버리지가 쌓이는 중(흔히 신규 롱 우세로 해석)', tone: 'build' },
  shortCover:  { label: '가격↑ · OI↓', desc: '포지션이 줄며 상승 — 숏 청산·환매가 끌어올린 모양', tone: 'unwind' },
  shortBuild:  { label: '가격↓ · OI↑', desc: '새 포지션이 들어오며 하락 — 레버리지가 쌓이는 중(흔히 신규 숏 우세로 해석)', tone: 'build' },
  longUnwind:  { label: '가격↓ · OI↓', desc: '포지션이 줄며 하락 — 롱 청산·정리로 레버리지가 풀리는 중', tone: 'unwind' },
  rangeBuild:  { label: '가격 → · OI↑', desc: '가격은 제자리인데 포지션이 쌓임 — 한쪽으로 움직이면 청산 연료가 될 수 있음', tone: 'build' },
  rangeUnwind: { label: '가격 → · OI↓', desc: '가격은 제자리, 포지션 정리 — 레버리지가 풀리는 중', tone: 'unwind' },
  flat:        { label: 'OI 변화 작음', desc: '레버리지 증감이 작음 — 현물·주문흐름이 가격을 움직이는 구간', tone: 'flat' },
};
export function oiPriceQuadrant(pricePct: number | null, oiPct: number | null, win: '1h' | '24h'): Quadrant | null {
  if (pricePct == null || oiPct == null) return null;
  const t = QUAD_THRESH[win];
  const oi = oiPct >= t.oi ? 1 : oiPct <= -t.oi ? -1 : 0;
  const px = pricePct >= t.price ? 1 : pricePct <= -t.price ? -1 : 0;
  if (oi === 0) return 'flat';
  if (px === 0) return oi > 0 ? 'rangeBuild' : 'rangeUnwind';
  if (px > 0) return oi > 0 ? 'longBuild' : 'shortCover';
  return oi > 0 ? 'shortBuild' : 'longUnwind';
}

/** 롱숏 비율(롱/숏) → 롱 비중 % */
export function longPctOf(ratio: number | null): number | null {
  return ratio == null || ratio < 0 || !Number.isFinite(ratio) ? null : (ratio / (1 + ratio)) * 100;
}

/** 상위 트레이더 포지션 롱% − 전체 계정 롱% (%p). 양수 = 큰손이 전체보다 롱 쪽 */
export function crowdGap(topPosLongPct: number | null, globalLongPct: number | null): number | null {
  return topPosLongPct == null || globalLongPct == null ? null : topPosLongPct - globalLongPct;
}
/** 차이 해석(설명용) — |차이| 10%p 미만이면 '비슷' */
export function crowdGapText(gap: number | null): string | null {
  if (gap == null) return null;
  if (Math.abs(gap) < 10) return '큰손과 전체 계정의 쏠림이 비슷';
  return gap < 0 ? '전체 계정(개미)이 큰손보다 롱에 쏠림' : '큰손이 전체 계정보다 롱에 쏠림';
}

/** 하이퍼리퀴드 다음 정산 = 다음 정시(1시간 주기) */
export const nextHour = (now: number) => Math.floor(now / 3600_000) * 3600_000 + 3600_000;

/** 심볼 → 거래소별 표기 */
export function venueSymbols(symbol: string) {
  const base = symbol.replace(/USDT$/, '');
  return { base, binance: symbol, bybit: symbol, bitget: symbol, okx: `${base}-USDT-SWAP`, hyperliquid: base };
}
