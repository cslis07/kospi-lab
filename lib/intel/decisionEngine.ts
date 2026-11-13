/**
 * Macro & Crypto Decision Engine (v0.1 연구용) — 첨부 프로토타입(KOSPI_LAB_CRYPTO_ENGINE_STARTER, 2026-11-13)을 저장소 규칙에 맞게 옮김.
 *
 * 순수 함수: 네트워크·주문 없음. 입력 = 시각이 붙은 관측값(observations)·위험 이벤트·진입 후보(setups) → 상태·근거·비용 반영 손익비.
 * ⚠ 정렬 점수(alignment)는 적중 확률이 아니다. 그룹 가중치(거시 23·유동성 19·파생 17·뉴스 11·기술 30)와
 *   임계값(±0.20, 순손익비 1.6, 커버리지 0.55)은 **검증 전 임시값**이다(docs/crypto-engine/ENGINE_PLAN_KO.md §4).
 * 기존 판정 엔진(lib/coinAnalysis)·추천 진입가(lib/entryRec)는 그대로 두고, 그 결과를 입력으로만 쓴다.
 *
 * 원본 대비 수정(코드 리뷰):
 *  - blockUntil 이 이미 지난 속보 이벤트(예정 시각 없음)가 "종료시각 미확인"으로 영구 차단되던 문제 → 지난 안전모드는 해제.
 *  - 거래 비용이 잘못되면 손익비를 계산하지 않고 바로 무효 처리(원본은 계산을 이어 갔다).
 *  - 상태 라벨은 화면용 STATUS_LABEL 로 분리('READY' → '조건 충족(실험)').
 */

export type Group = 'macro' | 'liquidity' | 'derivatives' | 'news' | 'technical';
export type Side = 'long' | 'short';
export type Direction = -1 | 0 | 1; // -1 숏 쪽, +1 롱 쪽, 0 판단 불가
export type Strategy = 'pullback' | 'breakout_retest' | 'range';
export type EngineStatus = 'BLOCKED' | 'NO_SETUP' | 'WATCH' | 'READY';

export const GROUP_WEIGHTS: Readonly<Record<Group, number>> = {
  macro: 0.23, liquidity: 0.19, derivatives: 0.17, news: 0.11, technical: 0.30,
};
export const GROUP_LABEL: Readonly<Record<Group, string>> = {
  macro: '거시', liquidity: '유동성', derivatives: '파생 수급', news: '뉴스', technical: '기술적',
};
/** 화면 표기 — READY 를 실전 신호처럼 보이게 하지 않는다(명세 §8-4) */
export const STATUS_LABEL: Readonly<Record<EngineStatus, string>> = {
  BLOCKED: '거래 보류', NO_SETUP: '조건 맞는 후보 없음', WATCH: '대기 · 트리거 미확인', READY: '조건 충족(실험)',
};

export interface SignalObservation {
  id: string;
  group: Group;
  /** 상관된 지표는 같은 family — 한 주제를 여러 번 세지 않게(그룹·패밀리당 최신 하나) */
  family: string;
  direction: Direction;
  /** 정해 둔 기준 대비 신호 크기(0~1). 확률 아님 */
  strength: number;
  /** 공급자·방법론 품질(0~1). 백테스트 적중률 아님 */
  reliability: number;
  /** 값이 공개돼 볼 수 있게 된 시각(ISO UTC) — 미래 데이터(look-ahead) 방지 */
  availableAt: string;
  maxAgeMinutes: number;
  source: string;
  sourceUrl?: string;
  explanation: string;
}

export interface RiskEvent {
  id: string;
  name: string;
  type: 'macro_release' | 'fed_statement' | 'geopolitical' | 'exchange_outage' | 'market_panic';
  severity: 'high' | 'critical';
  /** 예정 이벤트 — 공식 발표 시각(UTC) */
  scheduledAt?: string;
  /** 속보 — 이 시각까지 안전모드 */
  blockUntil?: string;
  preMinutes?: number;
  postMinutes?: number;
  verified: boolean;
  sourceUrl?: string;
}

export interface ProposedSetup {
  side: Side;
  strategy: Strategy;
  entry: number; zoneLow: number; zoneHigh: number;
  stop: number; target1: number; target2: number;
  /** 닫힌 봉·수급으로 정해 둔 진입 확인이 났을 때만 true */
  triggerConfirmed: boolean;
  triggerDescription: string;
  basis: string[];
}

export interface EngineInput {
  asOf: string;
  symbol: string;
  price: number;
  observations: SignalObservation[];
  events: RiskEvent[];
  setups: ProposedSetup[];
  equityUsd: number;
  riskPerTradePct: number;        // 0 < x <= 1
  maxLeverage: number;            // 명목/자본 상한(권장 배율 아님)
  feeBpsRoundTrip: number;
  slippageBpsRoundTrip: number;
  estimatedFundingBpsRoundTrip?: number; // 0 이상(보수적 추정)
  minNetRR?: number;              // 기본 1.6
  minCoverage?: number;           // 기본 0.55
}

export interface SetupEvaluation extends ProposedSetup {
  valid: boolean;
  issues: string[];
  rr1Net: number | null;
  rr2Net: number | null;
  maxNotionalUsd: number | null;
  estimatedMarginUsd: number | null;
  modeledMaxLossUsd: number | null;
}

export interface EngineOutput {
  status: EngineStatus;
  bias: 'LONG_CONTEXT' | 'SHORT_CONTEXT' | 'MIXED' | 'UNAVAILABLE';
  /** 방향 정렬도(-1~1) — 가격 변화·적중 확률 아님 */
  alignment: number | null;
  coverage: number;
  groupScores: Record<Group, number | null>;
  staleIds: string[];
  ignoredIds: string[];
  blocks: string[];
  reasons: string[];
  selected: SetupEvaluation | null;
  evaluated: SetupEvaluation[];
  asOf: string;
  disclaimer: string;
}

export const GROUPS: Group[] = ['macro', 'liquidity', 'derivatives', 'news', 'technical'];
export const MIN_TRIGGER_ALIGN = 0.2;
export const TRIGGER_PENDING = '진입 트리거 미확인';
const DISCLAIMER = '실험적 조건부 진입 계획입니다. 정렬 점수는 적중 확률이 아니며, 수익·체결을 보장하지 않습니다.';
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const round = (x: number, digits = 4) => Number(x.toFixed(digits));
const dt = (x: string | undefined): number => (x ? Date.parse(x) : NaN);

function invalid(s: ProposedSetup, issues: string[]): SetupEvaluation {
  return { ...s, valid: false, issues, rr1Net: null, rr2Net: null, maxNotionalUsd: null, estimatedMarginUsd: null, modeledMaxLossUsd: null };
}

export function evaluateSetup(s: ProposedSetup, inp: EngineInput): SetupEvaluation {
  const issues: string[] = [];
  const values = [s.entry, s.zoneLow, s.zoneHigh, s.stop, s.target1, s.target2];
  if (!values.every((x) => num(x) && x > 0) || s.zoneLow > s.zoneHigh || s.entry < s.zoneLow || s.entry > s.zoneHigh) {
    issues.push('진입가·진입 구간·목표 가격에 오류');
  }
  if (s.side === 'long' && !(s.stop < s.zoneLow && s.entry < s.target1 && s.target1 <= s.target2)) issues.push('롱의 손절·목표 가격 순서 오류');
  if (s.side === 'short' && !(s.stop > s.zoneHigh && s.entry > s.target1 && s.target1 >= s.target2)) issues.push('숏의 손절·목표 가격 순서 오류');
  if (issues.length) return invalid(s, issues);

  const funding = inp.estimatedFundingBpsRoundTrip ?? 0;
  const frictionBps = inp.feeBpsRoundTrip + inp.slippageBpsRoundTrip + funding;
  if (!num(frictionBps) || inp.feeBpsRoundTrip < 0 || inp.slippageBpsRoundTrip < 0 || funding < 0) {
    return invalid(s, ['거래 비용이 유효하지 않음']);
  }
  const costFraction = frictionBps / 10000;
  const lossFraction = Math.abs(s.entry - s.stop) / s.entry + costFraction;
  if (!num(lossFraction) || lossFraction <= 0) return invalid(s, ['손절 간격 오류']);
  const rr1 = (Math.abs(s.target1 - s.entry) / s.entry - costFraction) / lossFraction;
  const rr2 = (Math.abs(s.target2 - s.entry) / s.entry - costFraction) / lossFraction;
  if (rr1 < (inp.minNetRR ?? 1.6)) issues.push('비용 반영 1차 손익비 부족');
  if (!s.triggerConfirmed) issues.push(TRIGGER_PENDING);
  const riskBudget = (inp.equityUsd * inp.riskPerTradePct) / 100;
  const notional = Math.min(riskBudget / lossFraction, inp.equityUsd * inp.maxLeverage);
  return {
    ...s, valid: issues.length === 0, issues,
    rr1Net: round(rr1, 2), rr2Net: round(rr2, 2),
    maxNotionalUsd: round(notional, 2),
    estimatedMarginUsd: round(notional / inp.maxLeverage, 2),
    modeledMaxLossUsd: round(notional * lossFraction, 2),
  };
}

/** 지금 거래를 막는 이벤트면 사유, 아니면 null. high 는 막지 않고 critical 만 막는다 */
export function activeBlock(e: RiskEvent, now: number): string | null {
  if (e.severity !== 'critical') return null;
  const until = dt(e.blockUntil);
  if (num(until)) {
    if (now <= until) return `${e.name}: 속보·시장 교란 안전모드`;
    if (!e.scheduledAt) return null; // 안전모드가 끝난 속보 — 해제(원본은 여기서 영구 차단됐다)
  }
  const time = dt(e.scheduledAt);
  if (!num(time)) return `중대 이벤트 ${e.name}: 종료 시각 미확인, 거래 보류`;
  const before = (e.preMinutes ?? 60) * 60000;
  const after = (e.postMinutes ?? 30) * 60000;
  return now >= time - before && now <= time + after ? `${e.name}: 중요 발표 전후 거래 보류` : null;
}

/** 순수 함수: 호출부가 시각이 붙은 스냅샷과 후보를 넣는다. 입출력 없음 */
export function evaluateDecision(inp: EngineInput): EngineOutput {
  const now = dt(inp.asOf);
  if (!num(now) || !num(inp.price) || inp.price <= 0 || !num(inp.equityUsd) || inp.equityUsd <= 0 ||
      !num(inp.riskPerTradePct) || inp.riskPerTradePct <= 0 || inp.riskPerTradePct > 1 ||
      !num(inp.maxLeverage) || inp.maxLeverage < 1 || inp.maxLeverage > 100 ||
      !num(inp.feeBpsRoundTrip) || !num(inp.slippageBpsRoundTrip)) {
    throw new Error('잘못된 엔진 입력값 (시세·계좌·위험 한도·비용·시각 확인)');
  }
  const ignoredIds: string[] = [], staleIds: string[] = [];
  const perFamily = new Map<string, SignalObservation>();
  for (const s of inp.observations) {
    const when = dt(s.availableAt);
    const malformed = !GROUPS.includes(s.group) || !s.id || !s.family || !s.source ||
      ![-1, 0, 1].includes(s.direction) ||
      !num(s.strength) || s.strength < 0 || s.strength > 1 ||
      !num(s.reliability) || s.reliability < 0 || s.reliability > 1 ||
      !num(s.maxAgeMinutes) || s.maxAgeMinutes < 0 || !num(when);
    if (malformed) { ignoredIds.push(s.id); continue; }
    if (when > now || now - when > s.maxAgeMinutes * 60000) { staleIds.push(s.id); continue; }
    // 출처 없는 뉴스·의견은 방향 계산에서 뺀다(0표·악재표로 세지 않음)
    if (s.group === 'news' && !s.sourceUrl) { ignoredIds.push(s.id); continue; }
    const key = `${s.group}/${s.family}`;
    const old = perFamily.get(key);
    if (!old || dt(old.availableAt) < when) perFamily.set(key, s);
  }
  const scores: Record<Group, number | null> = { macro: null, liquidity: null, derivatives: null, news: null, technical: null };
  let coverage = 0, numerator = 0, denominator = 0;
  for (const g of GROUPS) {
    const arr = [...perFamily.values()].filter((s) => s.group === g);
    const total = arr.reduce((n, s) => n + s.reliability * Math.max(s.strength, 0.05), 0);
    if (!arr.length || total <= 0) continue;
    const score = arr.reduce((n, s) => n + s.direction * s.reliability * Math.max(s.strength, 0.05), 0) / total;
    scores[g] = round(score);
    coverage += GROUP_WEIGHTS[g];
    numerator += score * GROUP_WEIGHTS[g];
    denominator += GROUP_WEIGHTS[g];
  }
  const alignment = denominator > 0 ? round(numerator / denominator) : null;
  const bias = alignment == null ? 'UNAVAILABLE' : alignment >= MIN_TRIGGER_ALIGN ? 'LONG_CONTEXT'
    : alignment <= -MIN_TRIGGER_ALIGN ? 'SHORT_CONTEXT' : 'MIXED';
  const blocks = inp.events.map((e) => activeBlock(e, now)).filter((x): x is string => x !== null);
  if (scores.macro == null) blocks.push('거시경제 입력 누락 또는 유효기간 초과');
  if (scores.technical == null) blocks.push('기술적 가격 구조 입력 누락 또는 유효기간 초과');
  if (coverage < (inp.minCoverage ?? 0.55)) blocks.push('데이터 범위 부족 (필수 그룹 및 커버리지 확인)');
  const evaluated = inp.setups.map((s) => evaluateSetup(s, inp));
  const direction = bias === 'LONG_CONTEXT' ? 'long' : bias === 'SHORT_CONTEXT' ? 'short' : null;
  const matching = evaluated.filter((s) => s.side === direction && s.rr1Net != null && s.rr1Net >= (inp.minNetRR ?? 1.6) &&
    !s.issues.some((x) => x !== TRIGGER_PENDING));
  matching.sort((a, b) => (b.rr1Net ?? 0) - (a.rr1Net ?? 0));
  const selected = matching[0] ?? null;
  let status: EngineStatus;
  const reasons: string[] = [];
  if (blocks.length) { status = 'BLOCKED'; reasons.push(...blocks); }
  else if (!direction) { status = 'NO_SETUP'; reasons.push('롱·숏 배경 신호 혼조: 가격 후보는 관찰용'); }
  else if (!selected) { status = 'NO_SETUP'; reasons.push('조건을 충족하는 진입 후보 또는 순손익비 없음'); }
  else if (!selected.triggerConfirmed) {
    status = 'WATCH';
    const p = (x: number) => Number(x.toPrecision(6)).toLocaleString('en-US');
    reasons.push(`진입 구간 ${p(selected.zoneLow)}–${p(selected.zoneHigh)} 도달 후 ${selected.triggerDescription} 확인 대기`);
  }
  else { status = 'READY'; reasons.push('사전에 정한 진입 조건 충족 (수익 보장 아님)'); }
  return {
    status, bias, alignment, coverage: round(coverage), groupScores: scores,
    staleIds, ignoredIds, blocks, reasons, selected, evaluated, asOf: inp.asOf, disclaimer: DISCLAIMER,
  };
}
