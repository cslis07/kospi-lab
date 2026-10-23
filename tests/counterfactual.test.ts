import assert from 'node:assert/strict';
import { stopCheck, stopNet, makerEntrySaving, revengeIds, counterfactual, cfHeadline, type CfTrade, type StopCheck } from '../lib/counterfactual';
import type { Candle } from '../lib/tradeAutopsy';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

console.log('counterfactual.ts');
const M = 60_000, BAR = 5 * M;
const T0 = Date.parse('2026-10-01T00:00:00Z');
// 진입 전 20봉: 고저 폭 1 → ATR = 1 (종가 일정)
const pre: Candle[] = Array.from({ length: 20 }, (_, i) => ({ ts: T0 + i * BAR, o: 100, h: 100.5, l: 99.5, c: 100 }));
const ENTRY_TS = T0 + 20 * BAR; // 20번 봉 시작 시각에 진입
const held = (lows: number[], highs: number[]): Candle[] => lows.map((l, i) => ({ ts: ENTRY_TS + i * BAR, o: 100, h: highs[i], l, c: 100 }));

const base = (o: Partial<CfTrade> = {}): CfTrade => ({
  id: 'a', symbol: 'BTCUSDT', side: 'long', openAvg: 100, closeAvg: 101, size: 10,
  netProfit: 8, grossPnl: 10, fee: -2, openFee: -1, openTs: ENTRY_TS, closeTs: ENTRY_TS + 3 * BAR, ...o,
});

ok('ATR 은 진입 전 마감 봉만, 손절가 = 진입 ∓ 1.2ATR', () => {
  const s = stopCheck(base(), [...pre, ...held([99.5, 99.4, 99.6, 99.9], [100.5, 101, 101, 101])], BAR);
  assert.equal(s.atr, 1);
  assert.ok(Math.abs(s.stopPrice! - 98.8) < 1e-9);
  assert.equal(s.status, 'not-hit');
  // 진입 이후 봉(보유 구간)이 큰 범위여도 ATR 은 바뀌지 않는다
  const s2 = stopCheck(base(), [...pre, ...held([90, 99, 99, 99], [110, 101, 101, 101])], BAR);
  assert.equal(s2.atr, 1);
  assert.equal(s2.status, 'hit'); // 90 ≤ 98.8
});

ok('같은 봉 모호성 — 손절가가 봉 범위 안이면 맞은 것(보수적), 숏은 고가 기준', () => {
  // 진입 봉 안에서 98.8 터치 후 큰 상승 → 그래도 hit
  assert.equal(stopCheck(base(), [...pre, ...held([98.8, 100, 100, 100], [105, 106, 106, 106])], BAR).status, 'hit');
  const short = base({ side: 'short', closeAvg: 99 });
  assert.equal(stopCheck(short, [...pre, ...held([99, 99, 99, 99], [101.2, 100, 100, 100])], BAR).status, 'hit');
  assert.equal(stopCheck(short, [...pre, ...held([99, 99, 99, 99], [101.1, 100, 100, 100])], BAR).status, 'not-hit');
  // 청산 시각 이후 봉은 보지 않는다
  assert.equal(stopCheck(base(), [...pre, ...held([99.5, 99.5, 99.5, 99.5, 90], [101, 101, 101, 101, 101])], BAR).status, 'not-hit');
});

ok('실제 청산가가 손절가를 넘었으면 hit · 진입 전 봉 부족이면 unknown', () => {
  assert.equal(stopCheck(base({ closeAvg: 98 }), [...pre, ...held([99, 99, 99, 99], [100, 100, 100, 100])], BAR).status, 'hit');
  assert.equal(stopCheck(base(), pre.slice(-5).concat(held([99, 99, 99, 99], [100, 100, 100, 100])), BAR).status, 'unknown');
});

ok('손절 적용 순손익 — −1.2ATR×수량 + 실제 수수료·펀딩, 반등 놓친 이익 매매는 손해로', () => {
  const hit: StopCheck = { status: 'hit', atr: 1, stopPrice: 98.8, stopDist: 1.2 };
  // 실제 +8(가격 +10, 비용 −2) → 손절이면 −12 − 2 = −14
  assert.ok(Math.abs(stopNet(base(), hit) - -14) < 1e-9);
  // 실제 −52(가격 −50) → −14 로 개선
  assert.ok(Math.abs(stopNet(base({ netProfit: -52, grossPnl: -50 }), hit) - -14) < 1e-9);
  assert.equal(stopNet(base(), { status: 'not-hit', atr: 1, stopPrice: 98.8, stopDist: 1.2 }), 8);
  assert.equal(stopNet(base(), undefined), 8);
});

ok('진입 지정가 — 진입 수수료만 0.02%로, 이미 싸면 0', () => {
  // 진입 금액 1000, 실제 진입 수수료 1(0.1%) → 메이커 0.2 → 0.8 절감
  assert.ok(Math.abs(makerEntrySaving(base()) - 0.8) < 1e-9);
  assert.equal(makerEntrySaving(base({ openFee: -0.1 })), 0);
  // openFee 없으면 총수수료를 진입/청산 금액 비율로 나눠 추정: 2 × 1000/2010
  assert.ok(Math.abs(makerEntrySaving(base({ openFee: undefined })) - (2 * 1000 / 2010 - 0.2)) < 1e-9);
});

ok('복수 매매 — 손실 청산 후 30분 이내 진입만(실제 기록 기준)', () => {
  const ts = [
    { id: 'l', openTs: T0, closeTs: T0 + 10 * M, netProfit: -5 },
    { id: 'r', openTs: T0 + 40 * M, closeTs: T0 + 50 * M, netProfit: 3 },   // 30분 뒤 → 복수
    { id: 'n', openTs: T0 + 41 * M + 30 * M, closeTs: T0 + 90 * M, netProfit: 3 }, // 손실 청산 61분 뒤
    { id: 'p', openTs: T0 + 5 * M, closeTs: T0 + 20 * M, netProfit: 1 },    // 손실 청산 전 진입(겹침) → 아님
  ];
  assert.deepEqual([...revengeIds(ts)].sort(), ['r']);
});

ok('규칙별·합산 요약과 가장 큰 규칙', () => {
  const trades: CfTrade[] = [
    base({ id: 'w', netProfit: 8, grossPnl: 10 }),                                                       // 손절 맞음 → −14 (반등 놓침)
    base({ id: 'l', netProfit: -52, grossPnl: -50, openTs: T0, closeTs: T0 + 10 * M }),                   // 손절 맞음 → −14
    base({ id: 'r', netProfit: -20, grossPnl: -18, openTs: T0 + 20 * M, closeTs: T0 + 30 * M }),          // 복수(손실 10분 뒤), 손절 판정 없음
  ];
  const hit: StopCheck = { status: 'hit', atr: 1, stopPrice: 98.8, stopDist: 1.2 };
  const s = counterfactual(trades, { w: hit, l: hit });
  assert.ok(Math.abs(s.actual - -64) < 1e-9);
  assert.ok(Math.abs(s.rules.stop.net - (-14 - 14 - 20)) < 1e-9);
  assert.equal(s.rules.stop.affected, 2);
  assert.equal(s.stopHits, 2);
  assert.equal(s.stopHurt, 1);
  assert.equal(s.stopHelped, 1);
  assert.equal(s.stopKnown, 2);
  assert.ok(Math.abs(s.rules.revenge.net - -44) < 1e-9);
  assert.equal(s.rules.revenge.affected, 1);
  assert.ok(Math.abs(s.rules.maker.delta - 2.4) < 1e-9); // 3건 × 0.8
  // 전부: r 제외, w·l 손절 + 지정가 0.8씩 → −28 + 1.6
  assert.ok(Math.abs(s.rules.all.net - (-28 + 1.6)) < 1e-9);
  assert.equal(s.biggest, 'revenge'); // +20 > +16(손절) > +2.4
  assert.match(cfHeadline(s), /복수 매매 빼기.*가장 크게 개선/);
  assert.equal(counterfactual([], {}).biggest, null);
});

console.log(`counterfactual: ${passed} passed`);
