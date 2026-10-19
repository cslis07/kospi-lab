/**
 * 레이어2 — 수요/흐름 (빠르게 변함 · "지금 실제로 사는 손이 있나")
 *
 * 당신이 붙인 분석의 핵심: 공급 감소보다 현물 순매수가 단기 방향에 더 중요하다 → 그 "실수요"를 본다.
 * 무료·무키 소스(2026-10-19 실측 통과):
 *  - 코인베이스 프리미엄: Coinbase(USD) vs Binance(USDT) ETH 가격차 = 美 기관 실수요의 대리지표
 *  - 김프: Upbit(KRW) vs Binance×환율 = 국내 수요
 *  - CVD(현물 누적 테이커 델타): Binance 클라인의 '테이커 매수량'으로 '공격적 매수 vs 매도'를 집계 =
 *    "지금 실제로 사는 손"(당신이 붙인 분석이 단기 방향에 더 중요하다 한 바로 그 흐름)
 *
 * ⚠ 정직성: 셋 다 수요의 '방향'이 아니라 '지금 어느 쪽이 더 적극적인가'의 단서다.
 *   음수 프리미엄·음수 CVD가 하락을 보장하지 않는다.
 */

export type DemandState = 'buying' | 'selling' | 'neutral';

export interface DemandLayer {
  ethUsd: number | null;
  eth24hChgPct: number | null; // ETH 24h 가격 변화율 % (방금 vs 어제)
  coinbasePremiumPct: number | null; // (Coinbase - Binance)/Binance * 100
  kimchiPct: number | null; // (Upbit / (Binance×USDKRW) - 1) * 100
  cvdNetEth: number | null; // 윈도 내 순 테이커 델타(매수-매도, ETH)
  cvdRatioPct: number | null; // 순 델타 / 총 거래량 * 100 (-100..100, 정규화)
  cvdWindowH: number; // 집계 창(시간)
  usdKrw: number | null;
  state: DemandState;
  asof: number;
}

/** (a/b - 1) * 100 — b가 0이면 0 */
export function premiumPct(a: number, b: number): number {
  return b ? (a / b - 1) * 100 : 0;
}

/** Binance 클라인 1개의 순 테이커 델타(ETH) = 테이커매수 - 테이커매도 = 2×테이커매수 - 총거래량.
 *  kline[5]=총거래량(base), kline[9]=테이커 매수량(base). */
export function takerDelta(kline: string[]): number {
  const vol = Number(kline[5]);
  const takerBuy = Number(kline[9]);
  if (!Number.isFinite(vol) || !Number.isFinite(takerBuy)) return 0;
  return 2 * takerBuy - vol;
}

/** 클라인 배열 → 순 테이커 델타 합·총거래량·정규화 비율(%) */
export function cvdSummary(klines: string[][]): { netEth: number; totalEth: number; ratioPct: number } {
  let net = 0;
  let total = 0;
  for (const k of klines) {
    net += takerDelta(k);
    const v = Number(k[5]);
    if (Number.isFinite(v)) total += v;
  }
  return { netEth: net, totalEth: total, ratioPct: total ? (net / total) * 100 : 0 };
}

/**
 * 수요 상태 판정 — 방향 예측이 아니라 "지금 매수세가 더 적극적인가".
 *  - 코인베이스 프리미엄(美 현물)·CVD(공격적 체결)가 주 가중. 김프는 과열/위축 보조.
 */
export function demandState(s: {
  coinbasePremiumPct?: number | null;
  kimchiPct?: number | null;
  cvdRatioPct?: number | null;
}): DemandState {
  let score = 0;
  const cb = s.coinbasePremiumPct ?? 0;
  if (cb > 0.05) score += 1;
  else if (cb < -0.05) score -= 1;
  const cvd = s.cvdRatioPct ?? 0; // 순 테이커 매수 비율(경험적 ±3% 기준선)
  if (cvd > 3) score += 1;
  else if (cvd < -3) score -= 1;
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

const CVD_WINDOW_H = 24; // 최근 24시간 테이커 흐름

export async function getDemandLayer(): Promise<DemandLayer> {
  const [coinbase, binance, upbit, fx, klines] = await Promise.all([
    jget('https://api.coinbase.com/v2/prices/ETH-USD/spot', 6000, 20)
      .then((j) => Number((j as { data?: { amount?: string } }).data?.amount))
      .catch(() => NaN),
    jget('https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT', 6000, 20)
      .then((j) => {
        const t = j as { lastPrice?: string; priceChangePercent?: string };
        return { price: Number(t.lastPrice), chg: Number(t.priceChangePercent) };
      })
      .catch(() => ({ price: NaN, chg: NaN })),
    jget('https://api.upbit.com/v1/ticker?markets=KRW-ETH', 6000, 20)
      .then((j) => Number((j as { trade_price?: number }[])[0]?.trade_price))
      .catch(() => NaN),
    jget('https://api.frankfurter.app/latest?from=USD&to=KRW', 6000, 3600)
      .then((j) => Number((j as { rates?: { KRW?: number } }).rates?.KRW))
      .catch(() => NaN),
    jget(`https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=1h&limit=${CVD_WINDOW_H}`, 7000, 60)
      .then((j) => (Array.isArray(j) ? (j as string[][]) : null))
      .catch(() => null),
  ]);

  const bPrice = binance.price;
  const ethUsd = Number.isFinite(bPrice) ? bPrice : Number.isFinite(coinbase) ? coinbase : null;
  const coinbasePremiumPct =
    Number.isFinite(coinbase) && Number.isFinite(bPrice) ? premiumPct(coinbase, bPrice) : null;
  const kimchiPct =
    Number.isFinite(upbit) && Number.isFinite(bPrice) && Number.isFinite(fx)
      ? premiumPct(upbit, bPrice * fx)
      : null;
  const cvd = klines && klines.length ? cvdSummary(klines) : null;

  return {
    ethUsd,
    eth24hChgPct: Number.isFinite(binance.chg) ? binance.chg : null,
    coinbasePremiumPct,
    kimchiPct,
    cvdNetEth: cvd ? Math.round(cvd.netEth) : null,
    cvdRatioPct: cvd ? cvd.ratioPct : null,
    cvdWindowH: CVD_WINDOW_H,
    usdKrw: Number.isFinite(fx) ? fx : null,
    state: demandState({ coinbasePremiumPct, kimchiPct, cvdRatioPct: cvd?.ratioPct ?? null }),
    asof: Date.now(),
  };
}
