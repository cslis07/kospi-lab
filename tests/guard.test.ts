import assert from 'node:assert/strict';
import { evaluateGuard, suggestStop, cooldownState, SL_GRACE_MS, type GuardInput, type OpenPos } from '../lib/guard';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
console.log('guard.ts');

const NOW = Date.parse('2026-10-23T06:00:00Z'), M = 60_000, H = 3_600_000;
const p = (o: Partial<OpenPos>): OpenPos => ({ symbol: 'BTCUSDT', side: 'long', openTs: NOW - 60 * M, entry: 100, mark: 100, liq: 50, h1Trend: 'up', ...o });
const inp = (o: Partial<GuardInput>): GuardInput => ({ now: NOW, positions: [], slSymbols: new Set(), journal: [], closed: [], limits: null, equity: 1000, ...o });
const keys = (r: { alerts: { key: string }[] }) => r.alerts.map((a) => a.key.split(':')[0]);

ok('손절 주문 없음: 유예 3분 뒤, 거래소 SL·일지 손절 있으면 안 울림, 조회 실패(null)면 생략', () => {
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [p({})] }), { fired: {} })), ['nosl']);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [p({ openTs: NOW - SL_GRACE_MS + M })] }), { fired: {} })), []);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [p({})], slSymbols: new Set(['BTCUSDT']) }), { fired: {} })), []);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [p({})], journal: [{ symbol: 'BTC/USDT', side: 'long', id: 'j', stop: 95, target1: 0, target2: 0 }] }), { fired: {} })), []);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [p({})], slSymbols: null }), { fired: {} })), []);
});
ok('재발화: 손절 없음 2시간, 추세 역행은 포지션당 1회', () => {
  const pos = p({ h1Trend: 'down' });
  const first = evaluateGuard(inp({ positions: [pos] }), { fired: {} });
  assert.deepEqual(keys(first).sort(), ['nosl', 'trend']);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [pos], now: NOW + H }), first.state)), []);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [pos], now: NOW + 2 * H + M }), first.state)), ['nosl']);
});
ok('복구 매매: 직전이 손실 청산이고 30분 안 재진입일 때만', () => {
  const pos = p({ openTs: NOW - 20 * M });
  const sl = new Set(['BTCUSDT']);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [pos], slSymbols: sl, closed: [{ symbol: 'ETHUSDT', netProfit: -10, closeTs: NOW - 30 * M }] }), { fired: {} })), ['revenge']);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [pos], slSymbols: sl, closed: [{ symbol: 'ETHUSDT', netProfit: -10, closeTs: NOW - 90 * M }] }), { fired: {} })), []);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [pos], slSymbols: sl, closed: [{ symbol: 'ETHUSDT', netProfit: -10, closeTs: NOW - 40 * M }, { symbol: 'ETHUSDT', netProfit: 5, closeTs: NOW - 25 * M }] }), { fired: {} })), []);
});
ok('청산가 근접 15%/8%, 일지 계획 손절 도달', () => {
  const sl = new Set(['BTCUSDT']);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [p({ liq: 88 })], slSymbols: sl }), { fired: {} })), ['liq']);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [p({ liq: 95 })], slSymbols: sl }), { fired: {} })), ['liqCrit']);
  const r = evaluateGuard(inp({ positions: [p({ mark: 94 })], slSymbols: sl, journal: [{ symbol: 'BTCUSDT', side: 'long', id: 'j1', stop: 95, target1: 0, target2: 0 }] }), { fired: {} });
  assert.deepEqual(r.alerts.map((a) => a.key), ['j1:stop']);
});
ok('서킷브레이커: 한도 미설정이면 평가금 3%를 오늘 한도로(문구 명시), 하루 1회', () => {
  const closed = [{ symbol: 'BTCUSDT', netProfit: -40, closeTs: NOW - H }];
  const r = evaluateGuard(inp({ closed, equity: 1000 }), { fired: {} });
  assert.deepEqual(keys(r), ['cb']); assert.match(r.alerts[0].text, /평가금 1000의 3%/);
  assert.deepEqual(keys(evaluateGuard(inp({ closed, equity: 1000, now: NOW + H }), r.state)), []);
  assert.deepEqual(keys(evaluateGuard(inp({ closed: [{ symbol: 'BTCUSDT', netProfit: -10, closeTs: NOW - H }], equity: 1000 }), { fired: {} })), []);
});
ok('손절 제안: 진입가 ∓1.2ATR, 이미 지났으면 현재가 기준, 1% 리스크 수량', () => {
  const s = suggestStop({ side: 'long', entry: 100, mark: 99, size: 2, atr1h: 1 }, 1000)!;
  assert.ok(Math.abs(s.stop - 98.8) < 1e-9); assert.equal(s.fromMark, false);
  assert.ok(Math.abs(s.qtyAtRisk! - 10 / 1.2) < 1e-9); assert.ok(Math.abs(s.curRiskPct! - 0.24) < 1e-9);
  const passedS = suggestStop({ side: 'short', entry: 100, mark: 102, size: 1, atr1h: 1 }, null)!;
  assert.equal(passedS.fromMark, true); assert.equal(passedS.stop, 103.2); assert.equal(passedS.qtyAtRisk, null);
  assert.equal(suggestStop({ side: 'long', entry: 100, mark: 99, atr1h: null }, 1000), null);
  assert.match(evaluateGuard(inp({ positions: [p({ atr1h: 1, size: 2 })] }), { fired: {} }).alerts[0].text, /제안 손절 <b>98\.800<\/b>/);
});
ok('냉각: 손실 청산 30분, 서킷브레이커면 KST 자정까지, 이익 청산이면 없음', () => {
  const c = cooldownState([{ netProfit: -5, closeTs: NOW - 10 * M }], null, 1000, NOW)!;
  assert.equal(c.kind, 'loss'); assert.equal(c.until, NOW + 20 * M);
  assert.equal(cooldownState([{ netProfit: -5, closeTs: NOW - 40 * M }], null, 1000, NOW), null);
  assert.equal(cooldownState([{ netProfit: 5, closeTs: NOW - 5 * M }], null, 1000, NOW), null);
  const b = cooldownState([{ netProfit: -40, closeTs: NOW - H }], null, 1000, NOW)!;
  assert.equal(b.kind, 'breaker'); assert.equal((b.until + 9 * H) % 86_400_000, 0);
});
ok('하락 충격봉: 롱 보유 중에만, 충격봉당 1회, 측정 빈도 문구', () => {
  const sl = new Set(['BTCUSDT']);
  const shock = { ts: NOW - 10 * M, dir: 'down' as const, rangePct: 1.3, volX: 30 };
  const r = evaluateGuard(inp({ positions: [p({ shock })], slSymbols: sl }), { fired: {} });
  assert.deepEqual(keys(r), ['shock']); assert.match(r.alerts[0].text, /추가 하락 \d+% vs 반등 \d+%/);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [p({ shock })], slSymbols: sl, now: NOW + H }), r.state)), []);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [p({ side: 'short', h1Trend: 'down', shock })], slSymbols: sl }), { fired: {} })), []);
});
console.log(`\n${passed} passed`);
