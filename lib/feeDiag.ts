/**
 * 수수료 진단 — 메이커(지정가로 호가에 걸려 체결) vs 테이커(시장가·즉시 체결) 비중과
 * "전부 지정가(메이커)였다면" 가정 절감액. 순수 함수(테스트: tests/feeDiag.test.ts).
 *
 * 입력은 Bitget v2 /api/v2/mix/order/fill-history 체결 1건 = Fill 1개(실측 필드):
 *   tradeScope 'maker'|'taker', price, baseVolume, quoteVolume(=체결 금액 USDT),
 *   feeDetail[].totalFee(음수 = 낸 수수료, 양수 = 리베이트), side 'buy'|'sell', tradeSide 'open'|'close', cTime.
 *
 * ⚠ 가정 절감액은 '측정'이 아니라 가정이다 — 지정가 주문은 체결되지 않을 수 있고(놓친 매매·손절 지연),
 *   같은 가격에 체결됐다고 가정한다. 메이커 요율은 이 기간 실제 메이커 체결의 실효 요율을 쓰고,
 *   메이커 체결이 없으면 Bitget 표준 요율(메이커 0.02%)을 쓴다 — 어느 쪽인지 makerRateSource 로 표시.
 */

export interface Fill {
  ts: number;
  symbol: string;
  scope: 'maker' | 'taker';
  side: 'buy' | 'sell';
  tradeSide: 'open' | 'close' | 'other';
  price: number;
  size: number;
  /** 체결 금액(USDT) = price × size */
  notional: number;
  /** 낸 수수료(USDT, 양수 = 비용, 음수 = 리베이트) */
  fee: number;
}

/** Bitget USDT-M 선물 표준(VIP0) 요율 — 메이커 체결이 없을 때만 쓰는 참고값 */
export const STD_MAKER_RATE = 0.0002;
export const STD_TAKER_RATE = 0.0006;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Bitget fill-history 원본 행 → Fill (필드가 비면 null) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseFill(r: any): Fill | null {
  if (!r || typeof r !== 'object') return null;
  const price = num(r.price), size = num(r.baseVolume);
  const notional = num(r.quoteVolume) || price * size;
  const ts = num(r.cTime);
  if (!r.symbol || !(notional > 0) || !(ts > 0)) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const feeRaw = Array.isArray(r.feeDetail) ? r.feeDetail.reduce((a: number, f: any) => a + num(f?.totalFee), 0) : num(r.fee);
  return {
    ts,
    symbol: String(r.symbol),
    scope: r.tradeScope === 'maker' ? 'maker' : 'taker',
    side: r.side === 'sell' ? 'sell' : 'buy',
    tradeSide: r.tradeSide === 'open' ? 'open' : r.tradeSide === 'close' ? 'close' : 'other',
    price, size, notional,
    fee: -feeRaw, // Bitget: 낸 수수료가 음수 → 비용을 양수로
  };
}

export interface ScopeStat {
  n: number;
  notional: number;
  fee: number;
  /** 체결 금액 대비 실효 요율(%) — 체결 없으면 null */
  ratePct: number | null;
  /** 전체 수수료 중 이쪽 몫(%) */
  feeSharePct: number | null;
  /** 전체 체결 금액 중 이쪽 몫(%) */
  notionalSharePct: number | null;
}

export interface FeeDiag {
  n: number;
  notional: number;
  totalFee: number;
  /** 전체 실효 요율(%) = 총수수료 ÷ 총체결금액 */
  effRatePct: number | null;
  maker: ScopeStat;
  taker: ScopeStat;
  /** 진입·청산별 테이커 비중(체결 건수 %) — 어느 쪽에서 시장가를 쓰나 */
  takerShareOpenPct: number | null;
  takerShareClosePct: number | null;
  /** 가정 계산에 쓴 메이커 요율(소수, 0.0002 = 0.02%) */
  makerRateUsed: number;
  makerRateSource: 'observed' | 'standard';
  /** 테이커 체결을 전부 makerRateUsed 로 냈다면의 총수수료(가정) */
  hypoAllMakerFee: number;
  /** 가정 절감액 = totalFee − hypoAllMakerFee (음수면 0으로 자르지 않음 — 메이커가 더 비싼 이상치도 그대로) */
  hypoSaving: number;
  hypoSavingPct: number | null;
}

function scopeStat(list: Fill[], totalFee: number, totalNotional: number): ScopeStat {
  const notional = list.reduce((a, f) => a + f.notional, 0);
  const fee = list.reduce((a, f) => a + f.fee, 0);
  return {
    n: list.length, notional, fee,
    ratePct: notional > 0 ? (fee / notional) * 100 : null,
    feeSharePct: totalFee > 0 ? (fee / totalFee) * 100 : null,
    notionalSharePct: totalNotional > 0 ? (notional / totalNotional) * 100 : null,
  };
}

export function feeDiag(fills: Fill[]): FeeDiag {
  const notional = fills.reduce((a, f) => a + f.notional, 0);
  const totalFee = fills.reduce((a, f) => a + f.fee, 0);
  const makers = fills.filter((f) => f.scope === 'maker');
  const takers = fills.filter((f) => f.scope === 'taker');
  const maker = scopeStat(makers, totalFee, notional);
  const taker = scopeStat(takers, totalFee, notional);

  const observed = maker.notional > 0 && maker.fee >= 0 ? maker.fee / maker.notional : null;
  const makerRateUsed = observed ?? STD_MAKER_RATE;
  const hypoAllMakerFee = maker.fee + taker.notional * makerRateUsed;
  const hypoSaving = totalFee - hypoAllMakerFee;

  const share = (side: Fill['tradeSide']) => {
    const s = fills.filter((f) => f.tradeSide === side);
    return s.length ? (s.filter((f) => f.scope === 'taker').length / s.length) * 100 : null;
  };

  return {
    n: fills.length, notional, totalFee,
    effRatePct: notional > 0 ? (totalFee / notional) * 100 : null,
    maker, taker,
    takerShareOpenPct: share('open'),
    takerShareClosePct: share('close'),
    makerRateUsed,
    makerRateSource: observed != null ? 'observed' : 'standard',
    hypoAllMakerFee, hypoSaving,
    hypoSavingPct: totalFee > 0 ? (hypoSaving / totalFee) * 100 : null,
  };
}

/** [start, end] 를 최대 maxMs 길이 구간으로 자른다(최신 구간부터). Bitget fill-history 는 7일 초과 구간을 거부한다. */
export function timeWindows(start: number, end: number, maxMs = 7 * 86_400_000): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let e = end;
  while (e > start) {
    const s = Math.max(start, e - maxMs);
    out.push([s, e]);
    e = s;
  }
  return out;
}
