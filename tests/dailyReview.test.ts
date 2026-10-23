import assert from 'node:assert/strict';
import { reviewTrade, summarizeDay, postExit, entryLocation, buildDailyReviewMessage, pnlPctOf, coachPrompt, COACH_BANNED, type TradeContext } from '../lib/dailyReview';
import type { ClosedPosition } from '../lib/bitgetPositions';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
console.log('dailyReview.ts');

const T = Date.parse('2026-10-23T00:00:00Z'), M = 60_000;
const pos = (p: Partial<ClosedPosition>): ClosedPosition => ({
  positionId: 'x', symbol: 'ETHUSDT', side: 'long', openAvg: 100, closeAvg: 102, size: 1, netProfit: 1.8, grossPnl: 2, fee: 0.2, funding: 0,
  openTs: T, closeTs: T + 120 * M, ...p,
});
const ctx = (c: Partial<TradeContext>): TradeContext => ({ h1Trend: null, rsi15: null, location: null, autopsy: null, ex: null, post: null, ...c });
const keys = (ns: { key: string }[]) => ns.map((n) => n.key);

ok('진입: 추세 방향·눌림은 잘함, 역행·추격·과열·SL 없음은 못함', () => {
  const good = reviewTrade(pos({ stop: 98 }), ctx({ h1Trend: 'up', location: 0.1 }), null);
  assert.deepEqual(keys(good.entry), ['trend-with', 'dip']);
  const bad = reviewTrade(pos({ side: 'short', openAvg: 100, closeAvg: 101 }), ctx({ h1Trend: 'up', rsi15: 25, location: 0.05 }), null);
  assert.deepEqual(keys(bad.entry), ['trend-against', 'rsi-chase', 'chase', 'no-stop']);
});
ok('손절 폭 ATR·MAE 판정은 손절가 있을 때만', () => {
  const r = reviewTrade(pos({ stop: 98 }), ctx({ autopsy: { risk: 2, atr: 4, stopInAtr: 0.5, entryLocationPct: null, maeR: 1.2, mfeR: 2, lookbackN: 24, forwardN: 5, findings: [] } }), null);
  assert.deepEqual(keys(r.entry), ['stop-tight', 'mae-high']);
});
ok('청산: 포착률 높음/낮음, 이익 반납, 손절가 정리, 손절 없이 버팀', () => {
  const ex = (capturePct: number | null, mfePct: number, mfeR: number | null = null) => ({ maePct: 0.2, mfePct, maeUsdt: 0, mfeUsdt: 0, maeR: null, mfeR, exitPct: 1, capturePct, bars: 10, rough: false });
  assert.deepEqual(keys(reviewTrade(pos({}), ctx({ ex: ex(70, 3) }), null).exit), ['capture-high']);
  assert.deepEqual(keys(reviewTrade(pos({}), ctx({ ex: ex(20, 8) }), null).exit), ['capture-low']);
  const loser = pos({ closeAvg: 98.05, netProfit: -2, grossPnl: -1.95, stop: 98 });
  assert.deepEqual(keys(reviewTrade(loser, ctx({ ex: ex(-50, 2, 1.2) }), null).exit), ['gave-back', 'stop-kept']);
  assert.deepEqual(keys(reviewTrade(pos({ closeAvg: 97, netProfit: -3 }), ctx({}), null).exit), ['held-loser']);
});
ok('청산 뒤 4시간: 이익이면 조기 청산/타이밍 좋음, 손실이면 타이트/손실 제한', () => {
  assert.deepEqual(keys(reviewTrade(pos({}), ctx({ post: { favorPct: 3, againstPct: 0.1 } }), null).exit), ['early-exit']);
  assert.deepEqual(keys(reviewTrade(pos({}), ctx({ post: { favorPct: 0.1, againstPct: 1 } }), null).exit), ['good-exit']);
  const l = pos({ closeAvg: 99, netProfit: -1 });
  assert.deepEqual(keys(reviewTrade(l, ctx({ post: { favorPct: 2, againstPct: 0.1 } }), null).exit), ['stopped-then-ran']);
  assert.deepEqual(keys(reviewTrade(l, ctx({ post: { favorPct: 0.1, againstPct: 1 } }), null).exit), ['loss-capped']);
});
ok('매매: 비용 과다·복구 매매·초단타 손실', () => {
  const prev = pos({ netProfit: -5, closeTs: T - 10 * M });
  const r = reviewTrade(pos({ grossPnl: 1, fee: 0.5, netProfit: -0.1, closeAvg: 100.01, closeTs: T + 2 * M }), ctx({}), prev);
  assert.deepEqual(keys(r.trade), ['cost', 'revenge', 'scalp-loss']);
  assert.equal(reviewTrade(pos({}), ctx({}), pos({ netProfit: 5, closeTs: T - M })).trade.length, 0);
});
ok('하루 요약: 과매매는 하루 평균으로, 최다 실수', () => {
  const rs = Array.from({ length: 7 }, () => reviewTrade(pos({ netProfit: -1 }), ctx({ h1Trend: 'down' }), null));
  const s = summarizeDay(rs, 24);
  assert.equal(s.overtrade, true); assert.equal(s.topBad?.label, '추세 역행 진입');
  assert.equal(summarizeDay(rs, 168).overtrade, false);
});
ok('보조: 진입 위치·청산 뒤 흐름·방향별 손익%', () => {
  assert.equal(entryLocation([{ h: 110, l: 100 }, { h: 108, l: 101 }, { h: 109, l: 102 }, { h: 107, l: 103 }], 105), 0.5);
  assert.deepEqual(postExit('short', 100, [{ h: 101, l: 97 }]), { favorPct: 3, againstPct: 1 });
  assert.equal(pnlPctOf({ side: 'short', openAvg: 100, closeAvg: 98 }), 2);
});
ok('메시지: HTML 이스케이프·건수·4096자 안', () => {
  const rs = Array.from({ length: 20 }, (_, i) => reviewTrade(pos({ symbol: 'A<B>USDT', openTs: T + i * 200 * M, closeTs: T + (i * 200 + 30) * M }), ctx({ h1Trend: 'up', location: 0.1 }), null));
  const m = buildDailyReviewMessage(rs, { base: 'https://x', hours: 24 });
  assert.match(m, /청산 20건/); assert.match(m, /A&lt;B&gt;/); assert.match(m, /앞선 12건/);
  assert.ok(m.length < 4096, `len ${m.length}`);
});
ok('AI 코치: 프롬프트는 집계만, 방향 예측 문장은 버림', () => {
  const rs = [reviewTrade(pos({ netProfit: -1 }), ctx({ h1Trend: 'down' }), null)];
  const p = coachPrompt(rs, 24);
  assert.match(p, /고칠 점 추세 역행 진입 1회/); assert.match(p, /예측이나 매수\/매도 권유는 절대/);
  assert.ok(COACH_BANNED.test('내일은 BTC가 오를 테니 롱 잡으세요'));
  assert.ok(!COACH_BANNED.test('진입 직후 손절 주문부터 거세요'));
  assert.match(buildDailyReviewMessage(rs, { base: 'x', hours: 24, coach: '손절 <먼저>' }), /🧭 <b>코치<\/b> 손절 &lt;먼저&gt;/);
});
console.log(`\n${passed} passed`);
