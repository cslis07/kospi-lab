/**
 * 셋업·실수 태그별 성적(lib/tradeTags) 회귀 테스트 — 실행: npm test
 * 한 매매가 여러 태그에 반영되는 집계·승률·순손익이 틀리면 "어떤 셋업이 돈이 되나"가 거짓이 된다.
 */
import assert from 'node:assert/strict';
import { tagStats, hasAnyTag, convictionStats, convictionBySetup, convictionByMistake, convictionCoaching, tagDistribution, SETUPS, MISTAKES } from '../lib/tradeTags';
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

/* ── convictionBySetup (셋업 × 확신 교차) ── */
ok('convictionBySetup: 셋업+확신 둘 다 있는 매매만, 높음/낮음 분리', () => {
  const positions = [pos('a', 10), pos('b', -4), pos('c', 8), pos('d', -2), pos('e', 6)];
  const tags = {
    a: { setups: ['breakout'], mistakes: [], conviction: 5 },
    b: { setups: ['breakout'], mistakes: [], conviction: 2 },
    c: { setups: ['breakout'], mistakes: [], conviction: 4 },
    d: { setups: ['breakout'], mistakes: [], conviction: 1 },
    e: { setups: ['breakout'], mistakes: [], conviction: 5 },
  };
  const [bo] = convictionBySetup(positions, tags);
  assert.equal(bo.key, 'breakout');
  assert.equal(bo.count, 5);
  assert.equal(bo.high.count, 3);   // 확신 5,4,5
  assert.equal(bo.low.count, 2);    // 확신 2,1
  assert.equal(bo.high.netSum, 24); // 10+8+6
  assert.equal(bo.low.netSum, -6);  // -4-2
  assert.ok(Math.abs(bo.avgConviction - 17 / 5) < 1e-9);
});
ok('convictionBySetup: 확신 없거나 셋업 없으면 제외', () => {
  const positions = [pos('a', 10), pos('b', 5), pos('c', -3)];
  const tags = {
    a: { setups: ['trend'], mistakes: [], conviction: 4 }, // 포함
    b: { setups: ['trend'], mistakes: [] },                 // 확신 없음 → 제외
    c: { setups: [], mistakes: ['chase'], conviction: 3 },  // 셋업 없음 → 제외
  };
  const rows = convictionBySetup(positions, tags);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].count, 1);
});
ok('convictionBySetup: calibration 은 양쪽 3건+ 일 때만, 높을 때 더 좋으면 good', () => {
  const positions = Array.from({ length: 6 }, (_, i) => pos(String(i), i < 3 ? 10 : -5));
  const tags: Record<string, { setups: string[]; mistakes: string[]; conviction: number }> = {};
  // 0,1,2 = 확신 5 이익 / 3,4,5 = 확신 2 손실 → 확신 높을수록 좋음 = good
  [0, 1, 2].forEach((i) => (tags[String(i)] = { setups: ['pullback'], mistakes: [], conviction: 5 }));
  [3, 4, 5].forEach((i) => (tags[String(i)] = { setups: ['pullback'], mistakes: [], conviction: 2 }));
  const [r] = convictionBySetup(positions, tags);
  assert.equal(r.calibration, 'good');
});

/* ── convictionByMistake (실수 × 확신) ── */
ok('convictionByMistake: 실수+확신 둘 다 있는 매매만, 평균 확신·건당', () => {
  const positions = [pos('a', -10), pos('b', 4), pos('c', -8)];
  const tags = {
    a: { setups: [], mistakes: ['chase'], conviction: 5 },  // 과신 중 추격
    b: { setups: [], mistakes: ['chase'], conviction: 4 },
    c: { setups: ['breakout'], mistakes: [], conviction: 3 }, // 실수 없음 → 제외
  };
  const [ch] = convictionByMistake(positions, tags);
  assert.equal(ch.key, 'chase');
  assert.equal(ch.count, 2);
  assert.ok(Math.abs(ch.avgConviction - 4.5) < 1e-9); // 확신 5,4 → 평균 4.5(과신 중 저지른 실수)
  assert.equal(ch.high.count, 2); // 둘 다 확신 4+
  assert.equal(ch.netSum, -6);    // -10+4
});

/* ── convictionCoaching (확신 보정 종합 한 줄) ── */
ok('convictionCoaching: 8건 미만이면 insufficient', () => {
  const positions = [pos('a', 5), pos('b', -3)];
  const tags = { a: { setups: [], mistakes: [], conviction: 5 }, b: { setups: [], mistakes: [], conviction: 2 } };
  const c = convictionCoaching(positions, tags);
  assert.equal(c.verdict, 'insufficient');
  assert.equal(c.tagged, 2);
});
ok('convictionCoaching: 확신 높을수록 이기면 calibrated', () => {
  // 확신 5 = 6건 전부 이익, 확신 2 = 6건 전부 손실 → 확신이 결과와 맞음
  const positions = Array.from({ length: 12 }, (_, i) => pos(String(i), i < 6 ? 10 : -5));
  const tags: Record<string, { setups: string[]; mistakes: string[]; conviction: number }> = {};
  for (let i = 0; i < 6; i++) tags[String(i)] = { setups: ['breakout'], mistakes: [], conviction: 5 };
  for (let i = 6; i < 12; i++) tags[String(i)] = { setups: ['breakout'], mistakes: [], conviction: 2 };
  const c = convictionCoaching(positions, tags);
  assert.equal(c.verdict, 'calibrated');
  assert.equal(c.highWinRate, 100);
  assert.equal(c.lowWinRate, 0);
});
ok('convictionCoaching: 확신 높은데 더 못하면 overconfident', () => {
  // 확신 5 = 6건 손실, 확신 2 = 6건 이익 → 과신
  const positions = Array.from({ length: 12 }, (_, i) => pos(String(i), i < 6 ? -8 : 7));
  const tags: Record<string, { setups: string[]; mistakes: string[]; conviction: number }> = {};
  for (let i = 0; i < 6; i++) tags[String(i)] = { setups: ['breakout'], mistakes: ['chase'], conviction: 5 };
  for (let i = 6; i < 12; i++) tags[String(i)] = { setups: ['pullback'], mistakes: [], conviction: 2 };
  const c = convictionCoaching(positions, tags);
  assert.equal(c.verdict, 'overconfident');
  assert.ok(c.text.includes('과신'));
});

/* ── tagDistribution (버킷 태그 분포) ── */
ok('tagDistribution: 셋업·실수 빈도 많은 순', () => {
  const positions = [pos('a', 1), pos('b', 2), pos('c', 3)];
  const tags = {
    a: { setups: ['breakout', 'trend'], mistakes: ['chase'] },
    b: { setups: ['breakout'], mistakes: ['chase'] },
    c: { setups: ['pullback'], mistakes: [] },
  };
  const d = tagDistribution(positions, tags);
  assert.equal(d.setups[0].key, 'breakout'); // 2건으로 최다
  assert.equal(d.setups[0].count, 2);
  assert.equal(d.mistakes[0].key, 'chase');
  assert.equal(d.mistakes[0].count, 2);
});

console.log(`\n${passed} passed`);
