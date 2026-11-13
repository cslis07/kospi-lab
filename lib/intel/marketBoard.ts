/**
 * 코인 홈 '엔진 공통 환경' — 분석을 돌리지 않아도 알 수 있는 시장 공통 입력만 정리(Phase 4). 순수 함수.
 *  - 지금 걸린 공통 거래 보류(공식 발표 전후·위기 속보·FOMC 성명)와 다음 발표 보류 구간
 *  - 유동성(스테이블코인·BTC/ETH 현물 ETF) 방향과 유효기간
 *  - 뉴스 충격 보드(해외 경제 뉴스 사건 묶음·확인 수준) — 코인별 뉴스는 분석 실행 때만 받는다
 *  - 데이터 공급자 상태
 * 코인별 기술·파생 판단은 분석 응답이 있어야 하므로 여기서 만들지 않는다(마지막 엔진 기록만 보여 준다).
 */
import { activeBlock, type RiskEvent, type SignalObservation } from './decisionEngine';
import { liquidityObservations, type IntelContext } from './liquidity';
import { clusterNews, newsRiskEvents, fedRiskEvents, type NewsEvent } from './newsEvents';
import { releaseEvents } from './fromAnalysis';
import type { EngineLogEntry } from './evidenceLog';

export interface BoardBlock { name: string; reason: string; sourceUrl?: string }
export interface BoardRelease { title: string; at: string; blockFrom: string; blockTo: string; active: boolean; hoursUntil: number }
export interface BoardLiquidity { obs: SignalObservation; stale: boolean }
export interface BoardProvider { id: string; label: string; ok: boolean; delay: string; note?: string }

export interface MarketBoard {
  asOf: string;
  blocks: BoardBlock[];
  nextRelease: BoardRelease | null;
  liquidity: BoardLiquidity[];
  news: NewsEvent[];
  providers: BoardProvider[];
}

const isStale = (o: SignalObservation, now: number) => {
  const t = Date.parse(o.availableAt);
  return !Number.isFinite(t) || t > now || now - t > o.maxAgeMinutes * 60_000;
};

export function buildMarketBoard(ctx: IntelContext, nowMs: number, preMin = 60, postMin = 30): MarketBoard {
  const all = clusterNews(ctx.news, nowMs, 24);
  // 보드에는 시장 주제가 없는 연준 행정 공지(결제 수수료·제재 등)는 뺀다 — 통화정책 성명은 주제(연준·금리)가 붙어 남는다
  const news = all.filter((e) => e.topic != null || e.verification !== 'official');
  const rel = releaseEvents(ctx, [], preMin, postMin);
  const events: RiskEvent[] = [...rel, ...newsRiskEvents(all, nowMs), ...fedRiskEvents(ctx.fed, nowMs, postMin)];
  const blocks = events.map((e) => ({ e, reason: activeBlock(e, nowMs) }))
    .filter((x): x is { e: RiskEvent; reason: string } => x.reason != null)
    .map(({ e, reason }) => ({ name: e.name, reason, sourceUrl: e.sourceUrl }));
  const next = rel.filter((e) => Date.parse(e.scheduledAt!) + postMin * 60_000 >= nowMs)
    .sort((a, b) => Date.parse(a.scheduledAt!) - Date.parse(b.scheduledAt!))[0];
  const nextRelease: BoardRelease | null = next ? (() => {
    const at = Date.parse(next.scheduledAt!);
    const from = at - preMin * 60_000, to = at + postMin * 60_000;
    return { title: next.name, at: next.scheduledAt!, blockFrom: new Date(from).toISOString(), blockTo: new Date(to).toISOString(),
      active: nowMs >= from && nowMs <= to, hoursUntil: Math.round(((at - nowMs) / 3_600_000) * 10) / 10 };
  })() : null;
  // 스테이블은 코인 공통, ETF 는 BTC·ETH 각각
  const btc = liquidityObservations(ctx, 'BTCUSDT');
  const eth = liquidityObservations(ctx, 'ETHUSDT').filter((o) => o.id === 'liq-etf');
  const liquidity = [...btc, ...eth].map((obs) => ({ obs, stale: isStale(obs, nowMs) }));
  const h = ctx.health;
  const providers: BoardProvider[] = [
    { id: 'calendar', label: '공식 발표 일정', ok: h.calendar.ok, delay: '고정 시각', note: h.calendar.note },
    { id: 'stable', label: 'DefiLlama 스테이블코인', ok: h.stable.ok, delay: '일간', note: h.stable.note },
    { id: 'etf', label: 'SoSoValue 현물 ETF', ok: h.etf.ok, delay: '미국 거래일', note: h.etf.note },
    { id: 'fed', label: '연준 공식 RSS', ok: h.fed.ok, delay: '공개 즉시', note: h.fed.note },
    { id: 'news', label: '해외 경제 뉴스 RSS', ok: h.news.ok, delay: '수 분~수십 분', note: h.news.note },
  ];
  return { asOf: new Date(nowMs).toISOString(), blocks, nextRelease, liquidity, news, providers };
}

/** 코인별 가장 최근 엔진 기록(기록 순서 기준) */
export function lastBySymbol(log: EngineLogEntry[]): EngineLogEntry[] {
  const m = new Map<string, EngineLogEntry>();
  for (const e of log) {
    const old = m.get(e.symbol);
    if (!old || Date.parse(e.recordedAt) >= Date.parse(old.recordedAt)) m.set(e.symbol, e);
  }
  return [...m.values()].sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
}
