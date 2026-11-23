/**
 * KL-006 가드 실행 상태 판정(lib/guardHealth) — 정상·지연(T09)·실패·기록 없음.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import { guardHealth, GUARD_STALE_MS } from '../lib/guardHealth';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
const M = 60_000, NOW = Date.UTC(2026, 10, 23, 3, 0);

console.log('guardHealth — 가드 실행 상태');
ok('5분 전 성공 = 정상', () => assert.equal(guardHealth({ at: NOW - 5 * M }, NOW).state, 'ok'));
ok('15분 넘게 성공 없음 = 지연(T09) — 마지막 성공 시각은 그대로 알려 줌', () => {
  const g = guardHealth({ at: NOW - 16 * M }, NOW);
  assert.equal(g.state, 'delayed'); assert.equal(g.lastSuccessAgoMs, 16 * M);
});
ok('경계: 정확히 15분은 아직 정상(GitHub 실행 지각 허용)', () => assert.equal(guardHealth({ at: NOW - GUARD_STALE_MS }, NOW).state, 'ok'));
ok('마지막 실패가 마지막 성공보다 뒤 = 실패', () => {
  const g = guardHealth({ at: NOW - 10 * M, lastErrorAt: NOW - 2 * M }, NOW);
  assert.equal(g.state, 'failed'); assert.equal(g.lastErrorAgoMs, 2 * M); assert.equal(g.lastSuccessAgoMs, 10 * M);
});
ok('실패 뒤 다시 성공하면 정상으로 돌아옴', () => assert.equal(guardHealth({ at: NOW - 1 * M, lastErrorAt: NOW - 6 * M }, NOW).state, 'ok'));
ok('성공 기록 없이 실패만 = 실패', () => assert.equal(guardHealth({ lastErrorAt: NOW - M }, NOW).state, 'failed'));
ok('기록 없음', () => { assert.equal(guardHealth(null, NOW).state, 'none'); assert.equal(guardHealth({}, NOW).state, 'none'); });
ok('미래 시각(시계 차이)은 0으로 보정', () => assert.equal(guardHealth({ at: NOW + M }, NOW).lastSuccessAgoMs, 0));

console.log(`guardHealth: ${passed}건 통과`);
