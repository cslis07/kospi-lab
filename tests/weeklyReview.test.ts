import assert from 'node:assert/strict';
import { weekStats, buildWeeklyMessage, makerEntryRate } from '../lib/weeklyReview';
import { reviewTrade, type TradeContext } from '../lib/dailyReview';
import type { ClosedPosition } from '../lib/bitgetPositions';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
console.log('weeklyReview.ts');
const T = Date.parse('2026-10-20T00:00:00Z'), M = 60_000;
const pos = (p: Partial<ClosedPosition>): ClosedPosition => ({ positionId: 'x', symbol: 'ETHUSDT', side: 'long', openAvg: 100, closeAvg: 101, size: 1, netProfit: 1, grossPnl: 1.2, fee: 0.2, funding: 0, openTs: T, closeTs: T + 60 * M, ...p });
const ctx = (h1Trend: TradeContext['h1Trend']): TradeContext => ({ h1Trend, rsi15: null, location: null, autopsy: null, ex: null, post: null });

ok('주간 지표: 손절 설정률·추세 방향률·실수 집계', () => {
  const rs = [reviewTrade(pos({ stop: 99 }), ctx('up'), null), reviewTrade(pos({ netProfit: -1, closeAvg: 99.9 }), ctx('down'), null), reviewTrade(pos({}), ctx(null), null)];
  const s = weekStats(rs);
  assert.equal(s.slRate, 33); assert.equal(s.withTrendRate, 50); assert.equal(s.mistakes.get('no-stop'), 2); assert.equal(s.perDay, 0.4);
});
ok('메시지: 좋아짐/나빠짐 화살표, 매매 없으면 한 줄', () => {
  const good = weekStats([reviewTrade(pos({ stop: 99 }), ctx('up'), null)]);
  const bad = weekStats([reviewTrade(pos({}), ctx('down'), null), reviewTrade(pos({}), ctx('down'), null)]);
  const m = buildWeeklyMessage(good, bad, { base: 'x' });
  assert.match(m, /손절 주문 설정 100% ← 0% 🟢/); assert.match(m, /추세 방향 진입 100% ← 0% 🟢/);
  assert.match(buildWeeklyMessage(weekStats([]), bad, { base: 'x' }), /이번 주 청산 매매 없음 \(지난주 2건\)/);
});
ok('지정가 진입 비율: 진입(open) 체결만, 조회 실패면 null', () => {
  assert.equal(makerEntryRate([{ scope: 'maker', tradeSide: 'open' }, { scope: 'taker', tradeSide: 'open' }, { scope: 'taker', tradeSide: 'open' }, { scope: 'maker', tradeSide: 'close' }]), 33);
  assert.equal(makerEntryRate(null), null); assert.equal(makerEntryRate([]), null);
  const m = buildWeeklyMessage(weekStats([reviewTrade(pos({}), ctx(null), null)], 7, [{ scope: 'maker', tradeSide: 'open' }]), weekStats([], 7, null), { base: 'x' });
  assert.match(m, /지정가 진입 100% ← –/);
});
console.log(`\n${passed} passed`);
