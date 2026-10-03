/**
 * 코인 기초 공부법 그림 데이터(lib/studyData) 회귀 테스트 — 실행: npm test
 * 그림 설명("여기서 골든크로스", "가격은 고점↑·RSI는 고점↓")이 실제 계산과 어긋나면 잘못 가르치게 되므로,
 * 각 그림이 보여 주려는 성질과 피보나치 공식을 고정한다.
 */
import assert from 'node:assert/strict';
import {
  fibRetracement, fibExtension, crossings, pathSeries, rng,
  dsMovingAverage, dsCycle, dsDivergence, dsBollinger, dsVolume, dsFibonacci, dsTrend,
} from '../lib/studyData';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
const near = (a: number, b: number, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

ok('피보나치 되돌림 — 상승 100→160: 61.8% = 122.92, 50% = 130, 0%=고점·100%=저점', () => {
  const lv = Object.fromEntries(fibRetracement(100, 160).map((l) => [l.ratio, l.price]));
  near(lv[0], 160); near(lv[1], 100); near(lv[0.5], 130); near(lv[0.618], 122.92); near(lv[0.382], 137.08); near(lv[0.786], 112.84);
});

ok('피보나치 되돌림 — 하락 구간은 저점에서 위로', () => {
  const lv = Object.fromEntries(fibRetracement(100, 160, 'down').map((l) => [l.ratio, l.price]));
  near(lv[0], 100); near(lv[0.618], 137.08);
});

ok('피보나치 확장(3점) — C + 비율 × (B − A)', () => {
  const ex = Object.fromEntries(fibExtension(100, 160, 122.92).map((l) => [l.ratio, l.price]));
  near(ex[1], 182.92); near(ex[1.272], 199.24); near(ex[1.618], 220);
});

ok('crossings — 위로 뚫으면 golden, 아래로 뚫으면 dead', () => {
  assert.deepEqual(crossings([1, 3, 1], [2, 2, 2]), [{ i: 1, kind: 'golden' }, { i: 2, kind: 'dead' }]);
});

ok('가상 데이터는 고정 시드라 매번 같다', () => {
  assert.deepEqual(pathSeries([[0, 1], [5, 2]], 9), pathSeries([[0, 1], [5, 2]], 9));
  assert.notEqual(rng(1)(), rng(2)());
});

ok('추세 그림 — 118 저항을 돌파한 뒤 되돌림이 118 근처에서 지지', () => {
  const { closes, level } = dsTrend();
  assert.ok(Math.max(...closes.slice(0, 45)) < level + 1);       // 돌파 전엔 막힘
  assert.ok(Math.max(...closes.slice(45, 55)) > level + 5);        // 돌파
  assert.ok(Math.min(...closes.slice(55, 61)) > level - 1.5);      // 되돌림이 지지
});

ok('이동평균 그림 — 데드크로스 후 골든크로스가 화면 구간 안에', () => {
  const { crosses, from, closes } = dsMovingAverage();
  const vis = crosses.filter((c) => c.i > from && c.i < closes.length);
  assert.equal(vis[0]?.kind, 'dead');
  assert.ok(vis.some((c) => c.kind === 'golden' && c.i > vis[0].i));
});

ok('거래량 그림 — 거래량 없는 돌파는 박스로 복귀, 거래량 실린 돌파는 유지', () => {
  const { closes, vol, top, fakeAt, breakAt } = dsVolume();
  assert.ok(closes[fakeAt] > top && closes[fakeAt + 4] < top);
  assert.ok(closes[breakAt] > top && Math.min(...closes.slice(breakAt, breakAt + 6)) > top);
  assert.ok(vol[breakAt] > 2 * vol[fakeAt]);
});

ok('RSI 그림 — 과매수(>70)·과매도(<30) 둘 다 나온다', () => {
  const r = dsCycle().rsi.filter((x): x is number => x != null);
  assert.ok(Math.max(...r) > 70 && Math.min(...r) < 30);
});

ok('MACD 그림 — 데드크로스와 골든크로스가 모두 있다', () => {
  const m = dsCycle().macd;
  const c = crossings(m.map((x) => x.macd), m.map((x) => x.signal)).filter((x) => x.i > 30);
  assert.ok(c.some((x) => x.kind === 'dead') && c.some((x) => x.kind === 'golden'));
});

ok('다이버전스 그림 — 가격 고점은 높아지고 RSI 고점은 낮아진다', () => {
  const { closes, rsi, p1, p2 } = dsDivergence();
  assert.ok(closes[p2] > closes[p1]);
  assert.ok((rsi[p2] ?? 0) < (rsi[p1] ?? 0) - 5);
});

ok('볼린저 그림 — 스퀴즈 구간 폭이 좁아졌다가 이후 크게 넓어진다', () => {
  const { bb, squeeze } = dsBollinger();
  const w = (i: number) => bb[i].upper! - bb[i].lower!;
  assert.ok(w(squeeze[1]) < w(22) / 3);
  assert.ok(w(75) > w(squeeze[1]) * 10);
});

ok('피보나치 그림 — 되돌림이 61.8% 부근에서 멈추고, 재상승이 1.272 확장 부근에 닿는다', () => {
  const { closes, low, high, c, ib, ic } = dsFibonacci();
  const r618 = high - 0.618 * (high - low);
  near(c, r618);
  const pullbackLow = Math.min(...closes.slice(ib + 1, ic + 8));
  assert.ok(Math.abs(pullbackLow - r618) < 1.5);
  const ext1272 = c + 1.272 * (high - low);
  assert.ok(Math.abs(Math.max(...closes.slice(ic)) - ext1272) < 2.5);
});

console.log(`\n${passed} passed`);
