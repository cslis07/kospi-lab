/**
 * 공용 TTL+LRU 캐시(lib/cache) 회귀 테스트.
 * 실행: npm test
 *
 * 캐시가 돈 계산은 아니지만, "부정 결과(null)도 hit" · "만료 자동삭제" ·
 * "상한 초과 시 LRU 축출" 세 성질이 깨지면 재조회 폭주·메모리 누수·잘못된
 * 값 재사용으로 이어지므로 고정한다.
 */
import assert from 'node:assert/strict';
import { TtlCache } from '../lib/cache';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

ok('set 후 get 은 {v} 로 hit', () => {
  const c = new TtlCache<number>(10_000);
  c.set('a', 42);
  assert.deepEqual(c.get('a'), { v: 42 });
});

ok('없는 키는 undefined(miss)', () => {
  const c = new TtlCache<number>(10_000);
  assert.equal(c.get('없음'), undefined);
});

ok('캐시된 null 도 miss 가 아니라 hit — 재조회 폭주 방지', () => {
  const c = new TtlCache<number | null>(10_000);
  c.set('miss', null);
  const got = c.get('miss');
  assert.deepEqual(got, { v: null });
  assert.notEqual(got, undefined);
});

ok('만료 항목은 get 시 undefined 이며 자동 삭제(size 감소)', () => {
  const c = new TtlCache<number>(-1); // 즉시 만료(exp = now-1)
  c.set('a', 1);
  assert.equal(c.size, 1);
  assert.equal(c.get('a'), undefined);
  assert.equal(c.size, 0);
});

ok('용량 초과 시 가장 오래된 키를 축출', () => {
  const c = new TtlCache<number>(10_000, 2);
  c.set('a', 1); c.set('b', 2); c.set('c', 3); // a 축출
  assert.equal(c.get('a'), undefined);
  assert.deepEqual(c.get('b'), { v: 2 });
  assert.deepEqual(c.get('c'), { v: 3 });
  assert.equal(c.size, 2);
});

ok('get 으로 접근한 키는 최신으로 갱신되어 살아남는다(LRU)', () => {
  const c = new TtlCache<number>(10_000, 2);
  c.set('a', 1); c.set('b', 2);
  c.get('a');        // a 를 최근 사용으로 표시
  c.set('c', 3);     // 이제 가장 오래된 것은 b → b 축출
  assert.deepEqual(c.get('a'), { v: 1 });
  assert.equal(c.get('b'), undefined);
  assert.deepEqual(c.get('c'), { v: 3 });
});

ok('set 재호출은 값 갱신 + 최신화(중복 키 크기 안 늘림)', () => {
  const c = new TtlCache<number>(10_000, 2);
  c.set('a', 1); c.set('a', 9);
  assert.deepEqual(c.get('a'), { v: 9 });
  assert.equal(c.size, 1);
});

ok('delete·clear 동작', () => {
  const c = new TtlCache<number>(10_000);
  c.set('a', 1); c.set('b', 2);
  c.delete('a');
  assert.equal(c.get('a'), undefined);
  assert.equal(c.size, 1);
  c.clear();
  assert.equal(c.size, 0);
});

console.log(`\n${passed} passed`);
