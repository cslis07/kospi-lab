import assert from 'node:assert/strict';
import { fillLeak, posLeak, rankLeaks, type LeakPosition } from '../lib/costLeak';
import { STD_MAKER_RATE, parseFill, type Fill } from '../lib/feeDiag';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

console.log('costLeak.ts');
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const f = (tradeSide: Fill['tradeSide'], scope: Fill['scope'], notional: number, rate: number, profit = 0, source = 'android'): Fill =>
  ({ ts: 1, symbol: 'BTCUSDT', scope, side: 'buy', tradeSide, price: 100, size: notional / 100, notional, fee: notional * rate, profit, source });
const H = 3_600_000;
const p = (grossPnl: number, fee: number, funding: number, holdMs: number, notional = 10000): LeakPosition =>
  ({ grossPnl, fee, funding, size: notional / 100, openAvg: 100, closeAvg: 100, openTs: 0, closeTs: holdMs });

ok('parseFill — profit·enterPointSource 읽기', () => {
  const x = parseFill({ symbol: 'BTCUSDT', price: '80473.4', baseVolume: '0.0024', quoteVolume: '193.13616', profit: '-0.21', enterPointSource: 'SYS',
    tradeSide: 'close', tradeScope: 'taker', side: 'buy', cTime: '1792967866038', feeDetail: [{ totalFee: '-0.077254464' }] })!;
  near(x.profit!, -0.21);
  assert.equal(x.source, 'sys');
});

ok('체결 수수료를 진입/청산 × 시장가/지정가 × 이익/손실로 나눔', () => {
  const l = fillLeak([
    f('open', 'taker', 10000, 0.0004),
    f('open', 'maker', 10000, 0.0002),
    f('close', 'taker', 10000, 0.0004, 50),
    f('close', 'taker', 10000, 0.0004, -30, 'sys'),
    f('close', 'taker', 10000, 0.0004, -10),
  ]);
  assert.equal(l.openTaker.n, 1); assert.equal(l.openMaker.n, 1);
  assert.equal(l.closeTakerWin.n, 1); assert.equal(l.closeTakerLoss.n, 2);
  assert.equal(l.lossCloseBySl, 1); assert.equal(l.lossCloseManual, 1);
  near(l.totalFee, 4 + 2 + 4 + 4 + 4);
  assert.equal(l.makerRateSource, 'observed');
  near(l.saveOpen, 4 - 2); near(l.saveWinClose, 4 - 2);
});

ok('지정가 체결이 없으면 표준 메이커 요율', () => {
  const l = fillLeak([f('open', 'taker', 10000, 0.0006)]);
  assert.equal(l.makerRateSource, 'standard');
  near(l.saveOpen, 6 - 10000 * STD_MAKER_RATE);
});

ok('포지션 — 수수료·펀딩 몫, 1시간 미만, 8시간 이상 펀딩, 본전 이동', () => {
  const l = posLeak([p(-20, -8, 0, 0.5 * H), p(100, -8, -4, 10 * H), p(30, -4, 1, 2 * H)]);
  near(l.gross, 110); near(l.fee, 20); near(l.fundingPaid, 4); near(l.fundingRecv, 1);
  near(l.cost, 23); near(l.net, 87);
  near(l.feeShareOfCostPct!, (20 / 24) * 100);
  assert.equal(l.short.n, 1); near(l.short.fee, 8); near(l.short.gross, -20); near(l.short.feeShareOfFeePct!, 40);
  near(l.fundingFromLongHoldPct!, 100);
  near(l.breakEvenMovePct!, (20 / 30000) * 100);
});

ok('구멍 순위 — 큰 것부터, 0 이하는 빠짐', () => {
  const fl = fillLeak([f('open', 'taker', 100000, 0.0004), f('open', 'maker', 10000, 0.0002), f('close', 'taker', 10000, 0.0004, 5)]);
  const pl = posLeak([p(-20, -30, 0, 0.5 * H), p(10, -1, -0.5, 9 * H)]);
  const r = rankLeaks(fl, pl);
  assert.deepEqual(r.map((x) => x.key), ['shortHold', 'openTaker', 'winCloseTaker', 'funding']);
  assert.equal(rankLeaks(null, posLeak([p(1, 0, 0, H)])).length, 0);
});

console.log(`  ${passed} passed`);
