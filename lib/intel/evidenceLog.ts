/**
 * 의사결정 엔진 사전 기록(evidence log)·사후 판정 — Phase 3(명세 ENGINE_PLAN_KO.md §4-9·§6). 순수 함수.
 *
 * 기록 규칙(미리 정해 둠 — 결과를 보고 바꾸지 않는다):
 *  - 분석 화면에서 엔진이 평가될 때, 시세가 5분 안으로 신선하면 기록 후보.
 *  - 같은 코인은 60분에 한 번. 단, 상태(BLOCKED/NO_SETUP/WATCH/READY)나 엔진 선택 쪽이 바뀌면 바로 기록.
 *  - 같은 분석 시세(updatedAt)는 한 번만. 기록은 덧붙이기만 하고 고치지 않는다(최초 등록값 고정).
 *  - 모든 상태를 기록한다 — 보류·후보 없음 때의 가격 후보도 같이 판정해 '엔진이 거른 효과'와 비교(기준선).
 *
 * 판정 규칙(lib/paperJudge 와 같음 — 모의 선행테스트와 한 기준):
 *  - 각 후보를 지정가(진입 기준가)로 보고 1시간봉으로 판정. 기록 후 24시간 안에 안 닿으면 무효(성적 제외).
 *  - 목표는 1차 목표. 같은 봉에서 손절·목표 둘 다 닿으면 손절 먼저. 기록 후 72시간에 판정을 닫는다(그때까지 미결이면 그 시점 종가로 평가).
 *  - 순R = R − 비용(수수료+슬리피지+펀딩 bp를 손절폭 대비 R 로 환산).
 *  - ⚠ 15분봉 진입 확인(트리거)은 1시간봉으로 재현할 수 없어 '구간 도달 = 체결'로 본다 → 실제보다 체결이 많게 나온다.
 *  - 같은 코인·방향·진입·손절 후보가 24시간 안에 다시 기록되면 한 건으로 센다(겹치는 표본 부풀림 방지).
 *    BTC·ETH 는 같은 거시 사건을 공유하므로 완전한 독립 표본은 아니다.
 */
import { judgeTrade, type Candle, type Status } from '@/lib/paperJudge';
import { GROUP_WEIGHTS, type EngineStatus, type Group, type Side } from './decisionEngine';
import type { DecisionResult } from './fromAnalysis';

/** 엔진·입력 판 — 가중치·입력 그룹이 바뀌면 올린다(판별로 성적을 나눠 본다) */
export const ENGINE_VERSION = 'v0.2-p2';
export const LOG_KEY = 'kospi-lab-engine-log';
export const LOG_CAP = 500;
export const FRESH_MIN = 5;
export const RECORD_GAP_MIN = 60;
export const VOID_H = 24;
export const HORIZON_H = 72;
export const MIN_JUDGED = 30;

export interface LoggedSetup {
  side: Side; entry: number; zoneLow: number; zoneHigh: number; stop: number; target1: number; target2: number;
  rr1Net: number | null; triggerConfirmed: boolean; issues: string[];
}
export interface EngineLogEntry {
  id: string; v: string; symbol: string;
  recordedAt: string;      // 엔진 평가 시각(UTC)
  analysisAt: string;      // 분석 시세 시각
  price: number;
  status: EngineStatus; bias: string; alignment: number | null; coverage: number;
  groupScores: Record<Group, number | null>;
  blocks: string[];
  selected: Side | null;
  setups: LoggedSetup[];
  costBps: number;         // 왕복 수수료+슬리피지+펀딩
  weights: string;         // 'macro.23 liq.19 …' — 판 확인용
  inputHash: string;       // 관측값·이벤트·후보 요약 해시
}

export function fnv(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
const r6 = (n: number) => Number(n.toPrecision(6));

export function buildLogEntry(r: DecisionResult, symbol: string, price: number, analysisAtMs: number, asOfMs: number): EngineLogEntry {
  const o = r.output;
  const setups: LoggedSetup[] = o.evaluated.map((e) => ({
    side: e.side, entry: r6(e.entry), zoneLow: r6(e.zoneLow), zoneHigh: r6(e.zoneHigh), stop: r6(e.stop),
    target1: r6(e.target1), target2: r6(e.target2), rr1Net: e.rr1Net, triggerConfirmed: e.triggerConfirmed, issues: e.issues,
  }));
  const inputs = JSON.stringify({
    obs: r.observations.map((x) => [x.id, x.direction, x.strength, x.availableAt]),
    ev: r.events.map((x) => [x.id, x.severity, x.scheduledAt ?? x.blockUntil]),
    su: setups.map((s) => [s.side, s.entry, s.stop, s.target1]),
  });
  const recordedAt = new Date(asOfMs).toISOString();
  return {
    id: `${symbol}-${asOfMs.toString(36)}-${fnv(inputs).slice(0, 4)}`, v: ENGINE_VERSION, symbol, recordedAt,
    analysisAt: new Date(analysisAtMs).toISOString(), price: r6(price),
    status: o.status, bias: o.bias, alignment: o.alignment, coverage: o.coverage, groupScores: o.groupScores,
    blocks: o.blocks, selected: o.selected?.side ?? null, setups,
    costBps: Math.round((r.costs.feeBps + r.costs.slippageBps + r.costs.fundingBps) * 100) / 100,
    weights: Object.entries(GROUP_WEIGHTS).map(([g, w]) => `${g}.${Math.round(w * 100)}`).join(' '),
    inputHash: fnv(inputs),
  };
}

/** 미리 정한 기록 규칙에 맞으면 true */
export function shouldRecord(log: EngineLogEntry[], e: EngineLogEntry): boolean {
  const at = Date.parse(e.recordedAt);
  if (at - Date.parse(e.analysisAt) > FRESH_MIN * 60_000) return false;       // 오래된 시세로 기록하지 않음
  const same = log.filter((x) => x.symbol === e.symbol);
  if (same.some((x) => x.analysisAt === e.analysisAt)) return false;          // 같은 분석 시세는 한 번
  const last = same[same.length - 1];
  if (!last) return true;
  if (last.status !== e.status || last.selected !== e.selected) return true;
  return at - Date.parse(last.recordedAt) >= RECORD_GAP_MIN * 60_000;
}

/** 덧붙이기만(앞 기록은 그대로). 용량 상한을 넘으면 가장 오래된 것부터 뺀다 */
export function appendEntry(log: EngineLogEntry[], e: EngineLogEntry, cap = LOG_CAP): EngineLogEntry[] {
  return [...log, e].slice(-cap);
}

/** 저장된 값 검사 — 모양이 틀린 기록은 버린다 */
export function parseLog(raw: unknown): EngineLogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is EngineLogEntry => !!x && typeof x === 'object' && typeof (x as EngineLogEntry).id === 'string' &&
    typeof (x as EngineLogEntry).symbol === 'string' && Number.isFinite(Date.parse((x as EngineLogEntry).recordedAt)) &&
    Array.isArray((x as EngineLogEntry).setups));
}

/* ── 사후 판정 ─────────────────────────────────────────────── */

export interface SetupOutcome {
  key: string; entryId: string; symbol: string; side: Side; recordedAt: string;
  engineStatus: EngineStatus; selected: boolean; v: string;
  status: Status; rGross: number | null; rNet: number | null;
  /** 판정이 끝났는지(승·패·무효, 또는 72시간 경과) */
  final: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function judgeSetup(e: EngineLogEntry, s: LoggedSetup, candles: Candle[], now: number): SetupOutcome {
  const open = Date.parse(e.recordedAt);
  const end = open + HORIZON_H * 3_600_000;
  const nowEff = Math.min(now, end);
  const j = judgeTrade({
    id: e.id, round: 0, coin: e.symbol, side: s.side, type: 'limit', entry: s.entry, stop: s.stop, target: s.target1,
    openedAt: e.recordedAt, voidAt: new Date(open + VOID_H * 3_600_000).toISOString(), conditions: {},
  }, candles.filter((b) => b.ts + 3_600_000 <= end + 1), nowEff);
  const riskPct = Math.abs(s.entry - s.stop) / s.entry;
  const costR = riskPct > 0 ? e.costBps / 1e4 / riskPct : 0;
  const final = j.status === 'win' || j.status === 'loss' || j.status === 'void' || now >= end;
  return {
    key: `${e.symbol}|${s.side}|${s.entry}|${s.stop}`, entryId: e.id, symbol: e.symbol, side: s.side, recordedAt: e.recordedAt,
    engineStatus: e.status, selected: e.selected === s.side, v: e.v,
    status: j.status, rGross: j.r == null ? null : r2(j.r), rNet: j.r == null ? null : r2(j.r - costR), final,
  };
}

export function judgeLog(log: EngineLogEntry[], candlesBySymbol: Record<string, Candle[]>, now: number): SetupOutcome[] {
  const out: SetupOutcome[] = [];
  for (const e of log) {
    const c = candlesBySymbol[e.symbol];
    if (!c) continue;
    for (const s of e.setups) if (Number.isFinite(s.entry) && Number.isFinite(s.stop) && s.entry !== s.stop) out.push(judgeSetup(e, s, c, now));
  }
  return out;
}

/** 24시간 안 같은 후보 반복 기록은 첫 기록만 */
export function dedupeOutcomes(xs: SetupOutcome[]): SetupOutcome[] {
  const seen = new Map<string, number>();
  const out: SetupOutcome[] = [];
  for (const x of [...xs].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt))) {
    const t = Date.parse(x.recordedAt), prev = seen.get(x.key);
    if (prev != null && t - prev < VOID_H * 3_600_000) continue;
    seen.set(x.key, t);
    out.push(x);
  }
  return out;
}

export interface Bucket {
  label: string; n: number; filled: number; wins: number; losses: number; open: number; voided: number; pending: number;
  /** 판정이 끝나고 체결된 것 기준 */
  judged: number; avgNetR: number | null; sumNetR: number; avgGrossR: number | null;
}

export function bucket(label: string, xs: SetupOutcome[]): Bucket {
  const filledFinal = xs.filter((x) => x.final && x.rNet != null);
  const sumNet = filledFinal.reduce((a, x) => a + (x.rNet ?? 0), 0);
  const sumGross = filledFinal.reduce((a, x) => a + (x.rGross ?? 0), 0);
  return {
    label, n: xs.length,
    filled: xs.filter((x) => x.rNet != null).length,
    wins: xs.filter((x) => x.status === 'win').length,
    losses: xs.filter((x) => x.status === 'loss').length,
    open: xs.filter((x) => x.status === 'open').length,
    voided: xs.filter((x) => x.status === 'void').length,
    pending: xs.filter((x) => !x.final).length,
    judged: filledFinal.length,
    avgNetR: filledFinal.length ? r2(sumNet / filledFinal.length) : null,
    sumNetR: r2(sumNet),
    avgGrossR: filledFinal.length ? r2(sumGross / filledFinal.length) : null,
  };
}

/** 엔진 선택(대기·조건 충족) vs 전체 후보(기준선) vs 엔진이 거른 후보 */
export function summarizeOutcomes(xs: SetupOutcome[]): Bucket[] {
  const d = dedupeOutcomes(xs);
  return [
    bucket('엔진 선택(대기·조건 충족)', d.filter((x) => x.selected && (x.engineStatus === 'WATCH' || x.engineStatus === 'READY'))),
    bucket('전체 가격 후보(기준선)', d),
    bucket('엔진이 거른 후보(보류·후보 없음·미선택)', d.filter((x) => !(x.selected && (x.engineStatus === 'WATCH' || x.engineStatus === 'READY')))),
  ];
}

/** 판정에 필요한 1시간봉 범위(심볼별 시작·끝 ms). 72시간이 지나 끝난 기록도 다시 계산하므로 전체 범위 */
export function candleRanges(log: EngineLogEntry[], now: number): Record<string, { from: number; to: number }> {
  const out: Record<string, { from: number; to: number }> = {};
  for (const e of log) {
    const a = Date.parse(e.recordedAt), b = Math.min(now, a + HORIZON_H * 3_600_000);
    const r = out[e.symbol];
    out[e.symbol] = r ? { from: Math.min(r.from, a), to: Math.max(r.to, b) } : { from: a, to: b };
  }
  return out;
}
