/**
 * "규칙대로였다면" — 청산된 매매를 **방향·진입은 그대로** 두고 실행 규칙만 바꿔 다시 계산한 가정 손익.
 * 순수 함수(테스트: tests/counterfactual.test.ts). 예측이 아니다 — 이미 지나간 가격 경로에 규칙을 대입한 사후 계산.
 *
 * 규칙(각각 따로 + 전부 합쳐서):
 *  (a) 손절 1.2×ATR — ATR(14)은 **1시간봉**(진입 전에 마감된 봉만)으로 잰다 — 포지션 가드의 손절 제안(lib/guard)과 같은 기준.
 *      (처음엔 MAE 캔들과 같은 1분·5분봉 ATR을 썼는데, 짧은 매매는 손절이 0.1% 수준으로 좁아져 '손절 규칙이 손해'라는
 *      측정 착시가 났다 — 2026-10-23 수정.) 손절에 닿았는지는 MAE 캔들(잘게 나눈 보유 구간)로 본다. 보유 구간 봉(진입 봉~청산 봉) 중 하나라도 손절가(진입가 ∓ 1.2ATR)를 건드렸으면
 *      그 가격(−1.2ATR 이동)으로 청산했다고 보고, 아니면 실제 결과 그대로.
 *      같은 봉 안의 순서는 모른다 → 손절가가 봉 범위 안이면 '맞았다'(보수적). 실제 청산가가 손절가를 넘었어도 맞은 것.
 *      그래서 손절이 실제보다 빨리 끊어 이후 반등(이익 마감)을 놓친 경우도 그대로 손해로 반영된다.
 *      비가격 비용(수수료·펀딩)은 실제 값을 그대로 둔다(청산가가 바뀌어 생기는 청산 수수료 차이는 무시).
 *  (b) 복수 매매 없음 — 손실 청산 후 30분 이내(종목 무관) 진입한 매매를 뺀다. 판정은 '실제 기록' 기준으로
 *      규율 점수(lib/discipline REVENGE_MS)와 같은 정의 — 뺀 매매 때문에 다음 매매 판정이 바뀌는 연쇄는 보지 않는다.
 *  (c) 진입만 지정가(메이커) — 진입 수수료를 메이커 0.02% × 진입 금액으로 바꾼다(실제가 더 싸면 실제 그대로).
 *      청산은 그대로 테이커(손절은 시장가 체결이 필요). 지정가가 '같은 가격에 체결됐다'는 가정이며
 *      실제로는 미체결(놓친 매매)이 생길 수 있다.
 *  (d) 전부 — (b)로 남은 매매에 (a)·(c)를 함께 적용.
 */
import { atr, type Candle } from './tradeAutopsy';
import { REVENGE_MS } from './discipline';

export const CF_STOP_ATR = 1.2;
export const CF_ATR_PERIOD = 14;
export const CF_MAKER_RATE = 0.0002;

export interface CfTrade {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  openAvg: number;
  closeAvg: number;
  size: number;
  /** 실제 순손익(수수료·펀딩 반영) */
  netProfit: number;
  /** 실제 가격 손익(수수료 전) */
  grossPnl: number;
  /** 진입 수수료(거래소 값 그대로, 보통 음수). 없으면 총수수료를 진입/청산 금액 비율로 나눠 추정 */
  openFee?: number;
  /** 총수수료(거래소 값 그대로, 보통 음수) */
  fee: number;
  openTs: number;
  closeTs: number;
}

export type StopStatus = 'hit' | 'not-hit' | 'unknown';
/** 매매 1건에 손절 규칙을 대입한 결과 — 캔들이 필요해 기기에 캐시된다 */
export interface StopCheck {
  status: StopStatus;
  /** 진입 전 ATR(가격) — 판정 불가면 null */
  atr: number | null;
  /** 손절가 */
  stopPrice: number | null;
  /** 손절까지 가격 거리(= 1.2 × ATR) */
  stopDist: number | null;
}

/**
 * 손절 1.2×ATR 판정. candles 는 진입 전 봉 + 보유 구간 봉(오름차순 무관), barMs 는 봉 길이.
 * ATR 은 ts + barMs ≤ openTs 인 봉(진입 전 마감)만, 보유 구간은 ts + barMs > openTs && ts ≤ closeTs.
 */
export function stopCheck(t: Pick<CfTrade, 'side' | 'openAvg' | 'closeAvg' | 'openTs' | 'closeTs'>, candles: Candle[], barMs: number, mult = CF_STOP_ATR, period = CF_ATR_PERIOD, atrCandles?: { candles: Candle[]; barMs: number }): StopCheck {
  const none: StopCheck = { status: 'unknown', atr: null, stopPrice: null, stopDist: null };
  if (!(t.openAvg > 0) || !(barMs > 0)) return none;
  const cs = [...candles].sort((a, b) => a.ts - b.ts);
  const src = atrCandles ? [...atrCandles.candles].sort((x, y) => x.ts - y.ts) : cs;
  const srcMs = atrCandles ? atrCandles.barMs : barMs;
  const before = src.filter((c) => c.ts + srcMs <= t.openTs);
  const a = atr(before, period);
  if (a == null || !(a > 0)) return none;
  const held = cs.filter((c) => c.ts + barMs > t.openTs && c.ts <= t.closeTs);
  if (!held.length) return { ...none, atr: a };
  const long = t.side === 'long';
  const dist = mult * a;
  const stopPrice = long ? t.openAvg - dist : t.openAvg + dist;
  const touched = held.some((c) => (long ? c.l <= stopPrice : c.h >= stopPrice));
  const exitBeyond = long ? t.closeAvg <= stopPrice : t.closeAvg >= stopPrice;
  return { status: touched || exitBeyond ? 'hit' : 'not-hit', atr: a, stopPrice, stopDist: dist };
}

/** 손절 규칙 적용 순손익 — 맞았으면 −dist × 수량 + 실제 비가격 비용, 아니면 실제 순손익 */
export function stopNet(t: CfTrade, s: StopCheck | undefined): number {
  if (!s || s.status !== 'hit' || s.stopDist == null) return t.netProfit;
  const nonPrice = t.netProfit - t.grossPnl; // 수수료+펀딩(보통 음수)
  return -s.stopDist * Math.abs(t.size) + nonPrice;
}

/** 진입 수수료를 메이커 요율로 바꿨을 때 아끼는 금액(0 이상) */
export function makerEntrySaving(t: CfTrade, rate = CF_MAKER_RATE): number {
  const size = Math.abs(t.size);
  const inN = t.openAvg * size, outN = t.closeAvg * size;
  if (!(inN > 0)) return 0;
  const actualEntry = t.openFee != null
    ? Math.abs(t.openFee)
    : Math.abs(t.fee) * (inN / (inN + Math.max(0, outN) || inN));
  return Math.max(0, actualEntry - rate * inN);
}

/** 복수 매매(손실 청산 후 30분 이내 진입) id — 실제 기록 기준 */
export function revengeIds(trades: Pick<CfTrade, 'id' | 'openTs' | 'closeTs' | 'netProfit'>[], windowMs = REVENGE_MS): Set<string> {
  const lossCloses = trades.filter((t) => t.netProfit < 0).map((t) => t.closeTs);
  return new Set(trades.filter((t) => lossCloses.some((c) => c <= t.openTs && t.openTs - c <= windowMs)).map((t) => t.id));
}

export type CfKey = 'stop' | 'revenge' | 'maker' | 'all';
export const CF_LABELS: Record<CfKey, string> = {
  stop: `손절 ${CF_STOP_ATR}×1H ATR`,
  revenge: '복수 매매 빼기',
  maker: '진입 지정가(메이커)',
  all: '전부 적용',
};

export interface CfRule {
  key: CfKey;
  net: number;
  /** net − 실제 */
  delta: number;
  /** 결과가 바뀐 매매 수(복수 매매는 뺀 건수) */
  affected: number;
}

export interface CfSummary {
  n: number;
  actual: number;
  rules: Record<CfKey, CfRule>;
  /** 손절 규칙: 판정 가능 / 맞음 / 그중 손해(실제가 더 나았음 — 반등 놓침) / 이득 */
  stopKnown: number;
  stopHits: number;
  stopHurt: number;
  stopHelped: number;
  stopHurtUsdt: number;
  stopHelpedUsdt: number;
  /** 개별 규칙(a~c) 중 절대 효과가 가장 큰 것 — 모두 0이면 null */
  biggest: Exclude<CfKey, 'all'> | null;
}

const EPS = 0.005;

export function counterfactual(trades: CfTrade[], stops: Record<string, StopCheck | undefined>, makerRate = CF_MAKER_RATE): CfSummary {
  const actual = trades.reduce((a, t) => a + t.netProfit, 0);
  const rev = revengeIds(trades);

  let stopTotal = 0, stopAffected = 0, stopKnown = 0, stopHits = 0, hurt = 0, helped = 0, hurtU = 0, helpedU = 0;
  let makerTotal = 0, makerAffected = 0;
  let revTotal = 0;
  let allTotal = 0, allAffected = 0;

  for (const t of trades) {
    const s = stops[t.id];
    const sn = stopNet(t, s);
    if (s && s.status !== 'unknown') stopKnown++;
    if (s?.status === 'hit') {
      stopHits++;
      const d = sn - t.netProfit;
      if (d < -EPS) { hurt++; hurtU += d; } else if (d > EPS) { helped++; helpedU += d; }
    }
    if (Math.abs(sn - t.netProfit) > EPS) stopAffected++;
    stopTotal += sn;

    const save = makerEntrySaving(t, makerRate);
    if (save > EPS) makerAffected++;
    makerTotal += t.netProfit + save;

    if (!rev.has(t.id)) revTotal += t.netProfit;

    if (rev.has(t.id)) { allAffected++; continue; }
    const all = sn + save;
    if (Math.abs(all - t.netProfit) > EPS) allAffected++;
    allTotal += all;
  }

  const rule = (key: CfKey, net: number, affected: number): CfRule => ({ key, net, delta: net - actual, affected });
  const rules: Record<CfKey, CfRule> = {
    stop: rule('stop', stopTotal, stopAffected),
    revenge: rule('revenge', revTotal, rev.size),
    maker: rule('maker', makerTotal, makerAffected),
    all: rule('all', allTotal, allAffected),
  };
  const singles = (['stop', 'revenge', 'maker'] as const).filter((k) => Math.abs(rules[k].delta) > EPS);
  const biggest = singles.length ? singles.reduce((b, k) => (Math.abs(rules[k].delta) > Math.abs(rules[b].delta) ? k : b)) : null;

  return {
    n: trades.length, actual, rules,
    stopKnown, stopHits, stopHurt: hurt, stopHelped: helped, stopHurtUsdt: hurtU, stopHelpedUsdt: helpedU,
    biggest,
  };
}

/** 가장 크게 작용한 규칙 한 문장(가정 계산임을 문장 안에 둔다) */
export function cfHeadline(s: CfSummary, fmt: (n: number) => string = (n) => n.toFixed(2)): string {
  if (!s.n) return '';
  if (!s.biggest) return '이 기간에는 세 규칙 모두 결과를 바꾸지 않았습니다(가정 계산).';
  const r = s.rules[s.biggest];
  const sign = r.delta >= 0 ? '+' : '−';
  const dir = r.delta >= 0 ? '가장 크게 개선' : '가장 크게 악화';
  return `가정 계산상 ${CF_LABELS[s.biggest]} 규칙이 ${dir}했습니다(${sign}${fmt(Math.abs(r.delta))} USDT, ${r.affected}건 영향).`;
}
