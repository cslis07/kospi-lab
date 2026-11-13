/**
 * 진입 트리거 — **닫힌** 15분봉으로만 판정(진행 중인 봉은 쓰지 않는다). 규칙은 고정, 결과를 보고 바꾸지 않는다.
 *
 * 롱(되돌림 자리): 최근 닫힌 15분봉 2개 중 하나가 진입 구간에 닿았고(저가 ≤ 구간 상단),
 *   종가가 구간 하단 이상·손절선 위에서 양봉으로 마감, 아래꼬리 ≥ 몸통의 절반.
 * 숏(반등 자리): 위의 대칭 — 고가 ≥ 구간 하단, 종가 ≤ 구간 상단·손절선 아래 음봉, 윗꼬리 ≥ 몸통의 절반.
 * 캔들이 없거나 시각이 이상하면 '미확인'(추정으로 채우지 않음).
 */
import type { TriggerState } from './bridgeEntryRec';
import type { Side } from './decisionEngine';

export interface Candle { ts: number; o: number; h: number; l: number; c: number }
export const BAR_MS_15M = 15 * 60_000;

export function closedBars(candles: Candle[], asOfMs: number, barMs = BAR_MS_15M): Candle[] {
  return candles.filter((k) => Number.isFinite(k.ts) && k.ts + barMs <= asOfMs);
}

export function zoneTrigger(
  candles: Candle[], asOfMs: number, side: Side,
  zone: { zoneLow: number; zoneHigh: number; stop: number },
): TriggerState {
  const want = side === 'long'
    ? '15분봉이 구간에 닿은 뒤 양봉·아래꼬리로 마감'
    : '15분봉이 구간에 닿은 뒤 음봉·윗꼬리로 마감';
  const bars = closedBars(candles, asOfMs).slice(-2);
  if (!bars.length) return { confirmed: false, strategy: 'pullback', description: `${want} (닫힌 봉 없음)` };
  const hit = bars.some((k) => {
    const body = Math.abs(k.c - k.o);
    if (side === 'long') {
      const wick = Math.min(k.o, k.c) - k.l;
      return k.l <= zone.zoneHigh && k.c >= zone.zoneLow && k.c > zone.stop && k.c > k.o && wick >= body * 0.5;
    }
    const wick = k.h - Math.max(k.o, k.c);
    return k.h >= zone.zoneLow && k.c <= zone.zoneHigh && k.c < zone.stop && k.c < k.o && wick >= body * 0.5;
  });
  return { confirmed: hit, strategy: 'pullback', description: hit ? `${want} — 확인됨` : want };
}
