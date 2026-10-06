/**
 * 셋업·실수 태그별 성적(lib/tradeTags) 회귀 테스트 — 실행: npm test
 * 한 매매가 여러 태그에 반영되는 집계·승률·순손익이 틀리면 "어떤 셋업이 돈이 되나"가 거짓이 된다.
 */
import assert from 'node:assert/strict';
import { tagStats, hasAnyTag, convictionStats, SETUPS, MISTAKES } from '../lib/tradeTags';
import type { TradePosition } from '../lib/tradeReport';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

const pos = (id: string, net: number): TradePosition => ({
  positionId: id, symbol: 'BTCUSDT', side: 'long', openAvg: 1, closeAvg: 1,
  netProfit: net, fee: 0, funding: 0, openTs: 0, closeTs: 0,
});

ok('셋업 정의 키는 유일하다', () => {
  assert.equal(new Set(SETUPS.map((t) => t.key)).size, SETUPS.length);
  assert.equal(new Set(MISTAKES.map((t) => t.key)).size, MISTAKES.length);
});

ok('태그별 집계 — 건수·승률·순손익, 건수 내림차순', () => {
  const positions = [pos('a', 10), pos('b', -4), pos('c', 6)];
  const tags = {
    a: { setups: ['breakout'], mistakes: [] },
    b: { setups: ['breakout'], mistakes: ['chase'] },
    c: { setups: ['pullback'], mistakes: [] },
  };
  const s = tagStats(positions, tags, 'setup');
  assert.equal(s.length, 2);
  assert.equal(s[0].key, 'breakout'); // 2건으로 최다
  assert.equal(s[0].count, 2);
  assert.equal(s[0].wins, 1);
  assert.equal(s[0].netSum, 6);       // 10 + (-4)
  assert.equal(Math.round(s[0].winRate!), 50);
  assert.equal(s[0].avg, 3);
  assert.equal(s[1].key, 'pullback');
});

ok('실수 태그는 mistakes만 집계', () => {
  const positions = [pos('a', 10), pos('b', -4)];
  const tags = { a: { setups: ['breakout'], mistakes: [] }, b: { setups: [], mistakes: ['chase', 'nostop'] } };
  const m = tagStats(positions, tags, 'mistake');
  assert.equal(m.length, 2);                       // chase, nostop
  assert.equal(m.find((x) => x.key === 'chase')!.netSum, -4);
  assert.equal(m.find((x) => x.key === 'nostop')!.count, 1);
});

ok('한 매매가 여러 태그에 모두 반영되고, 같은 태그 중복은 1회', () => {
  const positions = [pos('a', 5)];
  const tags = { a: { setups: ['breakout', 'breakout', 'trend'], mistakes: [] } };
  const s = tagStats(positions, tags, 'setup');
  assert.equal(s.find((x) => x.key === 'breakout')!.count, 1); // 중복 제거
  assert.equal(s.find((x) => x.key === 'trend')!.count, 1);
});

ok('정의에 없는 태그 키는 버린다', () => {
  const s = tagStats([pos('a', 5)], { a: { setups: ['__nope'], mistakes: [] } }, 'setup');
  assert.equal(s.length, 0);
});

ok('hasAnyTag', () => {
  assert.equal(hasAnyTag({ setups: ['breakout'], mistakes: [] }), true);
  assert.equal(hasAnyTag({ setups: [], mistakes: [] }), false);
  assert.equal(hasAnyTag(undefined), false);
});

ok('확신별 성적 — 레벨 오름차순, 승률·평균', () => {
  const positions = [pos('a', 10), pos('b', -4), pos('c', 6), pos('d', 8)];
  const tags = {
    a: { setups: [], mistakes: [], conviction: 5 },
    b: { setups: [], mistakes: [], conviction: 5 },
    c: { setups: [], mistakes: [], conviction: 3 },
    d: { setups: [], mistakes: [] }, // 확신 없음 → 제외
  };
  const s = convictionStats(positions, tags);
  assert.deepEqual(s.map((x) => x.level), [3, 5]);
  const five = s.find((x) => x.level === 5)!;
  assert.equal(five.count, 2); assert.equal(five.wins, 1); assert.equal(five.winRate, 50);
  assert.equal(five.netSum, 6); assert.equal(five.avg, 3);
  const three = s.find((x) => x.level === 3)!;
  assert.equal(three.count, 1); assert.equal(three.winRate, 100);
});

ok('확신 — 범위 밖(0·6)·누락은 제외', () => {
  const positions = [pos('a', 1), pos('b', 2), pos('c', 3)];
  const s = convictionStats(positions, { a: { setups: [], mistakes: [], conviction: 0 }, b: { setups: [], mistakes: [], conviction: 6 } });
  assert.equal(s.length, 0);
});

ok('hasAnyTag — 확신만 있어도 true', () => {
  assert.equal(hasAnyTag({ setups: [], mistakes: [], conviction: 4 }), true);
  assert.equal(hasAnyTag({ setups: [], mistakes: [] }), false);
});

console.log(`\n${passed} passed`);
