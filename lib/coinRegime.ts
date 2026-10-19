/**
 * ETH 체제 종합 (Phase 2) — 4레이어를 "방향 신호"가 아니라 "지금 어떤 체제인가"로 묶는다.
 *
 * 설계 원칙(이 앱의 측정된 결론 = 방향 예측 우위 없음):
 *  - confluence(정렬도)는 '맞힐 확신'이 아니라 **사이징·레버리지 조절**에 쓴다.
 *    배경(공급·수요·거시)이 한 방향으로 정렬될수록 그쪽 리스크를 '조금 더' 질 수 있다는 뜻일 뿐,
 *    방향을 보장하지 않는다. 정렬이 약하면 레버리지를 낮춘다.
 *  - 포지셔닝(펀딩·OI·롱숏)은 배경과 섞지 않고 **쏠림/취약성 오버레이**로 따로 본다(스퀴즈 위험).
 *  - 레버리지 가드는 lib/positionSizing 의 isolatedLiqPrice 를 재사용한다(§11 단일 소스).
 */
import type { SupplyLayer } from './coinSupply';
import type { DemandLayer } from './coinPremium';
import type { MacroContext } from './coinMacroContext';
import { isolatedLiqPrice, notionForRisk } from './positionSizing';

/** 위험자산 기준 기울기: -1 맞바람 · 0 중립 · +1 순풍 */
export type Tilt = -1 | 0 | 1;

export interface LayerTilt {
  key: 'supply' | 'demand' | 'macro';
  label: string;
  tilt: Tilt;
  reason: string;
}

/** 레이어3 포지셔닝 입력 — 기존 coin-analysis 의 펀딩·OI·롱숏을 정규화해 넣는다 */
export interface PositioningInput {
  fundingPctAnnual?: number | null; // 연율 펀딩 % (양수=롱이 숏에 지불)
  longShortRatio?: number | null; // >1 롱 우세
  oiChangePct?: number | null; // OI 24h 변화 %
}

export type Crowding = 'crowded_long' | 'crowded_short' | 'balanced' | 'unknown';
export type RegimeTag = 'amplifier' | 'supply_no_demand' | 'crowded' | 'macro_headwind' | 'mixed';

export interface ConfluenceRead {
  net: number; // 기울기 합 (-3..+3)
  agree: number; // 같은 방향 레이어 최대 수
  known: number; // 중립 아닌 레이어 수
  strength: '강' | '보통' | '약' | '혼조';
}

export interface RegimeRead {
  tilts: LayerTilt[];
  confluence: ConfluenceRead;
  crowding: Crowding;
  crowdingNote: string;
  tags: RegimeTag[];
  headline: string;
  note: string;
}

// ── 레이어별 기울기 ─────────────────────────────────────────────
export function supplyTilt(s: SupplyLayer | null): LayerTilt {
  const tilt: Tilt = s?.state === 'supportive' ? 1 : s?.state === 'headwind' ? -1 : 0;
  const reason =
    tilt === 1 ? '스테이블코인 대기자금 증가·stETH 페그 양호 — 상승 시 증폭 조건'
    : tilt === -1 ? '대기자금 이탈 또는 stETH 디스카운트 — 공급 측 부담'
    : '공급 측 중립';
  return { key: 'supply', label: '공급/구조', tilt, reason };
}

export function demandTilt(d: DemandLayer | null): LayerTilt {
  const tilt: Tilt = d?.state === 'buying' ? 1 : d?.state === 'selling' ? -1 : 0;
  const reason =
    tilt === 1 ? '코인베이스 프리미엄·김프 매수 우위 — 실수요 유입'
    : tilt === -1 ? '프리미엄 할인 — 실수요 약함(공급 줄어도 못 올릴 수 있음)'
    : '수요 측 중립';
  return { key: 'demand', label: '수요/흐름', tilt, reason };
}

export function macroTilt(m: MacroContext | null): LayerTilt {
  const tilt: Tilt = m?.bias === 'long' ? 1 : m?.bias === 'short' ? -1 : 0;
  const reason = m?.headline ?? '거시 배경 미상';
  return { key: 'macro', label: '거시 배경', tilt, reason };
}

// ── 포지셔닝(쏠림) — 배경과 분리한 취약성 오버레이 ───────────────
const FUND_HOT_ANNUAL = 30; // 연율 펀딩 이 이상이면 롱 과열(경험적 기준선, 예측 아님)
const FUND_COLD_ANNUAL = -10; // 음수 펀딩 = 숏 과열
const LS_LONG = 1.3; // 롱숏비율 이 이상이면 롱 쏠림

export function crowdingState(p: PositioningInput | null): { crowding: Crowding; note: string } {
  if (!p || (p.fundingPctAnnual == null && p.longShortRatio == null)) {
    return { crowding: 'unknown', note: '포지셔닝 데이터 없음' };
  }
  const f = p.fundingPctAnnual ?? 0;
  const ls = p.longShortRatio ?? 1;
  if (f >= FUND_HOT_ANNUAL && ls >= LS_LONG) {
    return { crowding: 'crowded_long', note: '롱 쏠림·고펀딩 — 하방 스퀴즈(롱 청산) 위험, 레버리지 축소' };
  }
  if (f <= FUND_COLD_ANNUAL) {
    return { crowding: 'crowded_short', note: '숏 쏠림·음펀딩 — 상방 스퀴즈(숏 커버) 연료' };
  }
  return { crowding: 'balanced', note: '포지셔닝 과열 아님' };
}

// ── 종합 ────────────────────────────────────────────────────────
export function confluenceOf(tilts: LayerTilt[]): ConfluenceRead {
  const net = tilts.reduce((s, t) => s + t.tilt, 0);
  const pos = tilts.filter((t) => t.tilt > 0).length;
  const neg = tilts.filter((t) => t.tilt < 0).length;
  const known = pos + neg;
  const agree = Math.max(pos, neg);
  let strength: ConfluenceRead['strength'];
  if (known === 0) strength = '혼조';
  else if (Math.abs(net) >= 3) strength = '강';
  else if (Math.abs(net) === 2 && agree >= 2) strength = '보통';
  else if (net === 0) strength = '혼조';
  else strength = '약';
  return { net, agree, known, strength };
}

export interface RegimeInput {
  supply: SupplyLayer | null;
  demand: DemandLayer | null;
  macro: MacroContext | null;
  positioning: PositioningInput | null;
}

export function synthesizeRegime(input: RegimeInput): RegimeRead {
  const tilts = [supplyTilt(input.supply), demandTilt(input.demand), macroTilt(input.macro)];
  const confluence = confluenceOf(tilts);
  const { crowding, note: crowdingNote } = crowdingState(input.positioning);

  const supTilt = tilts[0].tilt;
  const demTilt = tilts[1].tilt;
  const macTilt = tilts[2].tilt;

  const tags: RegimeTag[] = [];
  if (supTilt > 0 && demTilt > 0) tags.push('amplifier');
  if (supTilt > 0 && demTilt < 0) tags.push('supply_no_demand');
  if (crowding === 'crowded_long' || crowding === 'crowded_short') tags.push('crowded');
  if (macTilt < 0) tags.push('macro_headwind');
  if (!tags.length) tags.push('mixed');

  const TAG_TEXT: Record<RegimeTag, string> = {
    amplifier: '공급 조임+수요 유입 — 상승 시 증폭 조건',
    supply_no_demand: '공급은 조이나 수요 부족 — 횡보/하락 위험',
    crowded: crowding === 'crowded_long' ? '롱 쏠림 — 스퀴즈 위험' : '숏 쏠림 — 상방 연료',
    macro_headwind: '거시 맞바람 — 공급 무관 하방 위험',
    mixed: '엇갈림 — 뚜렷한 체제 아님',
  };
  const headline = tags.map((t) => TAG_TEXT[t]).join(' · ');
  const note = `정렬도(confluence) ${confluence.strength} — 방향 예측이 아니라 사이징·레버리지 조절용. 배경이 정렬될수록 '조금 더', 엇갈리면 레버리지 축소.`;

  return { tilts, confluence, crowding, crowdingNote, tags, headline, note };
}

// ── 레버리지 가드 (isolatedLiqPrice 재사용) ─────────────────────
export interface LevGuardInput {
  entry: number;
  leverage: number;
  isShort: boolean;
  stopPct?: number | null; // 손절 거리 %
  maxAdversePct?: number | null; // 과거 이 체제 최대 역행 % (regimeEdge 에서)
}
export interface LevGuard {
  liqPrice: number;
  liqDistPct: number;
  stopSafety: number | null; // 청산거리 ÷ 손절거리, <2면 손절 전 청산 위험
  survivesMaxAdverse: boolean | null; // 과거 최대 역행을 버티는가
  warnings: string[];
}

export function leverageGuard(i: LevGuardInput): LevGuard {
  const liqPrice = isolatedLiqPrice(i.entry, i.leverage, i.isShort);
  const liqDistPct = i.entry ? (Math.abs(liqPrice - i.entry) / i.entry) * 100 : 0;
  const stopSafety = i.stopPct ? liqDistPct / i.stopPct : null;
  const survivesMaxAdverse = i.maxAdversePct != null ? liqDistPct > i.maxAdversePct : null;
  const warnings: string[] = [];
  if (stopSafety != null && stopSafety < 2) warnings.push('청산여유가 손절거리의 2배 미만 — 손절 전에 청산될 수 있음');
  if (survivesMaxAdverse === false)
    warnings.push(`청산거리(${liqDistPct.toFixed(1)}%)가 과거 이 체제 최대 역행(${i.maxAdversePct!.toFixed(1)}%)보다 작음 — 버티기 위험`);
  if (i.leverage >= 10) warnings.push('10배 이상 — 공급 감소 전망만 믿고 버티지 말 것(배경은 트리거 아님)');
  return { liqPrice, liqDistPct, stopSafety, survivesMaxAdverse, warnings };
}

// ── 권장 사이징 (리스크% 기반, positionSizing.notionForRisk 재사용) ───────
export interface SizingInput {
  seedUsdt: number; // 계좌 자본
  riskPct: number; // 회당 허용 손실 %
  stopPct: number; // 손절 거리 %
  leverage: number;
  entry: number;
}
export interface Sizing {
  riskUsdt: number; // 손절 시 잃는 금액(= 자본 × 리스크%)
  notionUsdt: number; // 권장 명목가
  qty: number; // 권장 수량(코인)
  marginUsdt: number; // 필요 증거금(명목가 ÷ 레버리지)
  marginPctOfSeed: number; // 증거금이 자본에서 차지하는 비중 %
  overMargin: boolean; // 필요 증거금 > 자본 (레버리지가 낮아 감당 불가)
}

/** 손절거리가 리스크를 결정 → 명목가 역산, 레버리지로 증거금 환산. 방향·승률과 무관한 자금관리. */
export function recommendSizing(i: SizingInput): Sizing | null {
  if (!(i.seedUsdt > 0) || !(i.riskPct > 0) || !(i.stopPct > 0) || !(i.leverage > 0) || !(i.entry > 0)) return null;
  const riskUsdt = (i.seedUsdt * i.riskPct) / 100;
  const notionUsdt = notionForRisk(i.seedUsdt, i.riskPct, i.stopPct);
  const marginUsdt = notionUsdt / i.leverage;
  return {
    riskUsdt,
    notionUsdt,
    qty: notionUsdt / i.entry,
    marginUsdt,
    marginPctOfSeed: (marginUsdt / i.seedUsdt) * 100,
    overMargin: marginUsdt > i.seedUsdt,
  };
}
