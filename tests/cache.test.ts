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
import { withCdn } from '../lib/cdn';

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

// ── withCdn: 정상(200)에만 CDN 헤더, 오류 응답·핸들러가 정한 헤더는 그대로 ──
(async () => {
  const ok200 = withCdn(async () => new Response('{}', { status: 200 }), 60, 600);
  const err502 = withCdn(async () => new Response('x', { status: 502 }), 60, 600);
  const preset = withCdn(async () => new Response('{}', { status: 200, headers: { 'Cache-Control': 's-maxage=5' } }), 60, 600);
  const withArgs = withCdn(async (a: number, b: { p: string }) => new Response(`${a}${b.p}`), 1, 2);
  const [r1, r2, r3, r4] = [await ok200(), await err502(), await preset(), await withArgs(7, { p: 'x' })];
  const body4 = await r4.text();

  ok('withCdn: 200 응답에 s-maxage·stale-while-revalidate 부착', () => assert.equal(r1.headers.get('Cache-Control'), 's-maxage=60, stale-while-revalidate=600'));
  ok('withCdn: 오류 응답(502)은 캐시하지 않는다', () => assert.equal(r2.headers.get('Cache-Control'), null));
  ok('withCdn: 핸들러가 정한 Cache-Control은 덮어쓰지 않는다', () => assert.equal(r3.headers.get('Cache-Control'), 's-maxage=5'));
  ok('withCdn: 인자(req·params)를 그대로 넘긴다', () => assert.equal(body4, '7x'));

  console.log(`\n${passed} passed`);
})();
