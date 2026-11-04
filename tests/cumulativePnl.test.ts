/**
 * 입출금 대비 누적 손익(lib/cumulativePnl) — 성공 건만·USDT만·출금 수수료·첫 입금·비율·다른 코인 경고.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import { computeCumulative, parseWalletRows } from '../lib/cumulativePnl';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
const near = (a: number | null, b: number) => assert.ok(a != null && Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

ok('Bitget 행 파싱 — 출금 수수료는 양수 비용으로', () => {
  const r = parseWalletRows([{ coin: 'USDT', size: '100.5', fee: '-1.5', status: 'success', cTime: '1700000000000' }]);
  assert.deepEqual(r, [{ coin: 'USDT', size: 100.5, fee: 1.5, status: 'success', ts: 1700000000000 }]);
  assert.deepEqual(parseWalletRows(undefined as never), []);
});

ok('누적 손익 = 잔고 − (입금 − 출금 − 출금 수수료), 성공 건만', () => {
  const dep = parseWalletRows([
    { coin: 'USDT', size: '1000', status: 'success', cTime: '200' },
    { coin: 'USDT', size: '500', status: 'success', cTime: '100' },
    { coin: 'USDT', size: '999', status: 'failed', cTime: '50' },
  ]);
  const wd = parseWalletRows([
    { coin: 'USDT', size: '300', fee: '-1.5', status: 'success', cTime: '300' },
    { coin: 'USDT', size: '700', fee: '-1.5', status: 'pending', cTime: '400' },
  ]);
  const c = computeCumulative(dep, wd, 800);
  near(c.deposits, 1500); near(c.withdrawals, 300); near(c.withdrawFees, 1.5);
  near(c.netIn, 1198.5); near(c.pnl, 800 - 1198.5); near(c.pnlPct, ((800 - 1198.5) / 1198.5) * 100);
  assert.equal(c.firstDepositTs, 100); assert.equal(c.depositN, 2); assert.equal(c.withdrawN, 1);
  assert.deepEqual(c.unvalued, []);
});

ok('USDT 외 코인은 금액에 넣지 않고 이름만 경고', () => {
  const c = computeCumulative(parseWalletRows([{ coin: 'BTC', size: '0.1', status: 'success', cTime: '1' }, { coin: 'USDT', size: '10', status: 'success', cTime: '2' }]), [], 10);
  near(c.deposits, 10); assert.deepEqual(c.unvalued, ['BTC']); near(c.pnl, 0);
});

ok('입금이 없으면 비율·첫 입금 없음', () => {
  const c = computeCumulative([], [], 5);
  assert.equal(c.firstDepositTs, null); assert.equal(c.pnlPct, null); near(c.pnl, 5);
});

console.log(`cumulativePnl: ${passed} passed`);
