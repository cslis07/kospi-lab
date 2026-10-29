import assert from 'node:assert/strict';
import { scalpImpact, weekRules, lossGauge, cumSeries, dayCost, type DashPos } from '../lib/reviewDash';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
console.log('reviewDash.ts');

const NOW = Date.parse('2026-10-29T06:00:00Z'); // KST 15:00
const M = 60_000, H = 3_600_000, D = 86_400_000;
const p = (o: Partial<DashPos>): DashPos => ({ openTs: NOW - 3 * H, closeTs: NOW - H, netProfit: 0, grossPnl: 0, fee: 0, funding: 0, stop: null, ...o });

ok('scalpImpact: 1시간 미만만 빼면 순손익', () => {
  const r = scalpImpact([p({ openTs: NOW - 30 * M, closeTs: NOW, netProfit: -10, fee: -3 }), p({ netProfit: 5 })]);
  assert.equal(r.n, 1); assert.equal(r.net, -10); assert.equal(r.fee, -3); assert.equal(r.netAll, -5); assert.equal(r.netWithout, 5);
});

ok('weekRules: 이번 주·지난주 7일 창 · 비용 비중·단타·손절 비율', () => {
  const r = weekRules([
    p({ openTs: NOW - D - 3 * H, closeTs: NOW - D, grossPnl: 100, fee: -20, funding: -5, stop: 1 }),
    p({ openTs: NOW - 2 * D - 20 * M, closeTs: NOW - 2 * D, grossPnl: -10, fee: -5 }),
    p({ openTs: NOW - 8 * D - 3 * H, closeTs: NOW - 8 * D, grossPnl: 50, fee: -5, stop: 2 }),
  ], NOW);
  assert.deepEqual(r.cur, { n: 2, costPct: 30, scalpN: 1, slRate: 50 }); // 비용 30 / 번 돈 100
  assert.deepEqual(r.prev, { n: 1, costPct: 10, scalpN: 0, slRate: 100 });
  assert.equal(weekRules([], NOW).cur.costPct, null);
});

ok('lossGauge: 오늘(KST)·7일 · 한도 미설정이면 평가금 3% 가정', () => {
  const ps = [p({ closeTs: NOW - H, netProfit: -12 }), p({ closeTs: NOW - 16 * H, netProfit: -8 }), p({ closeTs: NOW - 8 * D, netProfit: -100 })];
  const g = lossGauge(ps, NOW, { dailyLossLimitUsdt: null, weeklyLossLimitUsdt: 50 }, 1000);
  assert.equal(g.today, -12);   // 16시간 전 = 어제 KST 23:00
  assert.equal(g.week, -20);
  assert.equal(g.dailyLimit, 30); assert.equal(g.dailyAssumed, true); assert.equal(g.weeklyLimit, 50);
  const u = lossGauge(ps, NOW, { dailyLossLimitUsdt: 40, weeklyLossLimitUsdt: null }, null);
  assert.equal(u.dailyLimit, 40); assert.equal(u.dailyAssumed, false);
  assert.equal(lossGauge(ps, NOW, { dailyLossLimitUsdt: null, weeklyLossLimitUsdt: null }, null).dailyLimit, null);
});

ok('cumSeries·dayCost', () => {
  assert.deepEqual(cumSeries([p({ closeTs: 2, netProfit: 3 }), p({ closeTs: 1, netProfit: 1 })], (x) => x.netProfit), [1, 4]);
  assert.deepEqual(cumSeries([p({ netProfit: 3 })], (x) => x.netProfit), [0, 3]);
  const m = dayCost([p({ openTs: NOW, fee: -1, netProfit: 2 }), p({ openTs: NOW + M, fee: -2, netProfit: -5 })]);
  assert.deepEqual(m.get('2026-10-29'), { fee: -3, net: -3 });
});

console.log(`\n${passed} passed`);
