import assert from 'node:assert/strict';
import { roundStep, candidates, clusterLevels, contextFactors, recommendEntry, type RecInput, type RecContext } from '../lib/entryRec';

let passed = 0;
function ok(name: string, fn: () => void) { fn(); passed++; console.log(`ok - ${name}`); }

const ctx0: RecContext = {
  engineDir: 'wait', h4: null, d1: null, newsPos: 0, newsNeg: 0, fundingPct: null, lsRatio: null,
  fearGreed: null, macroBias: null, takerRatio: null, eventHours: null, eventTitle: null,
};
// 11-12 ETH 화면과 비슷한 배치(현재가 2,052.5)
const base = (ctx: Partial<RecContext> = {}): RecInput => ({
  price: 2052.5, atr15: 6, atr1h: 14,
  zones: [
    { price: 2116.7, touches: 3, kind: 'resistance' }, { price: 2108.7, touches: 2, kind: 'resistance' },
    { price: 2087.1, touches: 4, kind: 'resistance' }, { price: 2068.1, touches: 10, kind: 'resistance' },
    { price: 2054.7, touches: 4, kind: 'resistance' },
    { price: 2046.0, touches: 6, kind: 'support' }, { price: 2040.5, touches: 3, kind: 'support' },
  ],
  high24h: 2103, low24h: 2033.9,
  fib: { direction: 'down', r382: 2053.4, r50: 2055.6, r618: 2057.8, e1272: 2041.1, e1618: 2034.6 },
  smc: null,
  ma: [{ label: '1H EMA20', value: 2066, weight: 1.5 }, { label: '15m EMA20', value: 2050, weight: 1 }],
  bb: [{ label: '1H 볼린저', lower: 2031, upper: 2072, weight: 1.5 }],
  walls: { bid: 2040, ask: 2069 },
  ctx: { ...ctx0, ...ctx },
});

ok('라운드 넘버 간격', () => {
  assert.equal(roundStep(2052.5), 100);
  assert.equal(roundStep(91234), 1000);
  assert.equal(Math.round(roundStep(0.52) * 1000) / 1000, 0.01);
});

ok('후보: 롱은 현재가 아래, 숏은 위만, 1H ATR 4배 안', () => {
  const inp = base();
  const lo = candidates(inp, 'long'), hi = candidates(inp, 'short');
  assert.ok(lo.length > 3 && lo.every((l) => l.price < inp.price && l.price >= inp.price - 56));
  assert.ok(hi.length > 3 && hi.every((l) => l.price > inp.price && l.price <= inp.price + 56));
  assert.ok(hi.some((l) => l.label === '피보 61.8%'));        // 하락 스윙 되돌림은 숏 쪽
  assert.ok(!lo.some((l) => l.label.startsWith('피보')));
  assert.ok(lo.some((l) => l.label === '라운드 넘버 2,050'));
});

ok('묶기: 간격 안의 후보는 한 자리, 근거 가중 평균가', () => {
  const c = clusterLevels([{ price: 100, weight: 1, label: 'a' }, { price: 100.4, weight: 3, label: 'b' }, { price: 103, weight: 1, label: 'c' }], 0.5);
  assert.equal(c.length, 2);
  assert.equal(c[0].price, 100.3); assert.equal(c[0].score, 4); assert.deepEqual(c[0].labels, ['b', 'a']);
});

ok('상황 점수: 근거별 부호(롱 기준)', () => {
  const f = contextFactors({ ...ctx0, engineDir: 'short', h4: 'down', newsPos: 1, newsNeg: 3, fundingPct: 0.04, macroBias: 'short' });
  const sum = f.reduce((s, x) => s + x.v, 0);
  assert.equal(sum, -2 - 1 - 1 - 1 - 1);
});

ok('추천: 롱 자리는 아래·손절은 그 아래·목표는 위, 숏은 반대', () => {
  const rec = recommendEntry(base());
  const L = rec.long!, S = rec.short!;
  assert.ok(L.entry < 2052.5 && L.stop < L.zoneLow && L.target1 > L.entry && L.target2 > L.target1);
  assert.ok(S.entry > 2052.5 && S.stop > S.zoneHigh && S.target1 < S.entry && S.target2 < S.target1);
  assert.ok(L.basis.length >= 2 && S.basis.length >= 2);
  assert.equal(L.scenarios.length, 3);
  assert.equal(rec.primary, null);                           // 상황 점수 0 — 양쪽 대기
});

ok('상황이 숏 유리면 주 방향 숏, 롱은 더 깊은 자리만', () => {
  const neutral = recommendEntry(base());
  const bear = recommendEntry(base({ engineDir: 'short', h4: 'down', newsNeg: 3, macroBias: 'short' }));
  assert.ok(bear.ctxScore <= -1.5);
  assert.equal(bear.long!.deep, true);
  assert.ok(bear.long!.distAtr >= 1 || bear.long!.entry <= neutral.long!.entry);
  if (bear.short!.ok) assert.equal(bear.primary, 'short');
});

ok('큰 이벤트 12시간 안이면 안내 + 양쪽 다 깊은 자리', () => {
  const rec = recommendEntry(base({ eventHours: 5, eventTitle: '미국 CPI' }));
  assert.ok(rec.eventWait?.includes('미국 CPI'));
  assert.equal(rec.long!.deep, true); assert.equal(rec.short!.deep, true);
});

ok('가격이 0 이면 계산하지 않는다', () => {
  const rec = recommendEntry({ ...base(), price: 0 });
  assert.equal(rec.long, null); assert.equal(rec.short, null);
});

console.log(`\n${passed} passed`);
