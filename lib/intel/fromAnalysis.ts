/**
 * 코인 분석 응답(/api/coin-analysis) → 의사결정 엔진 입력. 이미 받은 실제 값만 쓰고, 없는 값은 만들지 않는다.
 *
 * Phase 1 에서 연결한 그룹(모두 같은 분석 응답 안의 값):
 *  - technical  : 4H·1D 상위 추세(엔진 레짐) · 1H 구조·EMA · 15m 구조·EMA          (Bitget 캔들)
 *  - macro      : 10년물·실질금리·DXY 같은 방향 투표(lib/coinMacroContext)            (FRED·네이버, 일간)
 *  - derivatives: 펀딩비 쏠림 · 계정 롱숏비 · 테이커 매수/매도 체결비                  (Bitget)
 * 연결 안 한 그룹 → 점수 null(방향 계산에서 빠짐, Phase 2):
 *  - liquidity  : 스테이블코인·ETF 유입은 다른 화면에서 받는 중 — 시점 표준화 후 연결
 *  - news       : 지금 뉴스 분류는 제목 단어 수뿐이라 '검증된 뉴스'가 아님 → 방향에 넣지 않음
 * 방향(+1/−1)·강도·신뢰도 수치는 해석 규칙이며 검증 전 임시값이다.
 */
import type { EntryRec } from '@/lib/entryRec';
import { evaluateDecision, type EngineOutput, type RiskEvent, type SignalObservation, type Direction } from './decisionEngine';
import { bridgeEntryRec } from './bridgeEntryRec';
import { zoneTrigger, type Candle } from './trigger';

export interface TfLite { structure: string; emaAlign: string; priceVsEma20: string }
export interface AnalysisSnapshot {
  symbol: string;
  updatedAt: number;                       // 서버가 시세를 받은 시각(ms)
  price: number;
  h1: TfLite; m15: TfLite;
  regime: { h4: 'up' | 'down' | 'flat'; d1: 'up' | 'down' | 'flat' } | null;
  macro: {
    bias: 'long' | 'short' | 'mixed'; strength: '강' | '보통' | '약';
    asOf: (string | null)[];               // 구성 값들의 기준일
  } | null;
  funding: { ratePct: number; intervalH: number } | null;
  lsRatio: number | null;
  takerRatio: number | null;
  event: { title: string; hoursUntil: number } | null;
  m15Candles: Candle[];
}

export interface DecisionSettings {
  equityUsd: number;
  riskPerTradePct: number;   // 0~1
  maxLeverage: number;
  makerFeePct: number; takerFeePct: number; slippagePct: number;
  holdHours: number;
  minNetRR: number;
  eventPreMin: number; eventPostMin: number;
}

export interface DecisionResult {
  output: EngineOutput;
  observations: SignalObservation[];
  events: RiskEvent[];
  missing: string[];          // 연결 안 된 데이터(화면에 '데이터 없음'으로)
  costs: { feeBps: number; slippageBps: number; fundingBps: number };
}

const iso = (ms: number) => new Date(ms).toISOString();
const KO = { up: '상승', down: '하락', flat: '횡보' } as const;

/** 기준일(YYYY-MM-DD 또는 ISO) 중 가장 이른 것 → 공개 시각. 날짜뿐이면 그날 0시(UTC) */
export function macroAvailableAt(asOf: (string | null)[], fallbackMs: number): string {
  const ts = asOf.filter((x): x is string => !!x).map((x) => Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(x) ? `${x}T00:00:00Z` : x)).filter(Number.isFinite);
  return iso(ts.length ? Math.min(...ts) : fallbackMs);
}

function trendObs(id: string, family: string, tf: TfLite, label: string, reliability: number, at: string): SignalObservation {
  const up = tf.structure === '상승' && tf.emaAlign === '정배열';
  const dn = tf.structure === '하락' && tf.emaAlign === '역배열';
  const dir: Direction = up ? 1 : dn ? -1 : 0;
  return {
    id, group: 'technical', family, direction: dir, strength: dir ? (tf.priceVsEma20 === (up ? 'above' : 'below') ? 0.8 : 0.5) : 0.2,
    reliability, availableAt: at, maxAgeMinutes: 60, source: 'Bitget 캔들',
    explanation: `${label} ${tf.structure} 구조 · EMA ${tf.emaAlign}`,
  };
}

export function buildObservations(s: AnalysisSnapshot): SignalObservation[] {
  const at = iso(s.updatedAt);
  const out: SignalObservation[] = [];
  if (s.regime) {
    const { h4, d1 } = s.regime;
    const v = (t: string) => (t === 'up' ? 1 : t === 'down' ? -1 : 0);
    const sum = v(h4) + v(d1);
    const dir: Direction = sum > 0 ? 1 : sum < 0 ? -1 : 0;
    out.push({
      id: 'tech-htf', group: 'technical', family: 'htf_trend', direction: dir,
      strength: Math.abs(sum) === 2 ? 0.9 : Math.abs(sum) === 1 ? 0.5 : 0.2, reliability: 0.7,
      availableAt: at, maxAgeMinutes: 60, source: 'Bitget 4H·1D 캔들', explanation: `상위 추세 4H ${KO[h4]} · 1D ${KO[d1]}`,
    });
  }
  out.push(trendObs('tech-1h', 'tf_1h', s.h1, '1H', 0.6, at));
  out.push(trendObs('tech-15m', 'tf_15m', s.m15, '15m', 0.5, at));
  if (s.macro) {
    const dir: Direction = s.macro.bias === 'long' ? 1 : s.macro.bias === 'short' ? -1 : 0;
    out.push({
      id: 'macro-rates-dollar', group: 'macro', family: 'rates_dollar', direction: dir,
      strength: s.macro.strength === '강' ? 0.9 : s.macro.strength === '보통' ? 0.6 : 0.3, reliability: 0.7,
      availableAt: macroAvailableAt(s.macro.asOf, s.updatedAt), maxAgeMinutes: 4 * 1440, // 일간 자료 — 주말 포함 4일
      source: 'FRED·네이버(10년물·실질금리·DXY)', explanation: `금리·달러 방향 투표 → ${s.macro.bias === 'long' ? '위험자산 우호' : s.macro.bias === 'short' ? '위험자산 부담' : '혼조'}(${s.macro.strength})`,
    });
  }
  if (s.funding && Number.isFinite(s.funding.ratePct)) {
    const r = s.funding.ratePct;
    const dir: Direction = r >= 0.03 ? -1 : r <= -0.01 ? 1 : 0;
    out.push({
      id: 'deriv-funding', group: 'derivatives', family: 'funding', direction: dir,
      strength: dir ? Math.min(1, Math.abs(r) / 0.1) : 0.1, reliability: 0.6,
      availableAt: at, maxAgeMinutes: s.funding.intervalH * 60, source: 'Bitget 펀딩비',
      explanation: `펀딩비 ${r >= 0 ? '+' : ''}${r.toFixed(4)}% — ${dir < 0 ? '롱 쏠림(되돌림 연료)' : dir > 0 ? '숏 쏠림(스퀴즈 연료)' : '중립 구간'}`,
    });
  }
  if (s.lsRatio != null && Number.isFinite(s.lsRatio)) {
    const dir: Direction = s.lsRatio >= 2 ? -1 : s.lsRatio <= 0.8 ? 1 : 0;
    out.push({
      id: 'deriv-ls', group: 'derivatives', family: 'ls_account', direction: dir, strength: dir ? 0.5 : 0.1, reliability: 0.4,
      availableAt: at, maxAgeMinutes: 60, source: 'Bitget 계정 롱숏비',
      explanation: `계정 롱숏비 ${s.lsRatio.toFixed(2)}${dir < 0 ? ' — 개인 롱 과밀' : dir > 0 ? ' — 개인 숏 과밀' : ''}`,
    });
  }
  if (s.takerRatio != null && Number.isFinite(s.takerRatio)) {
    const t = s.takerRatio;
    const dir: Direction = t >= 1.1 ? 1 : t <= 0.9 ? -1 : 0;
    out.push({
      id: 'deriv-taker', group: 'derivatives', family: 'taker_flow', direction: dir,
      strength: dir ? Math.min(1, Math.abs(t - 1) * 5) : 0.1, reliability: 0.5,
      availableAt: at, maxAgeMinutes: 60, source: 'Bitget 테이커 체결',
      explanation: `테이커 매수/매도 ${t.toFixed(2)}${dir > 0 ? ' — 매수 우위' : dir < 0 ? ' — 매도 우위' : ''}`,
    });
  }
  return out;
}

export function buildEvents(s: AnalysisSnapshot, preMin: number, postMin: number): RiskEvent[] {
  if (!s.event || !Number.isFinite(s.event.hoursUntil)) return [];
  return [{
    id: `cal-${s.event.title}`, name: s.event.title, type: 'macro_release', severity: 'critical',
    scheduledAt: iso(s.updatedAt + s.event.hoursUntil * 3_600_000),
    preMinutes: preMin, postMinutes: postMin, verified: true,
  }];
}

export function buildDecision(s: AnalysisSnapshot, rec: Pick<EntryRec, 'long' | 'short'>, asOfMs: number, st: DecisionSettings): DecisionResult {
  const triggers = {
    ...(rec.long ? { long: zoneTrigger(s.m15Candles, asOfMs, 'long', rec.long) } : {}),
    ...(rec.short ? { short: zoneTrigger(s.m15Candles, asOfMs, 'short', rec.short) } : {}),
  };
  const observations = buildObservations(s);
  const events = buildEvents(s, st.eventPreMin, st.eventPostMin);
  // 비용: 지정가 진입(메이커) + 손절·익절 시장가(테이커) · 청산 1회 슬리피지 · 보유 시간만큼 펀딩(쪽과 무관하게 보수적으로 절댓값)
  const feeBps = (st.makerFeePct + st.takerFeePct) * 100;
  const slippageBps = st.slippagePct * 100;
  const fundingBps = s.funding ? Math.abs(s.funding.ratePct) * 100 * Math.max(1, Math.ceil(st.holdHours / Math.max(1, s.funding.intervalH))) : 0;
  const output = evaluateDecision({
    asOf: iso(asOfMs), symbol: s.symbol, price: s.price,
    observations, events, setups: bridgeEntryRec(rec, triggers),
    equityUsd: st.equityUsd, riskPerTradePct: Math.min(1, st.riskPerTradePct), maxLeverage: st.maxLeverage,
    feeBpsRoundTrip: feeBps, slippageBpsRoundTrip: slippageBps, estimatedFundingBpsRoundTrip: fundingBps,
    minNetRR: Math.max(1.6, st.minNetRR),
  });
  const missing = [
    '유동성(스테이블코인·ETF 유입) — Phase 2 연결 전',
    '뉴스·연준 발언 — 검증 계층 Phase 2 전(제목 단어 분류는 방향에 쓰지 않음)',
    ...(s.macro ? [] : ['거시(금리·달러) — 이번 분석에서 받지 못함']),
    ...(s.funding ? [] : ['펀딩비 — 이번 분석에서 받지 못함']),
  ];
  return { output, observations, events, missing, costs: { feeBps, slippageBps, fundingBps } };
}
