/**
 * Bitget USDT 선물 청산 포지션 조회(서명 GET, 읽기 전용) — /api/bitget/history 와 일일 매매 복기(lib/dailyReview) 공용.
 * ⚠ 키에 선물 읽기 권한이 없으면 throw — 호출 측이 폴백한다.
 */
import { bitgetSignedGet } from '@/lib/bitget';
import { attachStops, type SlOrder } from '@/lib/bitgetJournal';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** 청산 포지션 페이지 상한(= 1,000건) */
const MAX_PAGES = 10;

export interface ClosedPosition {
  positionId: string;
  symbol: string;
  side: 'long' | 'short';
  openAvg: number;
  closeAvg: number;
  size: number;
  /** 수수료·펀딩까지 반영한 실현 순손익 (USDT) — 이게 '진짜 성적'이다 */
  netProfit: number;
  grossPnl: number;
  fee: number;
  /** 진입·청산 수수료(거래소 값 그대로 — 보통 음수 = 비용). fee = openFee + closeFee */
  openFee?: number;
  closeFee?: number;
  funding: number;
  openTs: number;
  closeTs: number;
  /** SL 주문에서 복구한 손절가(있을 때만) */
  stop?: number;
}

export async function fetchClosedPositions(startTime: number, endTime: number): Promise<{ positions: ClosedPosition[]; slRecovered: number }> {
  // 한 번에 최대 100건 — 응답 endId 를 idLessThan 으로 넘겨 페이지를 넘긴다(넘기지 않으면 60일 조회가 최근 100건에서 잘린다)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];
  let idLessThan: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const j = await bitgetSignedGet(
      `/api/v2/mix/position/history-position?productType=USDT-FUTURES&startTime=${startTime}&endTime=${endTime}&limit=100${idLessThan ? `&idLessThan=${idLessThan}` : ''}`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = j.data as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = (d?.list as any[] | undefined) ?? [];
    rows.push(...list);
    const next = d?.endId ? String(d.endId) : undefined;
    if (list.length < 100 || !next || next === idLessThan) break;
    idLessThan = next;
  }

  const positions: ClosedPosition[] = rows.map((r) => {
    const openFee = num(r.openFee), closeFee = num(r.closeFee), funding = num(r.totalFunding);
    return {
      positionId: String(r.positionId ?? `${r.symbol}-${r.ctime}`),
      symbol: String(r.symbol ?? ''),
      side: (r.holdSide === 'short' ? 'short' : 'long') as 'long' | 'short',
      openAvg: num(r.openAvgPrice),
      closeAvg: num(r.closeAvgPrice),
      size: num(r.closeTotalPos ?? r.openTotalPos),
      // netProfit 이 없으면 pnl - 수수료 + 펀딩으로 직접 계산(필드명이 버전마다 다르다)
      netProfit: r.netProfit != null ? num(r.netProfit) : num(r.pnl) - (openFee + closeFee) * -1 + funding,
      grossPnl: num(r.pnl),
      fee: openFee + closeFee,
      openFee,
      closeFee,
      funding,
      openTs: num(r.ctime),
      closeTs: num(r.utime),
    };
  }).filter((p, i, a) => p.symbol && p.closeTs > 0 && a.findIndex((q) => q.positionId === p.positionId) === i)
    .sort((a, b) => b.closeTs - a.closeTs);

  // SL(스탑로스) 주문 트리거가 복구 — best-effort. 없거나 권한/필드 이슈면 조용히 skip.
  let sl: SlOrder[] = [];
  try {
    const pj = await bitgetSignedGet(
      `/api/v2/mix/order/orders-plan-history?productType=USDT-FUTURES&planType=profit_loss&startTime=${startTime}&endTime=${endTime}&limit=100`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = pj.data as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: any[] = d?.entrustedList ?? d?.list ?? (Array.isArray(d) ? d : []);
    sl = list.map((o) => ({
      symbol: String(o.symbol ?? ''),
      triggerPrice: num(o.triggerPrice ?? o.stopLossTriggerPrice ?? o.presetStopLossPrice ?? o.executePrice),
      ts: num(o.cTime ?? o.ctime ?? o.uTime),
    })).filter((o) => o.symbol && o.triggerPrice > 0 && o.ts > 0);
  } catch { /* SL 이력 없음/권한 없음 — 손절가 복구만 skip, 나머지는 정상 */ }

  const withStops = attachStops(positions, sl);
  return { positions: withStops, slRecovered: withStops.filter((p) => p.stop != null).length };
}
