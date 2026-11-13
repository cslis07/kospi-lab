/**
 * 코인 분석 응답(/api/coin-analysis) → 의사결정 엔진 입력. 이미 받은 실제 값만 쓰고, 없는 값은 만들지 않는다.
 *
 * Phase 1 에서 연결한 그룹(모두 같은 분석 응답 안의 값):
 *  - technical  : 4H·1D 상위 추세(엔진 레짐) · 1H 구조·EMA · 15m 구조·EMA          (Bitget 캔들)
 *  - macro      : 10년물·실질금리·DXY 같은 방향 투표(lib/coinMacroContext)            (FRED·네이버, 일간)
 *  - derivatives: 펀딩비 쏠림 · 계정 롱숏비 · 테이커 매수/매도 체결비                  (Bitget)
 * Phase 2(/api/intel/context, lib/intel/liquidity·newsEvents):
 *  - liquidity  : 스테이블코인 7일·30일 변화(DefiLlama) · 현물 ETF 순유입(SoSoValue, BTC·ETH 만)
 *  - news       : 같은 사건 묶기·확인 수준·위기 속보 안전모드(거래 보류)만. 방향 점수는 원문 확인 전이라 비움(명세 §3-C)
 *  - 연준 공식 RSS: FOMC 성명 공개 후 보류·긴급 결정 안전모드, 연설은 목록만(매파/비둘기 분류 안 함)
 * 방향(+1/−1)·강도·신뢰도 수치는 해석 규칙이며 검증 전 임시값이다.
 */
import type { EntryRec } from '@/lib/entryRec';
import { evaluateDecision, type EngineOutput, type RiskEvent, type SignalObservation, type Direction } from './decisionEngine';
import { bridgeEntryRec } from './bridgeEntryRec';
import { zoneTrigger, type Candle } from './trigger';
import { liquidityObservations, ETF_ASSET, type IntelContext } from './liquidity';
import { clusterNews, newsRiskEvents, fedRiskEvents, type NewsEvent, type FedItem, type RawNews } from './newsEvents';

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
  /** 분석 응답의 코인 뉴스(구글·빙 뉴스 RSS) */
  news?: RawNews[];
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
  /** 같은 사건으로 묶은 뉴스(위기·확인 수준 순) */
  newsEvents: NewsEvent[];
  /** 최근 48시간 연준 공식 연설·증언·통화정책 보도자료 */
  fed: FedItem[];
  providers: ProviderStatus[];
}

export interface ProviderStatus {
  id: string; label: string;
  status: 'ok' | 'stale' | 'missing' | 'na';
  delay: string;            // 갱신 주기·지연 — '실시간'과 일간 자료를 같은 것으로 보이지 않게
  asOf: string | null;      // 값 기준 시각(ISO)
  note?: string;
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

/** 공식 일정의 주요 발표 → 발표 전후 보류(critical). 분석 응답 이벤트와 같은 발표는 한 번만 */
export function releaseEvents(ctx: IntelContext | null | undefined, already: RiskEvent[], preMin: number, postMin: number): RiskEvent[] {
  const names = new Set(already.map((e) => e.name));
  return (ctx?.releases ?? []).filter((r) => !names.has(r.title) && Number.isFinite(Date.parse(r.at))).map((r) => ({
    id: `rel-${r.title}-${r.at}`, name: r.title, type: 'macro_release' as const, severity: 'critical' as const,
    scheduledAt: r.at, preMinutes: preMin, postMinutes: postMin, verified: true,
  }));
}

export function buildDecision(s: AnalysisSnapshot, rec: Pick<EntryRec, 'long' | 'short'>, asOfMs: number, st: DecisionSettings, ctx?: IntelContext | null): DecisionResult {
  const triggers = {
    ...(rec.long ? { long: zoneTrigger(s.m15Candles, asOfMs, 'long', rec.long) } : {}),
    ...(rec.short ? { short: zoneTrigger(s.m15Candles, asOfMs, 'short', rec.short) } : {}),
  };
  const liq = liquidityObservations(ctx, s.symbol);
  const observations = [...buildObservations(s), ...liq];
  // 뉴스: 코인 뉴스 + 해외 경제 뉴스를 같은 사건끼리 묶는다(같은 충격을 여러 번 세지 않게)
  const newsEvents = clusterNews([...(s.news ?? []), ...(ctx?.news ?? [])], asOfMs, 24);
  const fed = (ctx?.fed ?? []).filter((f) => asOfMs - Date.parse(f.publishedAt) <= 48 * 3_600_000 && Date.parse(f.publishedAt) <= asOfMs + 5 * 60_000);
  const fromAnalysis = buildEvents(s, st.eventPreMin, st.eventPostMin);
  const events = [
    ...fromAnalysis,
    ...releaseEvents(ctx, fromAnalysis, st.eventPreMin, st.eventPostMin),
    ...newsRiskEvents(newsEvents, asOfMs),
    ...fedRiskEvents(ctx?.fed ?? [], asOfMs, st.eventPostMin),
  ];
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
  const asset = ETF_ASSET[s.symbol];
  const missing = [
    '뉴스·연준 발언의 방향 점수 — 원문·문맥·시장 선반영 확인 전이라 쓰지 않음(위기 속보 안전모드만 적용)',
    ...(ctx ? [] : ['유동성·연준·해외 뉴스 — 아직 받는 중이거나 받기 실패']),
    ...(ctx && !ctx.stable ? ['스테이블코인 시총 — 이번에 받지 못함'] : []),
    ...(ctx && asset && !ctx.etf[asset] ? [`${asset} 현물 ETF — 이번에 받지 못함`] : []),
    ...(!asset ? [`${s.symbol.replace(/USDT$/, '')} 현물 ETF 흐름 — 데이터 없음(BTC ETF 로 대신하지 않음)`] : []),
    ...(s.macro ? [] : ['거시(금리·달러) — 이번 분석에서 받지 못함']),
    ...(s.funding ? [] : ['펀딩비 — 이번 분석에서 받지 못함']),
    '거래소 BTC·ETH 잔고·현물 순유입 — 유료 데이터(CoinGlass 등) 계약 없음',
  ];
  const stale = (id: string) => output.staleIds.includes(id);
  const at = (id: string) => observations.find((o) => o.id === id)?.availableAt ?? null;
  const providers: ProviderStatus[] = [
    { id: 'bitget', label: 'Bitget 캔들·펀딩·롱숏·체결', status: s.m15Candles.length ? (stale('tech-15m') ? 'stale' : 'ok') : 'missing', delay: '실시간(분석 실행 시점)', asOf: iso(s.updatedAt) },
    { id: 'macro', label: 'FRED·네이버 금리·달러', status: !s.macro ? 'missing' : stale('macro-rates-dollar') ? 'stale' : 'ok', delay: '일간 · 실질금리 1~2일 늦음', asOf: at('macro-rates-dollar') },
    (() => {
      const next = events.filter((e) => e.type === 'macro_release' && e.scheduledAt && Date.parse(e.scheduledAt) + (e.postMinutes ?? 30) * 60_000 >= asOfMs)
        .sort((a, b) => Date.parse(a.scheduledAt!) - Date.parse(b.scheduledAt!))[0];
      const h = next ? (Date.parse(next.scheduledAt!) - asOfMs) / 3_600_000 : null;
      return { id: 'calendar', label: '공식 발표 일정(FRED·BLS·연준)', status: ctx && !ctx.health.calendar.ok ? 'missing' as const : 'ok' as const, delay: '발표 시각 고정(서머타임 반영)', asOf: null,
        note: ctx && !ctx.health.calendar.ok ? ctx.health.calendar.note : next ? `다음: ${next.name} ${h! >= 0 ? `${h!.toFixed(1)}시간 뒤` : '발표 직후'}` : '48시간 안 주요 발표 없음' };
    })(),
    { id: 'stable', label: 'DefiLlama 스테이블코인', status: !ctx ? 'missing' : !ctx.stable ? 'missing' : stale('liq-stable') ? 'stale' : 'ok', delay: '일간', asOf: at('liq-stable'), note: ctx?.health.stable.note },
    { id: 'etf', label: 'SoSoValue 현물 ETF', status: !asset ? 'na' : !ctx || !ctx.etf[asset] ? 'missing' : stale('liq-etf') ? 'stale' : 'ok', delay: '미국 거래일 · 장 마감 뒤 집계', asOf: at('liq-etf'), note: !asset ? '이 코인 현물 ETF 데이터 없음' : ctx?.health.etf.note },
    { id: 'fed', label: '연준 공식 RSS(연설·증언·통화정책)', status: ctx?.health.fed.ok ? 'ok' : 'missing', delay: '공개 즉시(RSS 10분 캐시)', asOf: ctx?.fed[0]?.publishedAt ?? null, note: ctx?.health.fed.note },
    { id: 'news', label: '뉴스 RSS(코인·해외 경제)', status: (s.news?.length ?? 0) + (ctx?.news.length ?? 0) > 0 ? 'ok' : 'missing', delay: '수 분~수십 분(매체별)', asOf: null,
      note: `코인 ${s.news?.length ?? 0}건 · 해외 ${ctx?.news.length ?? 0}건 → 사건 ${newsEvents.length}개` },
  ];
  return { output, observations, events, missing, costs: { feeBps, slippageBps, fundingBps }, newsEvents, fed, providers };
}
