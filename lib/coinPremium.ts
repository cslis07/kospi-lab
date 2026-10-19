/**
 * 레이어2 — 수요/흐름 (빠르게 변함 · "지금 실제로 사는 손이 있나")
 *
 * 당신이 붙인 분석의 핵심: 공급 감소보다 현물 순매수가 단기 방향에 더 중요하다 → 그 "실수요"를 본다.
 * 무료·무키 소스(2026-10-19 실측 통과):
 *  - 코인베이스 프리미엄: Coinbase(USD) vs Binance(USDT) ETH 가격차 = 美 기관 실수요의 대리지표
 *  - 김프: Upbit(KRW) vs Binance×환율 = 국내 수요
 *
 * ⚠ 정직성: 프리미엄은 수요의 '방향'이 아니라 '지금 어느 쪽이 더 적극적인가'의 단서다.
 *   음수 프리미엄이 하락을 보장하지 않는다. CVD(테이커 누적)는 Phase 2에서 기존 데이터로 합류.
 */

export type DemandState = 'buying' | 'selling' | 'neutral';

export interface DemandLayer {
  ethUsd: number | null;
  coinbasePremiumPct: number | null; // (Coinbase - Binance)/Binance * 100
  kimchiPct: number | null; // (Upbit / (Binance×USDKRW) - 1) * 100
  usdKrw: number | null;
  state: DemandState;
  asof: number;
}

/** (a/b - 1) * 100 — b가 0이면 0 */
export function premiumPct(a: number, b: number): number {
  return b ? (a / b - 1) * 100 : 0;
}

/**
 * 수요 상태 판정 — 방향 예측이 아니라 "지금 매수세가 더 적극적인가".
 *  - 코인베이스 프리미엄이 주된 가중(美 현물 수요). 김프는 과열/위축의 보조 신호.
 */
export function demandState(s: { coinbasePremiumPct?: number | null; kimchiPct?: number | null }): DemandState {
  let score = 0;
  const cb = s.coinbasePremiumPct ?? 0;
  if (cb > 0.05) score += 1;
  else if (cb < -0.05) score -= 1;
  const km = s.kimchiPct ?? 0;
  if (km > 3) score += 0.5;
  else if (km < -1) score -= 0.5;
  return score >= 1 ? 'buying' : score <= -1 ? 'selling' : 'neutral';
}

async function jget(url: string, ms: number, revalidate: number, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, { next: { revalidate }, signal: AbortSignal.timeout(ms), ...init });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getDemandLayer(): Promise<DemandLayer> {
  const [coinbase, binance, upbit, fx] = await Promise.all([
    jget('https://api.coinbase.com/v2/prices/ETH-USD/spot', 6000, 20)
      .then((j) => Number((j as { data?: { amount?: string } }).data?.amount))
      .catch(() => NaN),
    jget('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT', 6000, 20)
      .then((j) => Number((j as { price?: string }).price))
      .catch(() => NaN),
    jget('https://api.upbit.com/v1/ticker?markets=KRW-ETH', 6000, 20)
      .then((j) => Number((j as { trade_price?: number }[])[0]?.trade_price))
      .catch(() => NaN),
    jget('https://api.frankfurter.app/latest?from=USD&to=KRW', 6000, 3600)
      .then((j) => Number((j as { rates?: { KRW?: number } }).rates?.KRW))
      .catch(() => NaN),
  ]);

  const ethUsd = Number.isFinite(binance) ? binance : Number.isFinite(coinbase) ? coinbase : null;
  const coinbasePremiumPct =
    Number.isFinite(coinbase) && Number.isFinite(binance) ? premiumPct(coinbase, binance) : null;
  const kimchiPct =
    Number.isFinite(upbit) && Number.isFinite(binance) && Number.isFinite(fx)
      ? premiumPct(upbit, binance * fx)
      : null;

  return {
    ethUsd,
    coinbasePremiumPct,
    kimchiPct,
    usdKrw: Number.isFinite(fx) ? fx : null,
    state: demandState({ coinbasePremiumPct, kimchiPct }),
    asof: Date.now(),
  };
}
