/**
 * 업종 히트맵 배치(lib/treemap) — 넓이가 무게에 비례하고, 칸이 겹치지 않고 전체를 채우는지.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import { treemap } from '../lib/treemap';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

const items = [50, 20, 10, 10, 5, 3, 2].map((w, i) => ({ id: i, w }));
const W = 300, H = 200;
const t = treemap(items, (x) => x.w, W, H);

ok('모든 항목이 한 칸씩', () => assert.equal(t.length, items.length));
ok('넓이 = 무게 비율', () => {
  for (const c of t) assert.ok(Math.abs((c.w * c.h) / (W * H) - c.item.w / 100) < 1e-9);
});
ok('전체를 빈틈없이 채운다(넓이 합)', () => {
  assert.ok(Math.abs(t.reduce((a, c) => a + c.w * c.h, 0) - W * H) < 1e-6);
});
ok('칸끼리 겹치지 않고 영역 밖으로 나가지 않는다', () => {
  for (const a of t) {
    assert.ok(a.x >= -1e-9 && a.y >= -1e-9 && a.x + a.w <= W + 1e-9 && a.y + a.h <= H + 1e-9);
    for (const b of t) if (a !== b) {
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      assert.ok(ox <= 1e-9 || oy <= 1e-9);
    }
  }
});
ok('무게 0·음수는 빼고, 빈 목록이면 빈 배열', () => {
  assert.equal(treemap([{ w: 0 }, { w: -1 }, { w: 2 }], (x) => x.w, 10, 10).length, 1);
  assert.deepEqual(treemap([], () => 1, 10, 10), []);
});

console.log(`\ntreemap: ${passed} passed`);
