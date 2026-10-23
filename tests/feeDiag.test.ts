import assert from 'node:assert/strict';
import { feeDiag, parseFill, timeWindows, STD_MAKER_RATE, type Fill } from '../lib/feeDiag';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

console.log('feeDiag.ts');
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const f = (scope: 'maker' | 'taker', notional: number, rate: number, tradeSide: Fill['tradeSide'] = 'open'): Fill =>
  ({ ts: 1, symbol: 'BTCUSDT', scope, side: 'buy', tradeSide, price: 100, size: notional / 100, notional, fee: notional * rate });

ok('Bitget 원본 행 파싱 — 음수 totalFee 를 비용(양수)으로', () => {
  const p = parseFill({ symbol: 'ETHUSDT', price: '2406.32', baseVolume: '3.25', quoteVolume: '7820.54', side: 'buy', tradeSide: 'close', tradeScope: 'taker', cTime: '1792736311343',
    feeDetail: [{ feeCoin: 'USDT', totalFee: '-3.128216' }] })!;
  assert.equal(p.scope, 'taker');
  assert.equal(p.tradeSide, 'close');
  near(p.notional, 7820.54);
  near(p.fee, 3.128216);
  assert.equal(parseFill({ symbol: 'X', price: '0', baseVolume: '0', cTime: '1' }), null);
  assert.equal(parseFill(null), null);
});

ok('메이커·테이커 분리 + 관측 메이커 요율로 가정 절감액', () => {
  const d = feeDiag([f('taker', 10000, 0.0004), f('taker', 10000, 0.0004, 'close'), f('maker', 5000, 0.0002)]);
  assert.equal(d.n, 3);
  near(d.totalFee, 4 + 4 + 1);
  near(d.taker.notional, 20000);
  near(d.maker.ratePct!, 0.02);
  near(d.taker.ratePct!, 0.04);
  near(d.effRatePct!, (9 / 25000) * 100);
  assert.equal(d.makerRateSource, 'observed');
  near(d.makerRateUsed, 0.0002);
  near(d.hypoAllMakerFee, 1 + 20000 * 0.0002); // 5
  near(d.hypoSaving, 4);
  near(d.taker.feeSharePct!, (8 / 9) * 100);
  near(d.takerShareOpenPct!, 50);
  near(d.takerShareClosePct!, 100);
});

ok('메이커 체결이 없으면 표준 메이커 요율(0.02%)로 가정', () => {
  const d = feeDiag([f('taker', 10000, 0.0006)]);
  assert.equal(d.makerRateSource, 'standard');
  assert.equal(d.makerRateUsed, STD_MAKER_RATE);
  near(d.hypoSaving, 6 - 2);
  assert.equal(d.maker.ratePct, null);
});

ok('빈 입력', () => {
  const d = feeDiag([]);
  assert.equal(d.n, 0);
  assert.equal(d.effRatePct, null);
  assert.equal(d.hypoSavingPct, null);
});

ok('7일 구간 분할 — 최신부터, 경계 빈틈 없음', () => {
  const D = 86_400_000;
  const w = timeWindows(0, 20 * D);
  assert.deepEqual(w, [[13 * D, 20 * D], [6 * D, 13 * D], [0, 6 * D]]);
  assert.deepEqual(timeWindows(0, 7 * D), [[0, 7 * D]]);
  assert.deepEqual(timeWindows(5, 5), []);
});

console.log(`feeDiag: ${passed} passed`);
