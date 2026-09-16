/** 매매 해부·이벤트 대조 회귀 테스트. 실행: npm test */
import assert from 'node:assert/strict';
import { atr, analyzeTrade, type Candle } from '../lib/tradeAutopsy';
import { eventsNear, SEED_EVENTS, type MarketEvent } from '../lib/marketEvents';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const H = 3_600_000;
function candles(startTs: number, bars: [number, number, number, number][]): Candle[] {
  return bars.map(([o, h, l, c], i) => ({ ts: startTs + i * H, o, h, l, c }));
}
// 진입 전 24봉 모두 [100,102,98,100] → TR=4로 균일 → ATR=4. 진입시각 = 마지막 봉(23H).
const BASE: [number, number, number, number][] = Array.from({ length: 24 }, () => [100, 102, 98, 100]);
const ENTRY_TS = 23 * H;

console.log('tradeAutopsy — ATR');
ok('ATR: 균일 TR=4 → ATR=4', () => near(atr(candles(0, BASE))!, 4));
ok('ATR: 캔들 부족(<15)이면 null', () => assert.equal(atr(candles(0, [[1, 2, 0, 1]])), null));

console.log('tradeAutopsy — 해부');
ok('손절 타이트(0.5 ATR) → bad + 넓히기 응대', () => {
  const a = analyzeTrade({ entry: 100, stop: 98, direction: 'long', entryTs: ENTRY_TS, result: 'loss' }, candles(0, BASE));
  near(a.atr!, 4); near(a.stopInAtr!, 0.5);
  assert.ok(a.findings.some((f) => f.key === 'stop-tight' && f.severity === 'bad' && /넓/.test(f.fix ?? '')));
});
ok('손절 적정(1.5 ATR) → good', () => {
  const a = analyzeTrade({ entry: 100, stop: 94, direction: 'long', entryTs: ENTRY_TS, result: 'win' }, candles(0, BASE));
  near(a.stopInAtr!, 1.5); assert.ok(a.findings.some((f) => f.key === 'stop-ok'));
});
ok('고점 추격(long) → warn + 되돌림 응대', () => {
  const a = analyzeTrade({ entry: 102, stop: 100, direction: 'long', entryTs: ENTRY_TS, result: 'loss' }, candles(0, BASE));
  near(a.entryLocationPct!, 1); assert.ok(a.findings.some((f) => f.key === 'chase' && /되돌림|피보/.test(f.fix ?? '')));
});
ok('저점 눌림(long) → good', () => {
  const a = analyzeTrade({ entry: 98, stop: 96, direction: 'long', entryTs: ENTRY_TS, result: 'win' }, candles(0, BASE));
  assert.equal(a.entryLocationPct, 0); assert.ok(a.findings.some((f) => f.key === 'dip'));
});
ok('MAE/MFE: 진입 후 저94·고110, risk2 → MAE 3R·MFE 5R + 되돌려줌', () => {
  const post: [number, number, number, number][] = [[100, 101, 94, 96], [96, 110, 96, 108]];
  const cs = [...candles(0, BASE), ...candles(24 * H, post)];
  const a = analyzeTrade({ entry: 100, stop: 98, direction: 'long', entryTs: 24 * H, exitTs: 25 * H, result: 'loss' }, cs);
  near(a.maeR!, 3); near(a.mfeR!, 5);
  assert.ok(a.findings.some((f) => f.key === 'gave-back' && f.severity === 'bad'));
});
ok('숏은 역행이 위쪽으로 계산', () => {
  const cs = [...candles(0, BASE), ...candles(24 * H, [[100, 106, 100, 104]])];
  const a = analyzeTrade({ entry: 100, stop: 102, direction: 'short', entryTs: 24 * H, exitTs: 24 * H, result: 'loss' }, cs);
  near(a.maeR!, 3);  // (106-100)/2
});
ok('캔들 없으면 MAE/MFE·ATR null, 크래시 없음', () => {
  const a = analyzeTrade({ entry: 100, stop: 98, direction: 'long', entryTs: 0, result: 'open' }, []);
  assert.equal(a.maeR, null); assert.equal(a.atr, null); assert.equal(a.findings.length, 0);
});

console.log('marketEvents — 대조');
ok('SEED에 FOMC·CPI(approx)·CLARITY 존재', () => {
  assert.ok(SEED_EVENTS.some((e) => e.type === 'FOMC'));
  assert.ok(SEED_EVENTS.some((e) => e.type === 'CPI' && e.approx));
  assert.ok(SEED_EVENTS.some((e) => /CLARITY/.test(e.title)));
});
ok('eventsNear: 진입이 이벤트 5h 후면 side=after', () => {
  const r = eventsNear(105 * H, [{ ts: 100 * H, title: 'X', type: 'T', impact: 'high', scope: 'all' }], 12 * H);
  assert.equal(r[0].side, 'after'); near(r[0].deltaMs, 5 * H);
});
ok('eventsNear: 진입이 이벤트 3h 전이면 side=before', () => {
  const r = eventsNear(97 * H, [{ ts: 100 * H, title: 'X', type: 'T', impact: 'high', scope: 'all' }], 12 * H);
  assert.equal(r[0].side, 'before'); assert.ok(r[0].deltaMs < 0);
});
ok('eventsNear: 창 밖 제외 + 가까운 순', () => {
  const evs: MarketEvent[] = [
    { ts: 100 * H, title: 'A', type: 'T', impact: 'high', scope: 'all' },
    { ts: 110 * H, title: 'B', type: 'T', impact: 'high', scope: 'all' },
    { ts: 200 * H, title: 'C', type: 'T', impact: 'high', scope: 'all' },
  ];
  assert.deepEqual(eventsNear(108 * H, evs, 12 * H).map((e) => e.title), ['B', 'A']);
});
ok('eventsNear scope: crypto 요청 시 stocks 전용 제외', () => {
  const evs: MarketEvent[] = [
    { ts: 0, title: 'all', type: 'T', impact: 'high', scope: 'all' },
    { ts: H, title: 'crypto', type: 'T', impact: 'high', scope: 'crypto' },
    { ts: 2 * H, title: 'stocks', type: 'T', impact: 'high', scope: 'stocks' },
  ];
  assert.deepEqual(eventsNear(H, evs, 10 * H, 'crypto').map((e) => e.title).sort(), ['all', 'crypto']);
});

console.log(`\n${passed} passed`);

// ── 손절가 자동복구(SL 주문 매칭) + 거래소 R ──
import { attachStops, exchangeRiskUsdt, reconcileClosedPositions, type SlOrder, type ClosedPositionLike, type JournalLike } from '../lib/bitgetJournal';

const DAY = 24 * H;
const pos = (over: Partial<ClosedPositionLike> = {}): ClosedPositionLike => ({
  positionId: 'p1', symbol: 'BTCUSDT', side: 'long', openAvg: 100, closeAvg: 104, netProfit: 40, size: 10, openTs: 10 * DAY, closeTs: 10 * DAY + 3 * H, ...over,
});
console.log('bitgetJournal — 손절 복구');
ok('attachStops: 롱 진입 아래 SL(시간창 내) → stop 채움', () => {
  const sl: SlOrder[] = [{ symbol: 'BTCUSDT', triggerPrice: 98, ts: 10 * DAY + H }];
  assert.equal(attachStops([pos()], sl)[0].stop, 98);
});
ok('attachStops: TP(진입 위, 롱)는 손절로 안 붙음', () => {
  const sl: SlOrder[] = [{ symbol: 'BTCUSDT', triggerPrice: 110, ts: 10 * DAY + H }];
  assert.equal(attachStops([pos()], sl)[0].stop, undefined);
});
ok('attachStops: 시간창 밖 주문은 무시', () => {
  const sl: SlOrder[] = [{ symbol: 'BTCUSDT', triggerPrice: 98, ts: 5 * DAY }];
  assert.equal(attachStops([pos()], sl)[0].stop, undefined);
});
ok('attachStops: 숏은 진입 위 트리거를 손절로', () => {
  const sl: SlOrder[] = [{ symbol: 'BTCUSDT', triggerPrice: 103, ts: 10 * DAY + H }];
  assert.equal(attachStops([pos({ side: 'short', openAvg: 100 })], sl)[0].stop, 103);
});
ok('exchangeRiskUsdt: |100−98|×10 = 20, 없으면 null', () => {
  near(exchangeRiskUsdt(pos({ stop: 98 }))!, 20);
  assert.equal(exchangeRiskUsdt(pos()), null);   // stop 없음
});
ok('reconcile: 계획없는 매매+복구손절 → 새 기록에 stop·R 채움', () => {
  const r = reconcileClosedPositions([pos({ stop: 98, netProfit: 40 })], []);
  assert.equal(r.additions.length, 1);
  assert.equal(r.additions[0].stop, 98);
  near(r.additions[0].resultR!, 2);   // 40 / (|100-98|×10=20) = +2R
});
ok('reconcile: 복구손절로 손실도 −R로 환산', () => {
  const r = reconcileClosedPositions([pos({ stop: 98, netProfit: -20 })], []);
  near(r.additions[0].resultR!, -1);
});
ok('reconcile: 복구손절 없으면 R은 여전히 null(추측 금지)', () => {
  const r = reconcileClosedPositions([pos({ netProfit: 40 })], []);
  assert.equal(r.additions[0].resultR, null);
  assert.equal(r.additions[0].stop, 0);
});
ok('reconcile: 계획매칭인데 계획리스크 없으면 거래소손절로 R', () => {
  const journal: JournalLike[] = [{ id: 'j1', ts: 10 * DAY, symbol: 'BTCUSDT', direction: 'long', entry: 100, stop: 0, result: 'open' }];
  const r = reconcileClosedPositions([pos({ stop: 98, netProfit: 40 })], journal);
  assert.equal(r.updates.length, 1);
  near(r.updates[0].patch.resultR!, 2);
});
