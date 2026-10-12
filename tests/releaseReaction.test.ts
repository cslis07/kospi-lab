import assert from 'node:assert/strict';
import { computeReaction, toNum, type PricePoint, type ReleaseLite } from '../lib/releaseReaction';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

console.log('releaseReaction.ts');

ok('toNum: 콤마·단위·% 제거', () => {
  assert.equal(toNum('1,716.00K'), 1716);
  assert.equal(toNum('-0.4%'), -0.4);
  assert.equal(toNum('3.6%'), 3.6);
  assert.equal(toNum(null), null);
  assert.equal(toNum(''), null);
});

// 가격: 10일, 매일 +0 기준에 특정일만 변동
const series: PricePoint[] = [
  { date: '2026-01-01', close: 100 },
  { date: '2026-01-02', close: 100 },
  { date: '2026-01-03', close: 110 }, // +10% on 01-03
  { date: '2026-01-04', close: 110 },
  { date: '2026-01-05', close: 99 },  // -10% on 01-05
  { date: '2026-01-06', close: 99 },
];

ok('offset 0: 발표일 당일 변동률로 상회/하회 분류', () => {
  const rel: ReleaseLite[] = [
    { date: '2026-01-03', actual: '3.5%', forecast: '3.0%' }, // 상회 → 01-03 당일 +10%
    { date: '2026-01-05', actual: '2.0%', forecast: '2.5%' }, // 하회 → 01-05 당일 -10%
  ];
  const r = computeReaction(rel, series, 0);
  assert.equal(r.up.n, 1);
  assert.ok(Math.abs(r.up.avgPct - 10) < 1e-6);
  assert.equal(r.down.n, 1);
  assert.ok(Math.abs(r.down.avgPct - (-10)) < 1e-6);
  assert.equal(r.up.posRate, 100);
  assert.equal(r.down.posRate, 0);
});

ok('offset 1: 코스피식 — 발표 다음 거래일 변동률', () => {
  const rel: ReleaseLite[] = [{ date: '2026-01-02', actual: '3.5%', forecast: '3.0%' }]; // 상회, 다음날(01-03) +10%
  const r = computeReaction(rel, series, 1);
  assert.equal(r.up.n, 1);
  assert.ok(Math.abs(r.up.avgPct - 10) < 1e-6);
});

ok('예측 없으면 서프라이즈 집계에서 제외', () => {
  const rel: ReleaseLite[] = [{ date: '2026-01-03', actual: '3.5%', forecast: null }];
  const r = computeReaction(rel, series, 0);
  assert.equal(r.up.n, 0);
  assert.equal(r.down.n, 0);
  assert.equal(r.flat.n, 0);
});

ok('결과=예측이면 flat', () => {
  const rel: ReleaseLite[] = [{ date: '2026-01-03', actual: '3.0%', forecast: '3.0%' }];
  const r = computeReaction(rel, series, 0);
  assert.equal(r.flat.n, 1);
  assert.equal(r.up.n, 0);
});

ok('대조군 n = 가격 일수 − 1', () => {
  const r = computeReaction([], series, 0);
  assert.equal(r.control.n, series.length - 1);
});

console.log(`\n${passed} passed`);
