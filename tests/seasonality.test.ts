/**
 * 계절성(lib/seasonality) — 월 종가 정리·수익률·월별 통계(진행 중인 달 제외)·빠진 달 처리.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import { monthlyCloses, seasonality } from '../lib/seasonality';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
const ts = (s: string) => Date.parse(s) / 1000;

ok('같은 달 두 점이면 마지막 값 · gmtoffset 반영', () => {
  const m = monthlyCloses([ts('2026-09-30T15:00:00Z'), ts('2026-10-01T00:00:00Z'), ts('2026-10-29T00:00:00Z')], [100, 110, 120], 9 * 3600);
  // 09-30 15:00 UTC + 9h = 10-01 → 10월로 셈, 이후 10월 값이 덮음
  assert.deepEqual([...m.entries()], [['2026-10', 120]]);
});

ok('월 수익률·연간 누적·월별 평균/상승확률', () => {
  const m = new Map([['2024-12', 100], ['2025-01', 110], ['2025-02', 99], ['2025-12', 100], ['2026-01', 90], ['2026-02', 99]]);
  const s = seasonality(m, new Date('2026-10-30T00:00:00Z'));
  assert.equal(s.years[0].year, 2026);
  assert.equal(s.years[0].months[0], -10);
  assert.equal(s.years[0].months[1], 10);
  assert.equal(s.years[1].months[0], 10);
  assert.equal(s.years[1].months[1], -10);
  assert.equal(s.years[1].total, -1); // 1.1 × 0.9 − 1
  const jan = s.stats[0];
  assert.equal(jan.n, 2); assert.equal(jan.avg, 0); assert.equal(jan.upPct, 50);
  assert.equal(s.stats[2].n, 0); assert.equal(s.stats[2].avg, null);
  assert.equal(s.current, null);
});

ok('진행 중인 달은 표에는 있고 통계에서는 빠진다', () => {
  const m = new Map([['2025-09', 100], ['2025-10', 110], ['2026-09', 100], ['2026-10', 90]]);
  const s = seasonality(m, new Date('2026-10-15T00:00:00Z'));
  assert.equal(s.years[0].months[9], -10);
  assert.equal(s.stats[9].n, 1);
  assert.equal(s.stats[9].avg, 10);
  assert.deepEqual(s.current, { year: 2026, month: 10 });
});

ok('빠진 달 다음은 수익률을 만들지 않는다', () => {
  const m = new Map([['2026-01', 100], ['2026-03', 120]]);
  const s = seasonality(m, new Date('2026-10-15T00:00:00Z'));
  assert.deepEqual(s.years, []);
});

console.log(`\nseasonality: ${passed} passed`);
