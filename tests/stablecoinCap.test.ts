import assert from 'node:assert/strict';
import { parseStableChart, stableCardFrom, type StablePoint } from '../lib/stablecoinCap';

let passed = 0;
function ok(name: string, fn: () => void) { fn(); passed++; console.log(`ok - ${name}`); }

const ts = (d: string) => String(Date.parse(`${d}T00:00:00Z`) / 1000);

ok('차트 파싱: 모든 페그 합을 십억 달러로, 날짜순, 빈 값 제외', () => {
  const pts = parseStableChart([
    { date: ts('2026-11-11'), totalCirculatingUSD: { peggedUSD: 289_500_000_000, peggedEUR: 1_500_000_000 } },
    { date: ts('2026-11-10'), totalCirculatingUSD: { peggedUSD: 290_000_000_000 } },
    { date: ts('2026-11-09'), totalCirculatingUSD: {} },
    { date: 'x', totalCirculatingUSD: { peggedUSD: 1 } },
    { date: ts('2026-11-08') },
  ]);
  assert.deepEqual(pts, [{ date: '2026-11-10', value: 290 }, { date: '2026-11-11', value: 291 }]);
  assert.deepEqual(parseStableChart(null), []);
  assert.deepEqual(parseStableChart({ a: 1 }), []);
});

ok('카드: 전일 대비·변화율·스파크·52주 범위', () => {
  const pts: StablePoint[] = Array.from({ length: 400 }, (_, i) => ({ date: `d${i}`, value: 200 + i * 0.25 }));
  pts[pts.length - 1] = { date: 'last', value: 297 };
  const c = stableCardFrom(pts)!;
  assert.equal(c.code, 'STABLE');
  assert.equal(c.value, 297);
  assert.equal(c.change, -2.5);            // 299.5 → 297
  assert.equal(c.changeRate, -0.83);
  assert.equal(c.spark.length, 23);
  assert.equal(c.spark[22], 297);
  assert.equal(c.week52High, 299.5);
  assert.equal(c.week52Low, 200 + 34 * 0.25); // 최근 366점의 첫 값
  assert.equal(c.live, false);
  assert.equal(c.unit, 'B');
});

ok('카드: 자료가 2점 미만이면 만들지 않는다', () => {
  assert.equal(stableCardFrom([]), null);
  assert.equal(stableCardFrom([{ date: 'a', value: 290 }]), null);
});

console.log(`\n${passed} passed`);
