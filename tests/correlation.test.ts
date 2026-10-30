/**
 * 상관관계(lib/correlation) — 공통 거래일 정렬·피어슨 값·자료 부족 null·강한 쌍·평균.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import { pairCorr, corrMatrix, strongPairs, avgCorr, corrLabel, MIN_N } from '../lib/correlation';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

const day = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10);
/** 결정적 의사난수 수익률로 가격 시계열 */
function walk(n: number, seed: number, f: (i: number, x: number) => number = (_, x) => x) {
  let s = seed, p = 100;
  const m = new Map<string, number>();
  m.set(day(0), p);
  for (let i = 1; i <= n; i++) { s = (s * 9301 + 49297) % 233280; const x = s / 233280 - 0.5; p *= 1 + f(i, x) * 0.04; m.set(day(i), p); }
  return m;
}

ok('자기 자신·배수 시계열은 1, 반대 수익률은 −1', () => {
  const a = walk(60, 7);
  const twice = new Map([...a].map(([d, v]) => [d, v * 2]));
  assert.equal(pairCorr(a, twice).r, 1);
  const inv = new Map<string, number>(); let p = 100; const ds = [...a.keys()];
  inv.set(ds[0], p);
  for (let i = 1; i < ds.length; i++) { p *= 1 - (a.get(ds[i])! / a.get(ds[i - 1])! - 1); inv.set(ds[i], p); }
  assert.equal(pairCorr(a, inv).r, -1);
});

ok('공통 날짜만 사용 — 한쪽에만 있는 날(코인 주말)은 다음 공통일 수익률에 합쳐짐', () => {
  const coin = walk(60, 3);
  const stock = new Map([...coin].filter(([d]) => new Date(d).getUTCDay() % 6 !== 0)); // 주말 제외
  const c = pairCorr(coin, stock);
  assert.equal(c.r, 1); // 공통일 종가가 같으니 수익률도 같다
  assert.equal(c.n, stock.size - 1);
});

ok(`공통 수익률 ${MIN_N}개 미만이면 null`, () => {
  assert.equal(pairCorr(walk(10, 1), walk(10, 2)).r, null);
  assert.equal(pairCorr(walk(60, 1), new Map()).n, 0);
});

ok('행렬 대칭·대각 1·강한 쌍·평균', () => {
  const a = walk(80, 11), b = new Map([...a].map(([d, v]) => [d, v * 3])), c = walk(80, 99);
  const m = corrMatrix([{ id: 'a', closes: a }, { id: 'b', closes: b }, { id: 'c', closes: c }]);
  assert.equal(m.r[0][0], 1);
  assert.equal(m.r[0][1], 1);
  assert.equal(m.r[1][2], m.r[2][1]);
  assert.deepEqual(strongPairs(m).map((p) => [p.a, p.b]), [['a', 'b']]);
  const avg = avgCorr(m)!;
  assert.ok(avg <= 1 && avg >= -1);
});

ok('말로 풀기', () => {
  assert.equal(corrLabel(0.85), '강하게 같은 방향');
  assert.equal(corrLabel(-0.5), '어느 정도 반대 방향');
  assert.equal(corrLabel(0.1), '거의 무관');
  assert.equal(corrLabel(null), '자료 부족');
});

console.log(`\ncorrelation: ${passed} passed`);
