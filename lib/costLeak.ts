/**
 * 비용 누수 집중 분석 — "비용이 어디서 새나"를 한 화면에. 순수 함수(테스트: tests/costLeak.test.ts).
 *
 * 두 갈래 데이터를 쓴다:
 *  - 체결(fill-history, lib/feeDiag Fill): 수수료를 진입/청산 × 시장가/지정가 × (청산이면) 이익/손실로 쪼갠다.
 *    청산 체결의 profit(수수료 전 실현손익) > 0 이면 '이익 청산', 아니면 '손실 청산'. source 'sys' = 예약 손절·익절 주문 발동.
 *  - 청산 포지션(history-position, lib/bitgetPositions): 펀딩 낸/받은 돈, 보유시간별 수수료, 본전에 필요한 가격 이동.
 *
 * '구멍 순위'는 서로 다른 렌즈라 겹친다(1시간 미만 매매의 시장가 진입은 두 줄에 다 들어간다) — 더하지 않는다.
 * 지정가 가정 절감은 측정이 아니라 가정(체결 안 될 수 있음). 손실 청산(손절)은 체결 보장이 우선이라 '피할 수 있는 몫'에서 뺀다.
 */
import { STD_MAKER_RATE, type Fill } from './feeDiag';

export interface FeeBucket { n: number; notional: number; fee: number }

export interface FillLeak {
  n: number;
  totalFee: number;
  openTaker: FeeBucket;
  openMaker: FeeBucket;
  /** 이익 청산을 시장가로 — 지정가 익절로 바꿀 수 있는 몫 */
  closeTakerWin: FeeBucket;
  /** 손실 청산을 시장가로 — 손절이라 시장가가 맞을 수 있음 */
  closeTakerLoss: FeeBucket;
  closeMaker: FeeBucket;
  /** 손실 청산 시장가 중 예약 손절 주문 발동(sys) vs 손으로 청산 건수 */
  lossCloseBySl: number;
  lossCloseManual: number;
  makerRateUsed: number;
  makerRateSource: 'observed' | 'standard';
  /** 가정 절감 = 해당 체결 수수료 − 체결 금액 × 메이커 요율 */
  saveOpen: number;
  saveWinClose: number;
}

const empty = (): FeeBucket => ({ n: 0, notional: 0, fee: 0 });
const add = (b: FeeBucket, f: Fill) => { b.n++; b.notional += f.notional; b.fee += f.fee; };

export function fillLeak(fills: Fill[]): FillLeak {
  const openTaker = empty(), openMaker = empty(), closeTakerWin = empty(), closeTakerLoss = empty(), closeMaker = empty();
  let lossCloseBySl = 0, lossCloseManual = 0;
  for (const f of fills) {
    if (f.tradeSide === 'open') add(f.scope === 'maker' ? openMaker : openTaker, f);
    else if (f.tradeSide === 'close') {
      if (f.scope === 'maker') add(closeMaker, f);
      else if ((f.profit ?? 0) > 0) add(closeTakerWin, f);
      else {
        add(closeTakerLoss, f);
        if (f.source === 'sys') lossCloseBySl++; else lossCloseManual++;
      }
    }
  }
  const mk = { n: openMaker.n + closeMaker.n, notional: openMaker.notional + closeMaker.notional, fee: openMaker.fee + closeMaker.fee };
  const observed = mk.notional > 0 && mk.fee >= 0 ? mk.fee / mk.notional : null;
  const rate = observed ?? STD_MAKER_RATE;
  const save = (b: FeeBucket) => b.fee - b.notional * rate;
  return {
    n: fills.length,
    totalFee: fills.reduce((a, f) => a + f.fee, 0),
    openTaker, openMaker, closeTakerWin, closeTakerLoss, closeMaker,
    lossCloseBySl, lossCloseManual,
    makerRateUsed: rate,
    makerRateSource: observed != null ? 'observed' : 'standard',
    saveOpen: save(openTaker),
    saveWinClose: save(closeTakerWin),
  };
}

export interface LossCloseWeek { week: string; bySl: number; manual: number }
/**
 * 손실 청산(시장가) 체결을 KST 주(월요일 시작) 단위로 — 예약 손절 발동(sys) vs 직접 닫음. 규율 탭 '손절 미리 걸기' 추이.
 * 체결 건수 기준(부분 체결은 여러 건) — fillLeak 의 lossCloseBySl/Manual 과 같은 정의.
 */
export function lossCloseByWeek(fills: Fill[]): LossCloseWeek[] {
  const map = new Map<string, LossCloseWeek>();
  for (const f of fills) {
    if (f.tradeSide !== 'close' || f.scope === 'maker' || (f.profit ?? 0) > 0) continue;
    const d = new Date(f.ts + 9 * 3_600_000);
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
    const e = map.get(monday) ?? { week: monday, bySl: 0, manual: 0 };
    if (f.source === 'sys') e.bySl++; else e.manual++;
    map.set(monday, e);
  }
  return [...map.values()].sort((a, b) => a.week.localeCompare(b.week));
}

/** 청산 포지션 — lib/bitgetPositions ClosedPosition 의 부분집합(부호: fee 음수 = 비용, funding + 받음 / − 냄) */
export interface LeakPosition {
  grossPnl: number;
  fee: number;
  funding: number;
  size: number;
  openAvg: number;
  closeAvg: number;
  openTs: number;
  closeTs: number;
}

/** '초단타' 기준 — 1시간 미만 보유(매매일지 보유시간 구간과 같은 경계) */
export const SHORT_HOLD_MS = 3_600_000;
/** 펀딩은 8시간마다 정산 — 8시간 넘게 들고 간 포지션부터 거의 확실히 낸다 */
export const FUNDING_HOLD_MS = 8 * 3_600_000;

export interface PosLeak {
  n: number;
  gross: number;
  /** 수수료(양수 = 비용) */
  fee: number;
  fundingPaid: number;   // 양수 = 낸 돈
  fundingRecv: number;   // 양수 = 받은 돈
  /** 총비용 = 수수료 + 낸 펀딩 − 받은 펀딩 */
  cost: number;
  net: number;
  feeShareOfCostPct: number | null;
  fundingShareOfCostPct: number | null;
  /** 1시간 미만 보유 매매 */
  short: { n: number; gross: number; fee: number; feeShareOfFeePct: number | null };
  /** 8시간 이상 보유 매매가 낸 펀딩 몫(%) */
  fundingFromLongHoldPct: number | null;
  costPerTrade: number | null;
  grossPerTrade: number | null;
  /** 본전에 필요한 가격 이동(%) = 수수료 ÷ 진입 체결 대금 — 진입·청산 왕복 */
  breakEvenMovePct: number | null;
}

export function posLeak(ps: LeakPosition[]): PosLeak {
  const ok = ps.filter((p) => [p.grossPnl, p.fee, p.funding].every(Number.isFinite));
  const sum = (list: LeakPosition[], f: (p: LeakPosition) => number) => list.reduce((a, p) => a + f(p), 0);
  const gross = sum(ok, (p) => p.grossPnl);
  const fee = -sum(ok, (p) => p.fee);
  const fundingPaid = -sum(ok, (p) => Math.min(0, p.funding));
  const fundingRecv = sum(ok, (p) => Math.max(0, p.funding));
  const cost = fee + fundingPaid - fundingRecv;
  const pos = fee + fundingPaid; // 비율의 분모 — 받은 펀딩으로 상쇄하기 전 '나간 돈'
  const short = ok.filter((p) => p.closeTs - p.openTs < SHORT_HOLD_MS);
  const shortFee = -sum(short, (p) => p.fee);
  const longHoldPaid = -sum(ok.filter((p) => p.closeTs - p.openTs >= FUNDING_HOLD_MS), (p) => Math.min(0, p.funding));
  const entryTurnover = sum(ok, (p) => (p.size > 0 ? p.size * Math.abs(p.openAvg) : 0));
  return {
    n: ok.length, gross, fee, fundingPaid, fundingRecv, cost, net: gross - cost,
    feeShareOfCostPct: pos > 0 ? (fee / pos) * 100 : null,
    fundingShareOfCostPct: pos > 0 ? (fundingPaid / pos) * 100 : null,
    short: { n: short.length, gross: sum(short, (p) => p.grossPnl), fee: shortFee, feeShareOfFeePct: fee > 0 ? (shortFee / fee) * 100 : null },
    fundingFromLongHoldPct: fundingPaid > 0 ? (longHoldPaid / fundingPaid) * 100 : null,
    costPerTrade: ok.length ? cost / ok.length : null,
    grossPerTrade: ok.length ? gross / ok.length : null,
    breakEvenMovePct: entryTurnover > 0 ? (fee / entryTurnover) * 100 : null,
  };
}

export interface LeakItem {
  key: 'openTaker' | 'winCloseTaker' | 'shortHold' | 'funding';
  label: string;
  /** 이 렌즈로 본 비용(USDT, 양수) */
  usdt: number;
  kind: 'measured' | 'assumed';
  note: string;
}

/** 구멍 순위 — 큰 것부터. 렌즈끼리 겹치므로 합계를 내지 않는다. */
export function rankLeaks(fl: FillLeak | null, pl: PosLeak): LeakItem[] {
  const items: LeakItem[] = [];
  if (fl && fl.openTaker.n > 0) items.push({
    key: 'openTaker', label: '진입을 시장가로', usdt: fl.saveOpen, kind: 'assumed',
    note: `진입 ${fl.openTaker.n}건이 시장가 — 지정가였다면 아낄 수 있었던 몫(가정)`,
  });
  if (fl && fl.closeTakerWin.n > 0) items.push({
    key: 'winCloseTaker', label: '익절을 시장가로', usdt: fl.saveWinClose, kind: 'assumed',
    note: `이익 청산 ${fl.closeTakerWin.n}건이 시장가 — 지정가 익절 주문이었다면(가정)`,
  });
  if (pl.short.n > 0) items.push({
    key: 'shortHold', label: '1시간 미만 매매', usdt: pl.short.fee, kind: 'measured',
    note: `${pl.short.n}건이 낸 수수료(실제) · 이 매매들의 수수료 전 손익 ${pl.short.gross >= 0 ? '+' : '−'}${Math.abs(pl.short.gross).toFixed(0)}`,
  });
  if (pl.fundingPaid > 0) items.push({
    key: 'funding', label: '펀딩', usdt: pl.fundingPaid, kind: 'measured',
    note: `낸 펀딩(실제) · 받은 펀딩 ${pl.fundingRecv.toFixed(1)}`,
  });
  return items.filter((i) => i.usdt > 0).sort((a, b) => b.usdt - a.usdt);
}
