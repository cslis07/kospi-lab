/**
 * 의사결정 엔진 Phase 3 — 사전 기록(evidence log) 규칙·사후 판정(1시간봉)·중복 제거·기준선 비교. 합성 입력.
 */
import assert from 'node:assert/strict';
import {
  buildLogEntry, shouldRecord, appendEntry, parseLog, judgeSetup, judgeLog, dedupeOutcomes, summarizeOutcomes, candleRanges,
  ENGINE_VERSION, type EngineLogEntry, type LoggedSetup, type SetupOutcome,
} from '../lib/intel/evidenceLog';
import type { DecisionResult } from '../lib/intel/fromAnalysis';
import type { Candle } from '../lib/paperJudge';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

const T0 = Date.parse('2026-11-13T03:00:00Z');
const H = 3_600_000;

const shortSetup = { side: 'short' as const, strategy: 'pullback' as const, entry: 100, zoneLow: 99.8, zoneHigh: 100.2, stop: 101, target1: 98, target2: 96,
  rr1Gross: 2, rr2Gross: 4, rr1Net: 1.87, rr2Net: 3.8, triggerConfirmed: false, triggerDescription: '대기', issues: ['진입 트리거 미확인'],
  maxNotionalUsd: 500, estimatedMarginUsd: 50, modeledMaxLossUsd: 5 };
const longSetup = { ...shortSetup, side: 'long' as const, entry: 95, zoneLow: 94.8, zoneHigh: 95.2, stop: 94, target1: 97, target2: 99, rr1Net: 1.2 };

function result(status: 'WATCH' | 'NO_SETUP' | 'BLOCKED' = 'WATCH', selected: 'short' | null = 'short'): DecisionResult {
  return {
    output: {
      status, bias: 'SHORT_CONTEXT', alignment: -0.6, coverage: 0.89,
      groupScores: { macro: -1, liquidity: -1, derivatives: -0.5, news: null, technical: -0.9 },
      staleIds: [], ignoredIds: [], blocks: status === 'BLOCKED' ? ['미국 PPI: 중요 발표 전후 거래 보류'] : [], reasons: [],
      selected: selected ? shortSetup : null, evaluated: [longSetup, shortSetup], asOf: new Date(T0).toISOString(), disclaimer: '',
    },
    observations: [{ id: 'tech-htf', group: 'technical', family: 'htf', direction: -1, strength: 0.9, reliability: 0.7, availableAt: new Date(T0 - 60_000).toISOString(), maxAgeMinutes: 60, source: 'x', explanation: '' }],
    events: [], missing: [], costs: { feeBps: 8, slippageBps: 5, fundingBps: 1 }, newsEvents: [], fed: [], providers: [],
  } as unknown as DecisionResult;
}
const entry = (atMs: number, over: Partial<EngineLogEntry> = {}, st: 'WATCH' | 'NO_SETUP' | 'BLOCKED' = 'WATCH', sel: 'short' | null = 'short') =>
  ({ ...buildLogEntry(result(st, sel), 'BTCUSDT', 100.5, atMs - 60_000, atMs), ...over });

console.log('evidenceLog — 기록');
ok('기록 항목: 판·상태·선택·후보·비용(bp)·가중치·입력 해시', () => {
  const e = entry(T0);
  assert.equal(e.v, ENGINE_VERSION);
  assert.equal(e.status, 'WATCH');
  assert.equal(e.selected, 'short');
  assert.equal(e.setups.length, 2);
  assert.equal(e.costBps, 14);
  assert.match(e.weights, /macro\.23 liquidity\.19 derivatives\.17 news\.11 technical\.30/);
  assert.equal(e.inputHash, entry(T0 + 5_000).inputHash); // 같은 입력이면 같은 해시
});
ok('기록 규칙: 오래된 시세 ✗ · 첫 기록 ✓ · 같은 시세 ✗ · 60분 안 같은 상태 ✗ · 상태 바뀜 ✓ · 60분 뒤 ✓ · 다른 코인 ✓', () => {
  assert.equal(shouldRecord([], { ...entry(T0), analysisAt: new Date(T0 - 6 * 60_000).toISOString() }), false);
  const e1 = entry(T0);
  assert.equal(shouldRecord([], e1), true);
  assert.equal(shouldRecord([e1], { ...entry(T0 + 60_000), analysisAt: e1.analysisAt }), false);
  assert.equal(shouldRecord([e1], entry(T0 + 30 * 60_000)), false);
  assert.equal(shouldRecord([e1], entry(T0 + 30 * 60_000, {}, 'BLOCKED')), true);
  assert.equal(shouldRecord([e1], entry(T0 + 30 * 60_000, {}, 'WATCH', null)), true);
  assert.equal(shouldRecord([e1], entry(T0 + 61 * 60_000)), true);
  assert.equal(shouldRecord([e1], entry(T0 + 10 * 60_000, { symbol: 'ETHUSDT' })), true);
});
ok('덧붙이기만(원본 불변)·용량 상한·모양 틀린 기록 제거', () => {
  const log = [entry(T0)];
  const next = appendEntry(log, entry(T0 + 2 * H));
  assert.equal(log.length, 1);
  assert.equal(next.length, 2);
  assert.equal(appendEntry(next, entry(T0 + 4 * H), 2)[0].recordedAt, next[1].recordedAt);
  assert.equal(parseLog([entry(T0), { id: 1 }, null, { id: 'x', symbol: 'BTCUSDT', recordedAt: 'bad', setups: [] }]).length, 1);
  assert.deepEqual(parseLog('nope'), []);
});

console.log('evidenceLog — 사후 판정');
const bar = (h: number, o: number, hi: number, lo: number, c: number): Candle => ({ ts: T0 + h * H, o, h: hi, l: lo, c });
const S: LoggedSetup = { side: 'short', entry: 100, zoneLow: 99.8, zoneHigh: 100.2, stop: 101, target1: 98, target2: 96, rr1Net: 1.87, triggerConfirmed: false, issues: [] };
ok('숏: 체결 후 1차 목표 → 승, 순R = 2 − 비용(14bp ÷ 1% = 0.14R)', () => {
  const e = entry(T0 + 1);
  const o = judgeSetup(e, S, [bar(-1, 99, 100.6, 98.9, 99.5), bar(1, 99.5, 100.1, 99.4, 99.9), bar(2, 99.9, 99.95, 97.9, 98.1)], T0 + 10 * H);
  assert.equal(o.status, 'win');
  assert.equal(o.rGross, 2);
  assert.equal(o.rNet, 1.86);
  assert.equal(o.final, true);
});
ok('같은 봉에서 손절·목표 → 손절 먼저(패, 순R −1.14)', () => {
  const o = judgeSetup(entry(T0 + 1), S, [bar(1, 99.5, 100.1, 99.4, 99.9), bar(2, 99.9, 101.2, 97.5, 98)], T0 + 10 * H);
  assert.equal(o.status, 'loss');
  assert.equal(o.rNet, -1.14);
});
ok('24시간 안 미도달 → 무효(성적 제외) · 아직 24시간 전이면 진행 중', () => {
  const bars = Array.from({ length: 30 }, (_, i) => bar(i + 1, 99, 99.5, 98.8, 99.2));
  const v = judgeSetup(entry(T0 + 1), S, bars, T0 + 30 * H);
  assert.equal(v.status, 'void'); assert.equal(v.rNet, null); assert.equal(v.final, true);
  const p = judgeSetup(entry(T0 + 1), S, bars.slice(0, 5), T0 + 5 * H);
  assert.equal(p.status, 'pending'); assert.equal(p.final, false);
});
ok('체결 후 72시간 동안 손절·목표 미도달 → 72시간에 마감(그 시점 종가로 평가)', () => {
  const bars = [bar(1, 99.5, 100.1, 99.4, 99.9), ...Array.from({ length: 90 }, (_, i) => bar(i + 2, 99.5, 99.9, 99.1, 99.5))];
  const mid = judgeSetup(entry(T0 + 1), S, bars, T0 + 40 * H);
  assert.equal(mid.status, 'open'); assert.equal(mid.final, false);
  const end = judgeSetup(entry(T0 + 1), S, bars, T0 + 100 * H);
  assert.equal(end.status, 'open'); assert.equal(end.final, true);
  assert.equal(end.rGross, 0.5);
});

console.log('evidenceLog — 묶음·비교');
const oc = (over: Partial<SetupOutcome>): SetupOutcome => ({ key: 'BTCUSDT|short|100|101', entryId: 'a', symbol: 'BTCUSDT', side: 'short', recordedAt: new Date(T0).toISOString(),
  engineStatus: 'WATCH', selected: true, v: ENGINE_VERSION, status: 'win', rGross: 2, rNet: 1.86, final: true, ...over });
ok('같은 후보 24시간 안 재기록은 1건, 24시간 뒤는 새 표본', () => {
  const d = dedupeOutcomes([oc({}), oc({ recordedAt: new Date(T0 + 5 * H).toISOString() }), oc({ recordedAt: new Date(T0 + 25 * H).toISOString() })]);
  assert.equal(d.length, 2);
});
ok('엔진 선택 / 전체 후보(기준선) / 엔진이 거른 후보 나눔 · 평균 순R', () => {
  const xs = [
    oc({}),
    oc({ key: 'k2', selected: false, side: 'long', status: 'loss', rGross: -1, rNet: -1.14 }),
    oc({ key: 'k3', engineStatus: 'BLOCKED', selected: false, status: 'loss', rGross: -1, rNet: -1.14 }),
    oc({ key: 'k4', status: 'void', rGross: null, rNet: null }),
    oc({ key: 'k5', status: 'pending', rGross: null, rNet: null, final: false }),
  ];
  const [sel, all, held] = summarizeOutcomes(xs);
  assert.equal(sel.n, 3); assert.equal(sel.judged, 1); assert.equal(sel.avgNetR, 1.86); assert.equal(sel.voided, 1); assert.equal(sel.pending, 1);
  assert.equal(all.n, 5); assert.equal(all.judged, 3); assert.equal(all.avgNetR, Math.round(((1.86 - 2.28) / 3) * 100) / 100);
  assert.equal(held.n, 2); assert.equal(held.losses, 2);
});
ok('judgeLog: 캔들 없는 코인은 건너뜀 · 판정 범위는 기록~72시간(지금까지)', () => {
  const log = [entry(T0), entry(T0 + 2 * H, { symbol: 'ETHUSDT' })];
  const r = judgeLog(log, { BTCUSDT: [bar(1, 99.5, 100.1, 99.4, 99.9)] }, T0 + 3 * H);
  assert.equal(r.length, 2);
  assert.ok(r.every((x) => x.symbol === 'BTCUSDT'));
  const rg = candleRanges(log, T0 + 100 * H);
  assert.equal(rg.BTCUSDT.from, T0); assert.equal(rg.BTCUSDT.to, T0 + 72 * H);
  assert.equal(candleRanges(log, T0 + 10 * H).ETHUSDT.to, T0 + 10 * H);
});

console.log(`\nevidenceLog: ${passed}건 통과`);
