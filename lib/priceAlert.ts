/**
 * 국내 종목 가격 알림 판정 — 순수함수(테스트 대상).
 *
 * 저장 형식(localStorage 'kospi-lab-alerts'): { [ticker]: AlertEntry }. 예전 항목엔 enabled 가 없다 → 켜짐으로 본다.
 * 한 번 울리면 꺼진다(TradingView '한 번만' 방식) — 가격이 기준선 근처에서 오르내릴 때 30초마다 울리지 않게.
 * 다시 받으려면 알림 관리 화면에서 켠다.
 */
import type { AlertEntry } from './types';

export type AlertHit = 'above' | 'below';

export const isAlertOn = (a: AlertEntry) => a.enabled !== false && (a.above != null || a.below != null);

/** 현재가가 기준을 넘었으면 어느 쪽인지, 아니면 null. 꺼진 알림·가격 없음은 null */
export function checkAlert(a: AlertEntry, price: number | null | undefined): AlertHit | null {
  if (!isAlertOn(a) || !price || !(price > 0)) return null;
  if (a.above != null && a.above > 0 && price >= a.above) return 'above';
  if (a.below != null && a.below > 0 && price <= a.below) return 'below';
  return null;
}

/** 기준까지 남은 거리(%) — 가까운 쪽. 화면 정렬·표시용 */
export function alertDistancePct(a: AlertEntry, price: number | null | undefined): number | null {
  if (!price || !(price > 0)) return null;
  const ds: number[] = [];
  if (a.above != null && a.above > 0) ds.push(((a.above - price) / price) * 100);
  if (a.below != null && a.below > 0) ds.push(((price - a.below) / price) * 100);
  if (!ds.length) return null;
  return ds.reduce((m, d) => (Math.abs(d) < Math.abs(m) ? d : m));
}
