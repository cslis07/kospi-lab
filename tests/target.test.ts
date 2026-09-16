/**
 * 목표 수익률 시스템 회귀 테스트 — 돈에 닿는 산수는 전부 고정한다.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import {
  measureEdge, requiredAvgR, projectedMonthlyPct, neededWinRate, neededRR, neededTrades, neededRiskPct,
  assessTarget, monthToDate, DEFAULT_TARGET, HARD_MAX_RISK_PCT, type EdgeRow,
} from '../lib/targetPlan';
import { computeLeakage, type LeakRow } from '../lib/leakage';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const NOW = Date.UTC(2026, 8, 16, 12);
const DAY = 86_400_000;
const row = (daysAgo: number, result: EdgeRow['result'], resultR: number | null, realizedUsdt?: number | null): EdgeRow & LeakRow =>
  ({ ts: NOW - daysAgo * DAY, result, resultR, realizedUsdt });

console.log('targetPlan — 역산');
ok('월 5% = 20회 × 1% → 회당 +0.25R 필요', () => near(requiredAvgR({ seedUsdt: 1000, monthlyTargetPct: 5, riskPct: 1, tradesPerMonth: 20 }), 0.25));
ok('월 10% = 20회 × 1% → +0.5R', () => near(requiredAvgR({ ...DEFAULT_TARGET, monthlyTargetPct: 10 }), 0.5));
ok('매매수 0이면 Infinity(불가)', () => assert.equal(requiredAvgR({ ...DEFAULT_TARGET, tradesPerMonth: 0 }), Infinity));
ok('예상 월수익 = 리스크×기대값×횟수', () => near(projectedMonthlyPct(1, 0.3, 20), 6));
ok('필요 승률: W=2,L=1,E=0.25 → 41.7%', () => near(neededWinRate(0.25, 2, 1)!, (1.25 / 3) * 100));
ok('필요 승률은 0~100 클램프', () => { assert.equal(neededWinRate(10, 1, 1), 100); assert.equal(neededWinRate(-5, 1, 1), 0); });
ok('필요 익절R: p=40%,L=1,E=0.25 → 2.125R', () => near(neededRR(0.25, 40, 1)!, (0.25 + 0.6) / 0.4));
ok('필요 횟수: 5%/(1%×0.2R)=25회(올림)', () => assert.equal(neededTrades(5, 1, 0.2), 25));
ok('기대값 0 이하면 횟수/리스크 레버 null', () => { assert.equal(neededTrades(5, 1, 0), null); assert.equal(neededRiskPct(5, 20, -0.1), null); });
ok('필요 리스크: 5%/(20×0.25R)=1%', () => near(neededRiskPct(5, 20, 0.25)!, 1));

console.log('targetPlan — 실측·판정');
const good = [row(1,'win',2), row(2,'win',1.5), row(3,'loss',-1), row(4,'win',1), row(5,'loss',-1), row(6,'win',2), row(7,'win',1), row(8,'loss',-1), row(9,'win',1.5), row(10,'loss',-1), row(11,'win',1)];
ok('measureEdge: 승률·평균R·W/L·표본', () => {
  const e = measureEdge(good, NOW);
  assert.equal(e.rCount, 11); assert.equal(e.tradesLast30d, 11);
  near(e.winRate!, (7 / 11) * 100); near(e.avgLossR!, 1); near(e.avgWinR!, (2+1.5+1+2+1+1.5+1)/7);
});
ok('R 없는 청산은 기대값에서 제외(0으로 안 셈)', () => {
  const e = measureEdge([row(1,'loss',null), row(2,'win',1)], NOW);
  assert.equal(e.rCount, 1); near(e.avgR!, 1);
});
ok('표본<10이면 status unknown', () => assert.equal(assessTarget(DEFAULT_TARGET, measureEdge(good.slice(0,5), NOW)).status, 'unknown'));
ok('기대값 ≥ 필요R → on-track', () => assert.equal(assessTarget(DEFAULT_TARGET, measureEdge(good, NOW)).status, 'on-track'));
ok('기대값 음수 → negative', () => {
  const bad = Array.from({ length: 12 }, (_, i) => row(i + 1, i % 3 === 0 ? 'win' : 'loss', i % 3 === 0 ? 1 : -1));
  assert.equal(assessTarget(DEFAULT_TARGET, measureEdge(bad, NOW)).status, 'negative');
});
ok('부족하면 gap + 레버 4종(승률·익절R·횟수·리스크)', () => {
  const a = assessTarget({ ...DEFAULT_TARGET, monthlyTargetPct: 40 }, measureEdge(good, NOW));
  assert.equal(a.status, 'gap'); assert.ok(a.gapR! > 0);
  assert.deepEqual(a.levers.map((l) => l.key), ['winrate', 'rr', 'trades', 'risk']);
});
ok('리스크 레버가 하드상한 초과면 feasible=false', () => {
  const a = assessTarget({ ...DEFAULT_TARGET, monthlyTargetPct: 60, tradesPerMonth: 10 }, measureEdge(good, NOW));
  const risk = a.levers.find((l) => l.key === 'risk')!;
  assert.equal(risk.feasible, false); assert.ok(HARD_MAX_RISK_PCT === 2);
});

console.log('targetPlan — 이달 진행률');
ok('이달 청산 건만 합산, 미청산·지난달 제외', () => {
  const rows = [row(1,'win',1,50), row(2,'loss',-1,-30), row(3,'open',null,null), { ts: Date.UTC(2026,7,20), result: 'win', resultR: 1, realizedUsdt: 999 } as EdgeRow];
  const p = monthToDate(rows, 1000, NOW);
  assert.equal(p.trades, 2); assert.equal(p.realizedCount, 2); near(p.realizedUsdt, 20); near(p.pct, 2); near(p.rSum, 0);
});

console.log('leakage — 누수 계량');
const opts = { seed: 1000, defaultRiskPct: 1, sinceTs: NOW - 40 * DAY };
ok('손절 초과: -1.8R → 0.8R×10USDT=8', () => {
  const l = computeLeakage([row(1,'loss',-1.8)], opts);
  near(l.items.find((i) => i.key === 'stop')!.usdt, 8); assert.equal(l.items.find((i) => i.key === 'stop')!.count, 1);
});
ok('정확히 -1R은 초과 아님', () => assert.equal(computeLeakage([row(1,'loss',-1)], opts).items[0].usdt, 0));
ok('계획 없는 손실: R null & realized<0', () => near(computeLeakage([row(1,'loss',null,-25)], opts).items.find((i) => i.key === 'unplanned')!.usdt, 25));
ok('복구 매매: 손절 30분 내 재진입 손실만', () => {
  const t = NOW - 5 * DAY;
  const rows: LeakRow[] = [
    { ts: t, result: 'loss', resultR: -1, realizedUsdt: -10 },
    { ts: t + 10 * 60_000, result: 'loss', resultR: -1, realizedUsdt: -12 },   // 복구 매매(손실) → 12
    { ts: t + 2 * 3600_000, result: 'loss', resultR: -1, realizedUsdt: -7 },   // 2시간 뒤 → 제외
  ];
  const l = computeLeakage(rows, opts);
  near(l.items.find((i) => i.key === 'revenge')!.usdt, 12);
});
ok('수수료·펀딩은 그대로 합산, 총합·시드% 정확', () => {
  const l = computeLeakage([row(1,'loss',-1.5)], { ...opts, fees: 3, funding: 2 });
  near(l.totalUsdt, 5 + 3 + 2); near(l.pctOfSeed, 1);
});
ok('sinceTs 이전 매매는 제외', () => assert.equal(computeLeakage([row(50,'loss',-2)], opts).totalUsdt, 0));

console.log(`\n${passed} passed`);
