/**
 * 코인 선물 가격 알림 — 진입 플랜·내 포지션의 가격선(목표·손절·추적)을 가격 도달 알림으로.
 * 종목(원화) 알림(lib/priceAlert)과 별개: 심볼당 여러 레벨, 가격은 USDT. 판정은 순수함수(테스트 고정).
 * 서버 푸시 아님 — 앱이 열려 있을 때 PriceAlertWatcher 가 /api/crypto/batch 로 확인해 발동 후 끈다.
 */
export interface CoinPriceAlert {
  id: string; symbol: string; label: string;
  price: number; side: 'above' | 'below';
  createdAt: number; enabled: boolean; firedAt?: number; firedPrice?: number;
}

/** 현재가가 조건을 충족하면 side, 아니면 null (꺼졌으면 null) */
export function checkCoinPriceAlert(a: CoinPriceAlert, price: number): 'above' | 'below' | null {
  if (!a.enabled || !(price > 0)) return null;
  if (a.side === 'above' && price >= a.price) return 'above';
  if (a.side === 'below' && price <= a.price) return 'below';
  return null;
}

export interface LevelSpec { label: string; price: number; kind: 'target' | 'stop' | 'trail' | 'entry' }

/**
 * 진입 플랜/포지션의 레벨들을 알림 사양으로 변환.
 * 방향(롱/숏)에 맞춰 above/below 자동 결정 — 목표(익절)는 유리한 쪽, 손절·추적·진입(되돌림)은 반대쪽.
 */
export function levelsToAlerts(symbol: string, dir: 'long' | 'short', levels: LevelSpec[], now: number): CoinPriceAlert[] {
  const out: CoinPriceAlert[] = [];
  const seen = new Set<string>();
  for (const l of levels) {
    if (!(l.price > 0)) continue;
    const toTarget = l.kind === 'target';
    const side: 'above' | 'below' = (dir === 'long') === toTarget ? 'above' : 'below';
    const id = `${symbol}:${l.kind}:${Math.round(l.price * 1e6)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, symbol, label: l.label, price: l.price, side, createdAt: now, enabled: true });
  }
  return out;
}
