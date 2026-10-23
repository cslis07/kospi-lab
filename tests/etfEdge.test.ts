import assert from 'node:assert/strict';
import { mergeRows, buildEtfEdge, MIN_DAYS } from '../lib/etfEdge';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
console.log('etfEdge.ts');

const day = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
const flows = (n: number) => Array.from({ length: n }, (_, i) => ({ date: day(i), totalNetInflow: ((i * 37) % 11 - 5) * 1e8, cumNetInflow: 0 }));
const target = (n: number) => Array.from({ length: n + 1 }, (_, i) => ({ date: day(i), value: 100 + ((i * 13) % 7) }));

ok('병합: 같은 날짜는 새 값, 오름차순, 깨진 행 제외', () => {
  const m = mergeRows(
    [{ date: '2026-01-02', totalNetInflow: 1, cumNetInflow: 0 }, { date: '2026-01-01', totalNetInflow: 2, cumNetInflow: 0 }],
    [{ date: '2026-01-02', totalNetInflow: 9, cumNetInflow: 0 }, { date: '', totalNetInflow: 3, cumNetInflow: 0 }, { date: '2026-01-03', totalNetInflow: NaN, cumNetInflow: 0 }],
  );
  assert.deepEqual(m.map((r) => [r.date, r.totalNetInflow]), [['2026-01-01', 2], ['2026-01-02', 9]]);
});
ok(`보관분이 ${MIN_DAYS}일 미만이면 통계 없이 need만`, () => {
  const e = buildEtfEdge('BTC', flows(22), target(22));
  assert.equal(e.rows.length, 0); assert.equal(e.need, MIN_DAYS - e.days); assert.ok(e.days >= 20);
});
ok('충분하면 급증·급감 두 줄, 순유입은 $M 단위', () => {
  const e = buildEtfEdge('ETH', flows(200), target(200));
  assert.equal(e.rows.length, 2); assert.equal(e.need, 0);
  assert.equal(e.rows[0].unit, '$M'); assert.equal(e.latest!.netM, flows(200)[199].totalNetInflow / 1e6);
});
ok('결과는 다음 날 일봉(미래 누설 없음)', () => {
  const e = buildEtfEdge('BTC', flows(3), target(3));
  assert.equal(e.to, day(2));   // 마지막 순유입일 day(2) → day(3) 수익률까지
});
console.log(`\n${passed} passed`);
