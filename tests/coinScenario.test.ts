/**
 * 코인 분석 '↗ 상승 / ↘ 하락' 시나리오 가격(lib/coinScenario) 회귀 — 화살표 끝이 늘 방향과 맞는지. 실행: npm test
 */
import assert from 'node:assert/strict';
import { scenarioLevels } from '../lib/coinScenario';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

const P = 100;
const RES = [103, 101, 106, 99];   // 99 는 현재가 아래 → 제외
const SUP = [97, 95, 102, 92];     // 102 는 현재가 위 → 제외

ok('관망 — 다음 저항·지지로 이어짐', () => {
  assert.deepEqual(scenarioLevels(P, RES, SUP, 'wait', { stop: 0, target1: 0 }), { up1: 101, up2: 103, dn1: 97, dn2: 95 });
});

ok('롱 — 위는 목표1, 아래는 손절(방향 맞을 때)', () => {
  assert.deepEqual(scenarioLevels(P, RES, SUP, 'long', { stop: 96, target1: 104 }), { up1: 101, up2: 104, dn1: 97, dn2: 96 });
});

ok('숏 — 위는 손절, 아래는 목표1 (예전 버그: 위에 목표1·아래에 손절)', () => {
  const s = scenarioLevels(P, RES, SUP, 'short', { stop: 104, target1: 96 });
  assert.deepEqual(s, { up1: 101, up2: 104, dn1: 97, dn2: 96 });
});

ok('플랜 가격이 첫 레벨 안쪽이면 다음 저항·지지로 — 돌파 뒤 더 낮은 가격 금지', () => {
  // 롱 목표1 100.5 < 첫 저항 101, 손절 98 > 첫 지지 97
  const s = scenarioLevels(P, RES, SUP, 'long', { stop: 98, target1: 100.5 });
  assert.deepEqual(s, { up1: 101, up2: 103, dn1: 97, dn2: 95 });
});

ok('레벨 부족·중복 — 없으면 undefined, 같은 가격은 건너뜀', () => {
  const s = scenarioLevels(P, [101, 101], [], 'wait', { stop: 0, target1: 0 });
  assert.deepEqual(s, { up1: 101, up2: undefined, dn1: undefined, dn2: undefined });
  for (const d of ['wait', 'long', 'short'] as const) {
    const r = scenarioLevels(P, RES, SUP, d, { stop: d === 'short' ? 105 : 94, target1: d === 'short' ? 93 : 107 });
    if (r.up2 != null) assert.ok(r.up2 > r.up1!, `${d} up2 > up1`);
    if (r.dn2 != null) assert.ok(r.dn2 < r.dn1!, `${d} dn2 < dn1`);
  }
});

console.log(`coinScenario: ${passed} passed`);
