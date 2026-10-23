import assert from 'node:assert/strict';
import { riskSize, type RiskTrade } from '../lib/riskSize';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

console.log('riskSize.ts');
const H = 3_600_000;
const T0 = Date.parse('2026-10-01T00:00:00Z');
let k = 0;
const t = (o: Partial<RiskTrade>): RiskTrade => {
  k++;
  return { id: `t${k}`, symbol: 'BTCUSDT', side: 'long', openAvg: 100, closeAvg: 100, size: 10, netProfit: 0, openTs: T0 + k * H, closeTs: T0 + k * H + 30 * 60_000, ...o };
};

ok('자본 대비 % · 2% 초과 · 최대 손실 · 초과 매매 손실 몫', () => {
  const trades = [
    t({ netProfit: -30, closeAvg: 97 }),          // 3% (자본 1000)
    t({ netProfit: -10, closeAvg: 99 }),          // 1%
    t({ netProfit: 50, closeAvg: 105 }),          // 이익 — 행 아님
    t({ netProfit: -60, closeAvg: 94, size: 10 }), // 6%
  ];
  const s = riskSize(trades, 1000)!;
  assert.equal(s.losers, 3);
  assert.equal(s.overCount, 2);
  assert.equal(s.largest!.loss, 60);
  assert.ok(Math.abs(s.largest!.lossPct - 6) < 1e-9);
  assert.ok(Math.abs(s.totalLoss - 100) < 1e-9);
  assert.ok(Math.abs(s.overLossSharePct! - 90) < 1e-9);
  assert.equal(riskSize(trades, 0), null);
});

ok('당시 자본 추정 — 그 매매 포함 이후 청산 순손익을 되돌림', () => {
  k = 0;
  const a = t({ netProfit: -100, closeAvg: 90 });  // 가장 먼저 청산
  const b = t({ netProfit: 200, closeAvg: 120 });
  const c = t({ netProfit: -50, closeAvg: 95 });   // 마지막 청산
  const s = riskSize([a, b, c], 1000)!;
  const ra = s.rows.find((r) => r.id === a.id)!;
  const rc = s.rows.find((r) => r.id === c.id)!;
  // c: 1000 − (−50) = 1050 → 50/1050
  assert.ok(Math.abs(rc.equityThen! - 1050) < 1e-9);
  // a: 1000 − (−50 + 200 − 100) = 950 → 100/950
  assert.ok(Math.abs(ra.equityThen! - 950) < 1e-9);
  assert.ok(Math.abs(ra.lossPctThen! - (100 / 950) * 100) < 1e-9);
  assert.equal(s.overCountThen, 2); // 10.5%, 4.8%
});

ok('원인 — 큰 규모(진입 금액 상위 25%) vs 큰 역행(손실 중 역행 상위 25%)', () => {
  k = 0;
  // 작은 역행 1%지만 크게 건 매매가 큰 손실
  const size = [
    t({ size: 10, closeAvg: 99, netProfit: -10 }),
    t({ size: 10, closeAvg: 98.5, netProfit: -15 }),
    t({ size: 10, closeAvg: 98, netProfit: -20 }),
    t({ size: 100, closeAvg: 99, netProfit: -100 }), // 진입 10,000 → 상위 25%, 역행 1%
  ];
  const s1 = riskSize(size, 1000)!;
  assert.equal(s1.overCount, 1);
  assert.equal(s1.overBigSize, 1);
  assert.equal(s1.overBigMove, 0);
  assert.equal(s1.driver, 'size');
  // 같은 크기로 크게 역행
  k = 0;
  const move = [
    t({ size: 10, closeAvg: 99.5, netProfit: -5 }),
    t({ size: 11, closeAvg: 99.4, netProfit: -6 }),
    t({ size: 12, closeAvg: 99.3, netProfit: -8 }),
    t({ size: 9, closeAvg: 92, netProfit: -72 }),   // 진입 금액 최소, 역행 8%
  ];
  const s2 = riskSize(move, 1000)!;
  assert.equal(s2.driver, 'move');
  assert.equal(s2.rows[0].bigMove, true);
  assert.equal(s2.rows[0].sizeQuartile, 0);
  // 숏 역행은 가격 상승
  k = 0;
  const sh = riskSize([t({ side: 'short', closeAvg: 103, netProfit: -30 })], 1000)!;
  assert.ok(Math.abs(sh.rows[0].movePct - 3) < 1e-9);
  assert.equal(sh.rows[0].sizeQuartile, null); // 4건 미만
  assert.equal(riskSize([t({ netProfit: 5 })], 1000)!.driver, null);
});

console.log(`riskSize: ${passed} passed`);
