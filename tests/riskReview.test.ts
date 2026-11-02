/**
 * 위험관리 복기(lib/riskReview) — R 배수·손절 준수·규칙 위반·거래소 매칭·평균 R·기대값·MDD·연속 손실·그룹별 성과.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import { rMultiple, stopRespected, rowFromDecision, rowFromJournal, matchClosed, groupStat, maxDrawdown, maxLossStreak, summarizeReview, type RiskDecisionRecord, type ReviewRow, type ClosedLite } from '../lib/riskReview';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
const near = (a: number | null | undefined, b: number, eps = 1e-9) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const H = 3600_000;

const dec = (p: Partial<RiskDecisionRecord> = {}): RiskDecisionRecord => ({
  id: 'd1', ts: 1_000 * H, symbol: 'BTCUSDT', direction: 'long', verdict: 'ALLOW', reasonCodes: [], leverage: 5,
  entry: 100, stop: 99, target: 103, equity: 2000, plannedLossUsdt: 10, plannedNetRR: 2, plannedGrossRR: 3,
  feeEstUsdt: 1, slippageEstUsdt: 0.5, fundingEstUsdt: 0.1, eventWindow: 'clear', trend4h: 'up', trend1d: 'up',
  entryReason: '', taken: true, outcome: null, ...p,
});
const row = (p: Partial<ReviewRow>): ReviewRow => ({ ts: 0, side: 'long', leverage: 5, plannedLossUsdt: 10, net: 0, fee: null, funding: null, r: null, verdict: 'ALLOW', ruleViolation: false, stopRespected: true, eventWindow: 'clear', regime: 'trend', ...p });

ok('R 배수·손절 준수(계획 손실 110% 이내)', () => {
  near(rMultiple(-10, 10), -1); near(rMultiple(25, 10), 2.5); assert.equal(rMultiple(5, 0), null);
  assert.equal(stopRespected(-10.9, 10), true); assert.equal(stopRespected(-11.5, 10), false); assert.equal(stopRespected(3, 10), true);
  assert.equal(stopRespected(null, 10), null);
});

ok('판정 기록 → 행: WAIT·BLOCK 인데 진입하면 규칙 위반, 진입 안 함은 제외', () => {
  const out = { source: 'bitget' as const, openTs: 1_000 * H, closeTs: 1_002 * H, openAvg: 100, closeAvg: 99, netProfit: -12, grossPnl: -10, fee: -1.5, funding: -0.5 };
  const a = rowFromDecision(dec({ outcome: out }))!;
  near(a.r, -1.2); assert.equal(a.stopRespected, false); assert.equal(a.ruleViolation, true); assert.equal(a.fee, 1.5);
  const b = rowFromDecision(dec({ verdict: 'WAIT', outcome: { ...out, netProfit: 5 } }))!;
  assert.equal(b.ruleViolation, true); assert.equal(b.stopRespected, true);
  const c = rowFromDecision(dec({ outcome: { ...out, netProfit: 5 } }))!;
  assert.equal(c.ruleViolation, false); assert.equal(c.regime, 'trend');
  assert.equal(rowFromDecision(dec({ taken: false })), null);
  assert.equal(rowFromDecision(dec({ trend4h: 'flat' }))!.regime, 'range');
});

ok('매매일지(읽기 전용) → 행 — 계획 손실은 노션×손절거리, 없으면 시드×위험%', () => {
  const r = rowFromJournal({ ts: 1, direction: 'short', entry: 100, stop: 102, leverage: 10, result: 'loss', resultR: -1, realizedUsdt: -20, notionUsdt: 1000 })!;
  near(r.plannedLossUsdt, 20); assert.equal(r.stopRespected, true); assert.equal(r.r, -1); assert.equal(r.leverage, 10);
  const s = rowFromJournal({ ts: 1, direction: 'long', entry: 100, stop: 99, leverage: 5, result: 'loss', resultR: null, realizedUsdt: -30, seedUsdt: 1000, riskPct: 1 })!;
  near(s.plannedLossUsdt, 10); near(s.r, -3); assert.equal(s.stopRespected, false);
  assert.equal(rowFromJournal({ ts: 1, direction: 'wait', entry: 1, stop: 1, leverage: 1, result: 'win', resultR: 1 }), null);
  assert.equal(rowFromJournal({ ts: 1, direction: 'long', entry: 1, stop: 1, leverage: 1, result: 'open', resultR: null }), null);
});

ok('거래소 매칭 — 같은 심볼·방향, 판정 −30분~+6시간, 가장 가까운 것, 한 번만', () => {
  const c = (id: string, side: 'long' | 'short', openH: number, sym = 'BTCUSDT'): ClosedLite => ({ positionId: id, symbol: sym, side, openAvg: 100, closeAvg: 101, netProfit: 1, grossPnl: 1.2, fee: -0.2, funding: 0, openTs: openH * H, closeTs: (openH + 1) * H });
  const ds = [dec({ id: 'a', ts: 1_000 * H }), dec({ id: 'b', ts: 1_001 * H }), dec({ id: 'x', ts: 1_000 * H, direction: 'short' })];
  const m = matchClosed(ds, [c('p1', 'long', 1_000.5), c('p2', 'long', 1_001.2), c('p3', 'long', 1_010), c('p4', 'short', 1_000, 'ETHUSDT')]);
  assert.equal(m.get('a')!.positionId, 'p1'); assert.equal(m.get('b')!.positionId, 'p2'); assert.equal(m.has('x'), false);
});

ok('집계 — 평균 R·수수료 차감 기대값·승률·MDD·최장 연속 손실', () => {
  const rows = [row({ ts: 1, net: 20, r: 2, fee: 1 }), row({ ts: 2, net: -10, r: -1, fee: 1 }), row({ ts: 3, net: -12, r: -1.2, fee: 1 }), row({ ts: 4, net: 0, r: 0 }), row({ ts: 5, net: -5, r: -0.5 }), row({ ts: 6, net: 30, r: 3 })];
  const g = groupStat(rows);
  assert.equal(g.n, 6); near(g.avgR, (2 - 1 - 1.2 + 0 - 0.5 + 3) / 6); near(g.expectancy, 23 / 6); near(g.feeSum, 3);
  assert.equal(g.wins, 2); assert.equal(g.losses, 3); near(g.winRate, 0.4);
  near(maxDrawdown(rows), 27); // 20 → −7
  assert.equal(maxLossStreak(rows), 3); // 본전은 건너뜀
});

ok('요약 — 5배 vs 10배·롱/숏·발표 구간·추세/횡보·준수율·위반율', () => {
  const rows = [
    row({ net: 5, r: 0.5, leverage: 5, side: 'long', eventWindow: 'pre', regime: 'range', ruleViolation: true }),
    row({ net: -10, r: -1, leverage: 10, side: 'short', eventWindow: 'clear', regime: 'trend' }),
    row({ net: -15, r: -1.5, leverage: 8, side: 'short', eventWindow: 'post', stopRespected: false, ruleViolation: true }),
  ];
  const s = summarizeReview(rows);
  assert.equal(s.byLeverage[0].stat.n, 1); assert.equal(s.byLeverage[1].stat.n, 2); assert.equal(s.byLeverage[2].stat.n, 0);
  assert.equal(s.bySide[1].stat.n, 2); assert.equal(s.byEvent[0].stat.n, 2); assert.equal(s.byRegime[1].stat.n, 1);
  near(s.stopRespectRate, 2 / 3); near(s.violationRate, 2 / 3);
  assert.equal(summarizeReview([]).all.avgR, null);
});

console.log(`\nriskReview: ${passed} passed`);
