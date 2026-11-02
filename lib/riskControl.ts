/**
 * 개인 위험관리 엔진 — 손절 기준 포지션 크기 + 진입 가능 여부(ALLOW / WAIT / BLOCK). 순수 함수.
 * 테스트: tests/riskControl.test.ts · 화면: /risk-control (기존 화면은 건드리지 않는다)
 *
 * 원칙
 *  - 포지션 크기는 **손절 시 허용 손실액**에서 역산한다. 레버리지는 필요 증거금만 바꾼다
 *    (같은 명목가치·같은 손절가면 5배든 10배든 가격 변동 손익은 같다 — 10배가 허용 손실을 키우지 않는다).
 *  - 손절 손실에는 진입·청산 수수료, 예상 슬리피지, 내야 할 펀딩을 넣는다(받을 펀딩은 빼지 않는다 = 보수적).
 *  - ALLOW 는 "설정한 위험관리 조건을 충족"이라는 뜻일 뿐 **수익 신호가 아니다**. 승률·점수를 만들지 않는다.
 *  - 필요한 데이터가 없거나 오래됐으면 임의 값으로 채우지 않고 WAIT 와 이유를 돌려준다.
 *  - 기존 재사용: 연속 손절·일일·주간 실현손익 = lib/circuitBreaker.evaluateBreaker,
 *    청산가 근사 = lib/positionSizing.isolatedLiqPrice. 기존 tradeGate(시뮬레이터 Go/No-Go)는 그대로 둔다.
 *  - 거래소 청산가는 마크가격·유지증거금 티어·마진 모드에 따라 달라 여기 값은 '단순 근사'로만 쓴다.
 */
import { evaluateBreaker, type BreakerEntry } from './circuitBreaker';
import { isolatedLiqPrice } from './positionSizing';
import { eventWindow, coReleases, humanMin, fmtKst, type MacroEvent, type EventWindowState } from './macroSchedule';

/* ── 설정 ─────────────────────────────────────────────── */
export interface RiskSettings {
  defaultLeverage: number;       // 기본 5
  maxLeverage: number;           // 최대 10 (하드 상한 10)
  riskPerTradePct: number;       // 거래당 계좌 위험 % (0.5)
  dailyLossPct: number;          // 일일 최대 손실 % (2)
  weeklyLossPct: number;         // 주간(최근 7일) 최대 손실 % (5)
  maxConsecutiveLosses: number;  // 연속 손절 제한 (3)
  minNetRR: number;              // 수수료 반영 최소 손익비 (1.5)
  maxTotalRiskPct: number;       // 동시 포지션 전체 위험 한도 % (1)
  takerFeePct: number;           // 시장가 수수료 % (Bitget 표준 0.06)
  makerFeePct: number;           // 지정가 수수료 % (0.02)
  slippagePct: number;           // 시장가 체결 1회당 예상 슬리피지 % (0.05)
  holdHours: number;             // 예상 보유 시간 — 펀딩 비용 추정용 (8)
  eventPreMin: number;           // 중요 발표 전 관망(분) 60
  eventPostMin: number;          // 발표 후 관망(분) 30
  eventExtendMaxMin: number;     // 변동성 정상화 확인 최대 구간(분) 120
  volNormalMult: number;         // 최근 5분봉 변동폭 ÷ 발표 전 기준 이 배수 이하면 정상화 (2)
  maxSpreadBps: number;          // 호가 스프레드 상한(bp) 5
  volSpikeMult: number;          // 직전 1시간봉 변동폭 ÷ 24시간 중앙값 이 배수 이상이면 급변 (3)
  fundingHotAnnualPct: number;   // 내 방향이 내는 펀딩이 연환산 이 % 이상이면 과열 (30)
  maxDataAgeSec: number;         // 시세 데이터 허용 지연(초) 120
  counterTrend: 'wait' | 'note'; // 4H·1D 둘 다 반대 방향 진입 처리 (기본 wait — 기존 가드 '추세 역행 진입' 규율과 같은 취지)
  rrShortfall: 'wait' | 'block'; // 순손익비 미달 처리 (기본 wait)
}

export const HARD_MAX_LEVERAGE = 10;
export const HARD_MAX_RISK_PCT = 2;

export const DEFAULT_RISK_SETTINGS: RiskSettings = {
  defaultLeverage: 5, maxLeverage: 10,
  riskPerTradePct: 0.5, dailyLossPct: 2, weeklyLossPct: 5, maxConsecutiveLosses: 3,
  minNetRR: 1.5, maxTotalRiskPct: 1,
  takerFeePct: 0.06, makerFeePct: 0.02, slippagePct: 0.05, holdHours: 8,
  eventPreMin: 60, eventPostMin: 30, eventExtendMaxMin: 120, volNormalMult: 2,
  maxSpreadBps: 5, volSpikeMult: 3, fundingHotAnnualPct: 30, maxDataAgeSec: 120,
  counterTrend: 'wait', rrShortfall: 'wait',
};

const clampN = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

/** 저장값·입력값을 안전한 범위로. 최대 레버리지 10배·거래당 위험 2% 는 넘길 수 없다 */
export function sanitizeSettings(raw: unknown): RiskSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof RiskSettings, unknown>>;
  const D = DEFAULT_RISK_SETTINGS;
  const maxLeverage = clampN(r.maxLeverage, 1, HARD_MAX_LEVERAGE, D.maxLeverage);
  return {
    defaultLeverage: clampN(r.defaultLeverage, 1, maxLeverage, Math.min(D.defaultLeverage, maxLeverage)),
    maxLeverage,
    riskPerTradePct: clampN(r.riskPerTradePct, 0.05, HARD_MAX_RISK_PCT, D.riskPerTradePct),
    dailyLossPct: clampN(r.dailyLossPct, 0.1, 20, D.dailyLossPct),
    weeklyLossPct: clampN(r.weeklyLossPct, 0.1, 50, D.weeklyLossPct),
    maxConsecutiveLosses: Math.round(clampN(r.maxConsecutiveLosses, 1, 20, D.maxConsecutiveLosses)),
    minNetRR: clampN(r.minNetRR, 0.1, 10, D.minNetRR),
    maxTotalRiskPct: clampN(r.maxTotalRiskPct, 0.05, 20, D.maxTotalRiskPct),
    takerFeePct: clampN(r.takerFeePct, 0, 1, D.takerFeePct),
    makerFeePct: clampN(r.makerFeePct, -0.1, 1, D.makerFeePct),
    slippagePct: clampN(r.slippagePct, 0, 2, D.slippagePct),
    holdHours: clampN(r.holdHours, 0, 24 * 30, D.holdHours),
    eventPreMin: clampN(r.eventPreMin, 0, 24 * 60, D.eventPreMin),
    eventPostMin: clampN(r.eventPostMin, 0, 24 * 60, D.eventPostMin),
    eventExtendMaxMin: clampN(r.eventExtendMaxMin, 0, 24 * 60, D.eventExtendMaxMin),
    volNormalMult: clampN(r.volNormalMult, 1, 20, D.volNormalMult),
    maxSpreadBps: clampN(r.maxSpreadBps, 0.1, 500, D.maxSpreadBps),
    volSpikeMult: clampN(r.volSpikeMult, 1, 50, D.volSpikeMult),
    fundingHotAnnualPct: clampN(r.fundingHotAnnualPct, 1, 1000, D.fundingHotAnnualPct),
    maxDataAgeSec: clampN(r.maxDataAgeSec, 5, 3600, D.maxDataAgeSec),
    counterTrend: r.counterTrend === 'note' ? 'note' : 'wait',
    rrShortfall: r.rrShortfall === 'block' ? 'block' : 'wait',
  };
}

/* ── 포지션 크기 ───────────────────────────────────────── */
export type Direction = 'long' | 'short';
export interface PlanInput {
  equity: number;                  // 계좌 총자산(USDT)
  direction: Direction;
  entry: number;
  stop: number | null;
  target: number | null;
  leverage: number;
  entryOrder: 'market' | 'limit';  // 진입 주문 — 시장가면 테이커 수수료+슬리피지
  targetOrder: 'limit' | 'market'; // 목표 청산 — 지정가면 메이커, 손절은 항상 시장가(테이커+슬리피지)
  /** 펀딩(소수, 정산 1회분)과 정산 주기(시간). 없으면 펀딩 비용 0으로 두지 않고 fundingKnown=false 로 표시 */
  fundingRate: number | null;
  fundingIntervalH: number | null;
  /** 이 거래에 쓸 수 있는 최대 위험(USDT). 일일 남은 한도·전체 위험 한도로 줄일 때 넣는다 */
  riskCapUsdt?: number | null;
}

export interface Sizing {
  ok: boolean;
  error: string | null;
  riskBudget: number;          // 이 거래 허용 손실(USDT)
  riskBudgetBase: number;      // 설정만으로 본 허용 손실(축소 전)
  capped: boolean;             // 남은 한도 때문에 줄었는가
  stopDistPct: number;
  qty: number;                 // 코인 수량
  notional: number;            // 명목가치(USDT)
  margin: number;              // 선택 레버리지 기준 필요 증거금
  marginAt: { lev: number; margin: number }[]; // 기본·최대 레버리지별 증거금(같은 수량)
  /** 손절 시 순손실(양수, USDT) — 가격손실+수수료+슬리피지+낼 펀딩 */
  netLossAtStop: number;
  /** 목표 도달 시 순이익(USDT) — 목표 없으면 null */
  netProfitAtTarget: number | null;
  grossRR: number | null;
  netRR: number | null;
  riskPctOfEquity: number;
  costs: {
    entryFee: number; stopExitFee: number; targetExitFee: number | null;
    slippageStop: number; slippageTarget: number | null;
    fundingCost: number;        // 낼 것으로 추정되는 펀딩(≥0)
    fundingKnown: boolean;
  };
  /** 단순 격리 청산가 근사(MMR 0.5%) — 거래소 실제 값 아님 */
  liqApprox: number;
  stopBeyondLiq: boolean;
}

const EMPTY_COSTS: Sizing['costs'] = { entryFee: 0, stopExitFee: 0, targetExitFee: null, slippageStop: 0, slippageTarget: null, fundingCost: 0, fundingKnown: false };
function fail(error: string, base = 0): Sizing {
  return { ok: false, error, riskBudget: 0, riskBudgetBase: base, capped: false, stopDistPct: 0, qty: 0, notional: 0, margin: 0, marginAt: [], netLossAtStop: 0, netProfitAtTarget: null, grossRR: null, netRR: null, riskPctOfEquity: 0, costs: EMPTY_COSTS, liqApprox: 0, stopBeyondLiq: false };
}

/** 내 방향이 내야 하는 펀딩 비율(보유 시간 동안, 소수). 받는 쪽이면 0 */
export function fundingPayFraction(direction: Direction, rate: number | null, intervalH: number | null, holdHours: number): number | null {
  if (rate == null || !intervalH || intervalH <= 0) return null;
  const pay = direction === 'long' ? rate : -rate;
  return pay > 0 ? pay * (holdHours / intervalH) : 0;
}

export function sizePosition(p: PlanInput, s: RiskSettings): Sizing {
  const base = p.equity > 0 ? (p.equity * s.riskPerTradePct) / 100 : 0;
  if (!(p.equity > 0)) return fail('계좌 자산이 없습니다.');
  if (!(p.entry > 0)) return fail('진입가가 없습니다.', base);
  if (p.stop == null || !(p.stop > 0)) return fail('손절가가 없습니다.', base);
  const long = p.direction === 'long';
  if (long ? p.stop >= p.entry : p.stop <= p.entry) return fail(long ? '롱인데 손절가가 진입가 이상입니다.' : '숏인데 손절가가 진입가 이하입니다.', base);
  if (p.target != null && p.target > 0 && (long ? p.target <= p.entry : p.target >= p.entry)) return fail(long ? '롱인데 목표가가 진입가 이하입니다.' : '숏인데 목표가가 진입가 이상입니다.', base);
  if (!(p.leverage > 0)) return fail('레버리지가 없습니다.', base);

  const cap = p.riskCapUsdt == null ? Infinity : Math.max(0, p.riskCapUsdt);
  const budget = Math.min(base, cap);
  const capped = budget < base;

  const taker = s.takerFeePct / 100, maker = s.makerFeePct / 100, slip = s.slippagePct / 100;
  const inFee = p.entryOrder === 'market' ? taker : maker;
  const inSlip = p.entryOrder === 'market' ? slip : 0;
  const fundFrac = fundingPayFraction(p.direction, p.fundingRate, p.fundingIntervalH, s.holdHours);
  const fund = fundFrac ?? 0;

  // 코인 1개당 손절 시 순손실 = 가격거리 + 진입수수료 + 손절(시장가)수수료 + 슬리피지(진입·손절) + 낼 펀딩
  const perUnitLoss = Math.abs(p.entry - p.stop) + p.entry * inFee + p.stop * taker + p.entry * inSlip + p.stop * slip + p.entry * fund;
  if (!(budget > 0)) return fail(capped ? '남은 손실 한도가 없습니다.' : '허용 손실이 0입니다.', base);
  const qty = budget / perUnitLoss;
  const notional = qty * p.entry;

  let netProfitAtTarget: number | null = null, grossRR: number | null = null, netRR: number | null = null;
  let targetExitFee: number | null = null, slippageTarget: number | null = null;
  if (p.target != null && p.target > 0) {
    const outFee = p.targetOrder === 'market' ? taker : maker;
    const outSlip = p.targetOrder === 'market' ? slip : 0;
    targetExitFee = qty * p.target * outFee;
    slippageTarget = qty * (p.entry * inSlip + p.target * outSlip);
    const perUnitProfit = Math.abs(p.target - p.entry) - p.entry * inFee - p.target * outFee - p.entry * inSlip - p.target * outSlip - p.entry * fund;
    netProfitAtTarget = qty * perUnitProfit;
    grossRR = Math.abs(p.target - p.entry) / Math.abs(p.entry - p.stop);
    netRR = perUnitProfit / perUnitLoss;
  }

  const levs = [...new Set([s.defaultLeverage, s.maxLeverage, p.leverage])].filter((l) => l > 0).sort((a, b) => a - b);
  const liqApprox = isolatedLiqPrice(p.entry, p.leverage, !long);
  const stopBeyondLiq = long ? p.stop <= liqApprox : p.stop >= liqApprox;
  return {
    ok: true, error: null,
    riskBudget: budget, riskBudgetBase: base, capped,
    stopDistPct: (Math.abs(p.entry - p.stop) / p.entry) * 100,
    qty, notional, margin: notional / p.leverage,
    marginAt: levs.map((lev) => ({ lev, margin: notional / lev })),
    netLossAtStop: qty * perUnitLoss,
    netProfitAtTarget, grossRR, netRR,
    riskPctOfEquity: ((qty * perUnitLoss) / p.equity) * 100,
    costs: {
      entryFee: qty * p.entry * inFee, stopExitFee: qty * p.stop * taker, targetExitFee,
      slippageStop: qty * (p.entry * inSlip + p.stop * slip), slippageTarget,
      fundingCost: qty * p.entry * fund, fundingKnown: fundFrac != null,
    },
    liqApprox, stopBeyondLiq,
  };
}

/* ── 계좌·시장 맥락 ─────────────────────────────────────── */
export interface OpenRisk { symbol: string; side: Direction; riskUsdt: number | null; note?: string }
export interface AccountContext {
  equity: number | null;
  equitySource: 'bitget' | 'manual' | null;
  /** 청산된 매매(시간순 무관) — Bitget 청산 포지션 또는 매매일지. null = 못 읽음 */
  closed: BreakerEntry[] | null;
  closedSource: 'bitget' | 'journal' | null;
  /** 열린 포지션별 손절까지 위험. riskUsdt=null 이면 손절 미확인. null = 못 읽음 */
  open: OpenRisk[] | null;
}

export type Trend = 'up' | 'down' | 'flat';
export interface MarketContext {
  symbol: string;
  fetchedAt: number;                 // 서버가 데이터를 가져온 시각
  price: number | null; priceTs: number | null;
  bid: number | null; ask: number | null;
  fundingRate: number | null; fundingIntervalH: number | null;
  trend4h: Trend | null; trend1d: Trend | null;
  last4hCloseTs: number | null;      // 마지막 '마감된' 4H 봉의 마감 시각
  last1dCloseTs: number | null;
  support: number | null; resistance: number | null; // 현재가 아래·위 가장 가까운 구조 레벨(4H)
  volumeRatio1h: number | null;      // 직전 마감 1H 거래량 ÷ 20봉 평균
  volSpike1h: number | null;         // 직전 마감 1H 변동폭 ÷ 이전 24봉 중앙값
  oiChange24hPct: number | null;     // 바이낸스 OI(코인 수량) 24h 변화
  priceChange24hPct: number | null;
  /** 5분봉 변동폭 — 최근 3봉 중앙값과 그 이전 시계열(발표 전 기준 계산용) */
  m5: { ts: number; range: number }[] | null;
  errors: string[];
}

export type Verdict = 'ALLOW' | 'WAIT' | 'BLOCK';
export type ReasonLevel = 'block' | 'wait' | 'note' | 'ok';
export interface Reason { code: string; group: CheckGroup; level: ReasonLevel; text: string }
export type CheckGroup = 'trend4h' | 'trend1d' | 'levels' | 'volumeOi' | 'funding' | 'rr' | 'overlap' | 'macro' | 'daily' | 'streak' | 'data' | 'plan';
export const CHECK_LABEL: Record<CheckGroup, string> = {
  plan: '손절·레버리지·증거금', trend4h: '4시간봉 추세 구조', trend1d: '1일봉 추세 구조', levels: '주요 지지·저항',
  volumeOi: '거래량·미결제약정', funding: '펀딩비 과열', rr: '수수료 반영 손익비', overlap: '기존 포지션 위험 중복',
  macro: '거시경제 발표 일정', daily: '일일·주간 손실 한도', streak: '연속 손절', data: '데이터 신선도·누락',
};

export interface EntryInput {
  plan: PlanInput;
  settings: RiskSettings;
  account: AccountContext;
  market: MarketContext | null;
  /** null = 일정 못 불러옴 */
  events: MacroEvent[] | null;
  now: number;
}
export interface EntryDecision {
  verdict: Verdict;
  headline: string;
  reasons: Reason[];
  sizing: Sizing;
  budget: {
    dailyLimitUsdt: number | null; todayRealized: number | null; dailyRemaining: number | null;
    weeklyLimitUsdt: number | null; weekRealized: number | null;
    lossStreak: number | null;
    openRiskUsdt: number | null; totalRiskLimitUsdt: number | null; totalRiskRemaining: number | null;
  };
  eventState: EventWindowState | null;
}

const usd = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(Math.abs(v) >= 100 ? 0 : 2)} USDT`;
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const a = [...xs].sort((x, y) => x - y), m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** 발표 후 변동성 정상화 — 최근 5분봉 3개 변동폭 중앙값 ÷ 발표 전 60분(5~60분 전) 중앙값 */
export function postEventVolRatio(m5: { ts: number; range: number }[] | null, eventTs: number, now: number): number | null {
  if (!m5?.length) return null;
  const closed = m5.filter((b) => b.ts + 5 * 60_000 <= now);
  const pre = closed.filter((b) => b.ts >= eventTs - 65 * 60_000 && b.ts + 5 * 60_000 <= eventTs - 5 * 60_000).map((b) => b.range);
  const recent = closed.filter((b) => b.ts >= eventTs).slice(-3).map((b) => b.range);
  if (pre.length < 6 || recent.length < 3) return null;
  const base = median(pre);
  return base > 0 ? median(recent) / base : null;
}

export function evaluateEntry(inp: EntryInput): EntryDecision {
  const { plan, settings: s, account, market, events, now } = inp;
  const R: Reason[] = [];
  const add = (group: CheckGroup, level: ReasonLevel, code: string, text: string) => R.push({ group, level, code, text });
  const equity = plan.equity > 0 ? plan.equity : null;

  /* 1) 손실 한도·연속 손절 — 과거 사실(산수) */
  let todayRealized: number | null = null, weekRealized: number | null = null, lossStreak: number | null = null;
  const dailyLimitUsdt = equity ? (equity * s.dailyLossPct) / 100 : null;
  const weeklyLimitUsdt = equity ? (equity * s.weeklyLossPct) / 100 : null;
  let dailyRemaining: number | null = null;
  if (account.closed) {
    const b = evaluateBreaker(account.closed, { maxConsecutiveLosses: s.maxConsecutiveLosses, dailyLossLimitUsdt: dailyLimitUsdt, weeklyLossLimitUsdt: weeklyLimitUsdt, perTradeLossLimitUsdt: null }, now);
    todayRealized = b.todayRealized ?? 0; weekRealized = b.weekRealized ?? 0; lossStreak = b.lossStreak;
    const src = account.closedSource === 'bitget' ? '거래소 청산 기록' : '매매일지';
    if (lossStreak >= s.maxConsecutiveLosses) add('streak', 'block', 'streak', `${lossStreak}연속 손절(제한 ${s.maxConsecutiveLosses}회) — 오늘은 신규 진입을 멈추세요. (${src})`);
    else add('streak', 'ok', 'streak-ok', `현재 연속 손절 ${lossStreak}회 / 제한 ${s.maxConsecutiveLosses}회 (${src})`);
    if (dailyLimitUsdt != null) {
      dailyRemaining = dailyLimitUsdt + Math.min(0, todayRealized);
      if (todayRealized <= -dailyLimitUsdt) add('daily', 'block', 'daily', `오늘(KST) 실현손익 ${usd(todayRealized)} — 일일 한도 −${usd(dailyLimitUsdt)}(계좌 ${s.dailyLossPct}%) 도달.`);
      else add('daily', 'ok', 'daily-ok', `오늘 실현 ${usd(todayRealized)} · 남은 일일 손실 허용 ${usd(dailyRemaining)}`);
    }
    if (weeklyLimitUsdt != null && weekRealized <= -weeklyLimitUsdt) add('daily', 'block', 'weekly', `최근 7일 실현손익 ${usd(weekRealized)} — 주간 한도 −${usd(weeklyLimitUsdt)}(계좌 ${s.weeklyLossPct}%) 도달.`);
  } else {
    add('daily', 'wait', 'closed-missing', '청산 기록을 읽지 못해 일일 손실·연속 손절을 확인할 수 없습니다(거래소 연결 또는 매매일지 필요).');
  }

  /* 2) 기존 포지션 위험 중복 — 전체 동시 위험 한도 */
  let openRiskUsdt: number | null = null;
  const totalRiskLimitUsdt = equity ? (equity * s.maxTotalRiskPct) / 100 : null;
  let totalRiskRemaining: number | null = null;
  if (account.open) {
    const unknown = account.open.filter((o) => o.riskUsdt == null);
    openRiskUsdt = account.open.reduce((a, o) => a + Math.max(0, o.riskUsdt ?? 0), 0);
    if (unknown.length) add('overlap', 'wait', 'open-unknown', `손절가를 확인할 수 없는 열린 포지션 ${unknown.map((o) => `${o.symbol} ${o.side === 'long' ? '롱' : '숏'}`).join(', ')} — 전체 위험을 계산할 수 없습니다. 기존 포지션 손절부터 정하세요.`);
    const same = account.open.filter((o) => o.side === plan.direction).length;
    if (totalRiskLimitUsdt != null) {
      totalRiskRemaining = totalRiskLimitUsdt - openRiskUsdt;
      if (totalRiskRemaining <= 0) add('overlap', 'block', 'total-risk', `열린 포지션 위험 ${usd(openRiskUsdt)} — 전체 한도 ${usd(totalRiskLimitUsdt)}(계좌 ${s.maxTotalRiskPct}%) 소진.`);
      else add('overlap', 'ok', 'total-risk-ok', `열린 포지션 위험 ${usd(openRiskUsdt)} / 전체 한도 ${usd(totalRiskLimitUsdt)}${same ? ` · 같은 방향 ${same}건(같은 베팅을 키우는 것)` : ''}`);
    }
  } else {
    add('overlap', 'wait', 'open-missing', '열린 포지션을 읽지 못해 위험 중복을 확인할 수 없습니다.');
  }

  /* 3) 포지션 크기 — 남은 일일 한도·전체 위험 한도로 축소 */
  const caps = [dailyRemaining, totalRiskRemaining].filter((v): v is number => v != null);
  const riskCapUsdt = caps.length ? Math.max(0, Math.min(...caps)) : null;
  const sizing = sizePosition({ ...plan, riskCapUsdt, fundingRate: plan.fundingRate ?? market?.fundingRate ?? null, fundingIntervalH: plan.fundingIntervalH ?? market?.fundingIntervalH ?? null }, s);

  /* 4) 계획 자체 — 손절·레버리지·증거금·청산 */
  if (plan.stop == null || !(plan.stop > 0)) add('plan', 'block', 'no-stop', '손절가가 없습니다 — 손절 없는 진입은 최대 손실이 정해지지 않습니다.');
  if (plan.leverage > s.maxLeverage) add('plan', 'block', 'lev-max', `레버리지 ${plan.leverage}배 — 최대 ${s.maxLeverage}배 초과.`);
  else if (!(plan.leverage >= 1)) add('plan', 'block', 'lev-bad', '레버리지는 1배 이상이어야 합니다.');
  if (!equity) add('plan', 'wait', 'equity-missing', '계좌 자산을 알 수 없어 포지션 크기를 계산할 수 없습니다.');
  if (!sizing.ok && equity && plan.stop != null && plan.stop > 0) {
    add('plan', 'block', 'sizing', sizing.error ?? '포지션 크기를 계산할 수 없습니다.');
  }
  if (sizing.ok) {
    if (sizing.capped) add('plan', 'note', 'capped', `남은 한도 때문에 허용 손실을 ${usd(sizing.riskBudgetBase)} → ${usd(sizing.riskBudget)}로 줄여 크기를 계산했습니다.`);
    if (equity && sizing.margin > equity) add('plan', 'block', 'margin', `필요 증거금 ${usd(sizing.margin)}이 계좌 자산 ${usd(equity)}을 넘습니다 — 손절폭이 너무 좁거나 레버리지가 낮습니다.`);
    if (sizing.stopBeyondLiq) add('plan', 'block', 'liq', `${plan.leverage}배에서 단순 청산가 근사(${sizing.liqApprox.toFixed(2)})가 손절가보다 먼저 옵니다 — 손절 전에 청산될 수 있습니다.`);
    if (!sizing.costs.fundingKnown) add('funding', 'wait', 'funding-missing', '펀딩비를 읽지 못해 보유 비용을 계산하지 못했습니다.');
    else if (!R.some((r) => r.level === 'block' && r.group === 'plan')) add('plan', 'ok', 'plan-ok', `손절거리 ${sizing.stopDistPct.toFixed(2)}% · 손절 시 순손실 ${usd(sizing.netLossAtStop)}(계좌 ${sizing.riskPctOfEquity.toFixed(2)}%)`);
  }

  /* 5) 손익비(수수료·슬리피지·펀딩 반영) */
  if (plan.target == null || !(plan.target > 0)) add('rr', 'wait', 'no-target', '목표가가 없어 수수료 반영 손익비를 확인할 수 없습니다.');
  else if (sizing.ok && sizing.netRR != null) {
    if (sizing.netRR <= 0) add('rr', 'block', 'rr-negative', `비용을 빼면 목표가에 도달해도 손실입니다(순손익비 ${sizing.netRR.toFixed(2)}).`);
    else if (sizing.netRR < s.minNetRR) add('rr', s.rrShortfall === 'block' ? 'block' : 'wait', 'rr-low', `순손익비 1 : ${sizing.netRR.toFixed(2)} (명목 1 : ${sizing.grossRR!.toFixed(2)}) — 최소 1 : ${s.minNetRR} 미달.`);
    else add('rr', 'ok', 'rr-ok', `순손익비 1 : ${sizing.netRR.toFixed(2)} (명목 1 : ${sizing.grossRR!.toFixed(2)}) ≥ 1 : ${s.minNetRR}`);
  }

  /* 6) 거시경제 발표 */
  let ew: EventWindowState | null = null;
  if (!events) add('macro', 'wait', 'events-missing', '경제지표 일정을 불러오지 못했습니다 — 발표 임박 여부를 모르므로 관망.');
  else {
    ew = eventWindow(events, now, { preMin: s.eventPreMin, postMin: s.eventPostMin, extendMaxMin: s.eventExtendMaxMin });
    const co = (e: MacroEvent) => { const c = coReleases(events, e); return c.length ? ` · 동시 발표: ${c.map((x) => x.title).join(', ')}` : ''; };
    if (ew.state === 'pre') add('macro', 'wait', 'event-pre', `${ew.event.title} 발표 ${humanMin(ew.minutes)} 전(${fmtKst(ew.event.ts)} KST) — 발표 ${s.eventPreMin}분 전부터 신규 진입 관망${co(ew.event)}.`);
    else if (ew.state === 'post') add('macro', 'wait', 'event-post', `${ew.event.title} 발표 후 ${humanMin(ew.minutes)} — 발표 후 ${s.eventPostMin}분은 관망${co(ew.event)}.`);
    else if (ew.state === 'settling') {
      const ratio = postEventVolRatio(market?.m5 ?? null, ew.event.ts, now);
      if (ratio == null) add('macro', 'wait', 'event-vol-unknown', `${ew.event.title} 발표 후 ${humanMin(ew.minutes)} — 변동성 정상화를 확인할 5분봉이 부족해 관망 연장.`);
      else if (ratio > s.volNormalMult) add('macro', 'wait', 'event-vol-high', `${ew.event.title} 발표 후 ${humanMin(ew.minutes)} — 최근 5분봉 변동폭이 발표 전의 ${ratio.toFixed(1)}배(기준 ${s.volNormalMult}배 이하) — 관망 연장.`);
      else add('macro', 'ok', 'event-vol-ok', `${ew.event.title} 발표 후 ${humanMin(ew.minutes)} — 변동폭 발표 전의 ${ratio.toFixed(1)}배로 정상화.`);
    } else add('macro', 'ok', 'event-clear', ew.next ? `다음 중요 발표: ${ew.next.title} ${fmtKst(ew.next.ts)} KST (${humanMin(ew.minutesToNext!)} 후)` : '예정된 중요 발표 없음(불러온 일정 기준)');
  }

  /* 7) 시장 데이터 — 신선도·추세·레벨·거래량/OI·펀딩·스프레드 */
  if (!market) add('data', 'wait', 'market-missing', '시세 데이터를 불러오지 못했습니다.');
  else {
    const age = market.priceTs != null ? (now - market.priceTs) / 1000 : null;
    if (market.price == null || age == null) add('data', 'wait', 'price-missing', '현재가가 없습니다.');
    else if (age > s.maxDataAgeSec) add('data', 'wait', 'price-stale', `시세가 ${Math.round(age)}초 전 값입니다(허용 ${s.maxDataAgeSec}초) — 새로 불러오세요.`);
    else add('data', 'ok', 'price-ok', `시세 ${Math.round(Math.max(0, age))}초 전 · 데이터 누락 ${market.errors.length}건`);
    // 4H 봉: 마지막 마감 봉이 8시간 넘게 지났으면(=한 봉 이상 빠짐) 오래된 것
    if (market.last4hCloseTs != null && now - market.last4hCloseTs > 8 * 3600_000) add('data', 'wait', 'c4h-stale', '4시간봉이 최신이 아닙니다.');
    if (market.last1dCloseTs != null && now - market.last1dCloseTs > 48 * 3600_000) add('data', 'wait', 'c1d-stale', '1일봉이 최신이 아닙니다.');
    for (const e of market.errors) add('data', 'note', 'src-error', `일부 데이터 실패: ${e}`);

    // 스프레드·직전 1시간 급변 — 슬리피지 위험(방향과 무관)
    if (market.bid != null && market.ask != null && market.bid > 0) {
      const bps = ((market.ask - market.bid) / ((market.ask + market.bid) / 2)) * 10_000;
      if (bps > s.maxSpreadBps) add('data', 'wait', 'spread', `호가 스프레드 ${bps.toFixed(1)}bp(상한 ${s.maxSpreadBps}bp) — 슬리피지가 큽니다.`);
    } else add('data', 'wait', 'spread-missing', '호가(매수·매도)가 없어 스프레드를 확인할 수 없습니다.');

    const dirKo = plan.direction === 'long' ? '롱' : '숏';
    const against = (t: Trend | null) => t != null && ((plan.direction === 'long' && t === 'down') || (plan.direction === 'short' && t === 'up'));
    const trendKo = (t: Trend | null) => (t === 'up' ? '상승' : t === 'down' ? '하락' : t === 'flat' ? '혼조·횡보' : '—');
    for (const [g, t, name] of [['trend4h', market.trend4h, '4H'], ['trend1d', market.trend1d, '1D']] as const) {
      if (t == null) add(g, 'wait', `${g}-missing`, `${name} 봉이 부족해 추세 구조를 판단할 수 없습니다.`);
      else add(g, against(t) ? 'note' : 'ok', `${g}`, `${name} ${trendKo(t)}(EMA 정·역배열+EMA20 위치) — ${against(t) ? `${dirKo}은 역방향` : t === 'flat' ? '뚜렷한 방향 없음' : `${dirKo}과 같은 방향`}`);
    }
    if (against(market.trend4h) && against(market.trend1d)) {
      add('trend4h', s.counterTrend === 'wait' ? 'wait' : 'note', 'counter-both', `4H·1D 모두 ${dirKo} 역방향 — 기존 가드의 '추세 역행 진입' 규율과 같은 기준으로 ${s.counterTrend === 'wait' ? '관망' : '주의'}.`);
    }

    // 지지·저항 — 목표가가 가까운 반대 레벨 너머면 알림(판정 아님)
    const lv = plan.direction === 'long' ? market.resistance : market.support;
    if (market.support == null && market.resistance == null) add('levels', 'note', 'levels-missing', '4H 구조 레벨을 찾지 못했습니다.');
    else {
      const t = plan.target;
      const beyond = lv != null && t != null && t > 0 && (plan.direction === 'long' ? t > lv : t < lv);
      add('levels', beyond ? 'note' : 'ok', 'levels', `지지 ${market.support?.toFixed(2) ?? '—'} · 저항 ${market.resistance?.toFixed(2) ?? '—'}${beyond ? ` — 목표가가 가까운 ${plan.direction === 'long' ? '저항' : '지지'}(${lv!.toFixed(2)}) 너머` : ''}`);
      if (lv != null && sizing.ok && plan.target != null) {
        // 진입가가 반대 레벨에 너무 붙어 있으면(손절거리의 30% 이내) 알림
        const gap = Math.abs(lv - plan.entry), risk = Math.abs(plan.entry - (plan.stop ?? plan.entry));
        if (risk > 0 && gap < risk * 0.3) add('levels', 'note', 'levels-tight', `진입가가 ${plan.direction === 'long' ? '저항' : '지지'}(${lv.toFixed(2)})에 손절거리의 ${(gap / risk * 100).toFixed(0)}% 거리로 붙어 있습니다.`);
      }
    }

    // 거래량·OI — 급변이면 관망, 나머지는 설명
    if (market.volSpike1h != null && market.volSpike1h >= s.volSpikeMult) add('volumeOi', 'wait', 'vol-spike', `직전 1시간봉 변동폭이 24시간 중앙값의 ${market.volSpike1h.toFixed(1)}배 — 급변 직후라 관망(기준 ${s.volSpikeMult}배).`);
    const vr = market.volumeRatio1h, oi = market.oiChange24hPct, pc = market.priceChange24hPct;
    if (vr == null && oi == null) add('volumeOi', 'wait', 'vol-oi-missing', '거래량·미결제약정 데이터가 없습니다.');
    else add('volumeOi', 'ok', 'vol-oi', `직전 1H 거래량 20봉 평균의 ${vr != null ? `${vr.toFixed(1)}배` : '—'} · OI 24h ${oi != null ? `${oi >= 0 ? '+' : ''}${oi.toFixed(1)}%` : '—'} · 가격 24h ${pc != null ? `${pc >= 0 ? '+' : ''}${pc.toFixed(1)}%` : '—'} (설명용, 방향 신호 아님)`);

    // 펀딩 과열 — 내 방향이 크게 내는 쪽이면 관망
    if (market.fundingRate != null && market.fundingIntervalH) {
      const ann = (market.fundingRate / market.fundingIntervalH) * 24 * 365 * 100;
      const pay = plan.direction === 'long' ? ann : -ann;
      if (pay >= s.fundingHotAnnualPct) add('funding', 'wait', 'funding-hot', `펀딩 연환산 ${ann.toFixed(1)}% — ${dirKo}이 크게 내는 쪽(과열 기준 ${s.fundingHotAnnualPct}%). 붐비는 방향입니다.`);
      else add('funding', 'ok', 'funding-ok', `펀딩 연환산 ${ann.toFixed(1)}% (${market.fundingIntervalH}시간 정산) — ${pay > 0 ? `${dirKo}이 냄` : pay < 0 ? `${dirKo}이 받음` : '중립'}${sizing.ok ? ` · 보유 ${s.holdHours}시간 예상 비용 ${usd(sizing.costs.fundingCost)}` : ''}`);
    } else if (!R.some((r) => r.code === 'funding-missing')) add('funding', 'wait', 'funding-missing', '펀딩비를 읽지 못했습니다.');
  }

  const verdict: Verdict = R.some((r) => r.level === 'block') ? 'BLOCK' : R.some((r) => r.level === 'wait') ? 'WAIT' : 'ALLOW';
  const first = R.find((r) => r.level === (verdict === 'BLOCK' ? 'block' : 'wait'));
  const headline = verdict === 'ALLOW'
    ? '설정한 위험관리 조건을 충족합니다 — 수익 신호가 아닙니다.'
    : verdict === 'BLOCK' ? `신규 진입 제한 — ${first?.text ?? ''}` : `관망 — ${first?.text ?? ''}`;

  return {
    verdict, headline, reasons: R, sizing,
    budget: { dailyLimitUsdt, todayRealized, dailyRemaining, weeklyLimitUsdt, weekRealized, lossStreak, openRiskUsdt, totalRiskLimitUsdt, totalRiskRemaining },
    eventState: ew,
  };
}

/* ── 열린 포지션 위험(손절까지) ─────────────────────────── */
/** 수량·진입가·손절가 → 손절 시 가격 손실(USDT). 손절이 진입가 반대편(이미 이익 잠금)이면 0 */
export function openRiskUsdt(side: Direction, size: number, entry: number, stop: number | null): number | null {
  if (stop == null || !(stop > 0) || !(size > 0) || !(entry > 0)) return null;
  const loss = side === 'long' ? (entry - stop) * size : (stop - entry) * size;
  return Math.max(0, loss);
}
