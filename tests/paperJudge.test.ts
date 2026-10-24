import assert from 'node:assert/strict';
import { judgeTrade, checkSkip, summarize, byCondition, binomTailP, verdictText, roundStatus, remindText, meanRTest, meanRText, normCdf, type Candle, type PaperTrade } from '../lib/paperJudge';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
console.log('paperJudge.ts');

const H = 3_600_000, T0 = Date.parse('2026-10-22T02:00:00Z');
const bars = (rows: [number, number, number, number][]): Candle[] =>
  rows.map(([o, h, l, c], i) => ({ ts: T0 + i * H, o, h, l, c }));
const base = (p: Partial<PaperTrade>): PaperTrade => ({
  id: 'x', round: 1, coin: 'BTC', side: 'long', type: 'limit', entry: 100, stop: 95, target: 110,
  openedAt: new Date(T0).toISOString(), conditions: { 진입: '지정가' }, ...p,
});
const END = T0 + 100 * H;

ok('지정가 롱: 저가가 진입가 닿은 봉에서 체결 → 손절', () => {
  const j = judgeTrade(base({}), bars([[103, 104, 101, 102], [102, 102, 99, 100], [100, 101, 94, 95]]), END);
  assert.equal(j.status, 'loss'); assert.equal(j.r, -1); assert.equal(j.filledAt, T0 + H);
});
ok('체결 봉에서는 목표를 안 본다(순서 모름)', () => {
  const j = judgeTrade(base({}), bars([[105, 111, 99, 106], [106, 107, 101, 104]]), END);
  assert.equal(j.status, 'open');
});
ok('같은 봉에 손절·목표 둘 다 → 손절 먼저(보수적)', () => {
  const j = judgeTrade(base({ type: 'market' }), bars([[100, 112, 94, 105]]), END);
  assert.equal(j.status, 'loss');
});
ok('숏 지정가 목표 도달 R', () => {
  const j = judgeTrade(base({ side: 'short', entry: 100, stop: 105, target: 90 }), bars([[98, 100.5, 97, 99], [99, 99, 89, 90]]), END);
  assert.equal(j.status, 'win'); assert.equal(j.r, 2);
});
ok('voidAt 전까지 미체결 → 무효, 기한 남았으면 대기', () => {
  const t = base({ entry: 90, voidAt: new Date(T0 + 2 * H).toISOString() });
  const b = bars([[100, 101, 95, 96], [96, 98, 94, 97], [97, 97, 85, 86]]);
  assert.equal(judgeTrade(t, b, END).status, 'void');
  assert.equal(judgeTrade({ ...t, voidAt: undefined }, b.slice(0, 2), END).status, 'pending');
});
ok('기록 시각 전 봉은 판정에 안 섞인다', () => {
  const j = judgeTrade(base({ openedAt: new Date(T0 + H).toISOString() }), bars([[100, 100, 80, 90], [102, 103, 101, 102]]), END);
  assert.equal(j.status, 'pending');
});
ok('요약·조건별: 무효·대기는 제외, 승률은 확정만', () => {
  const js = [
    { trade: base({ conditions: { 진입: '시장가' } }), status: 'win' as const, r: 1.5 },
    { trade: base({}), status: 'loss' as const, r: -1 },
    { trade: base({}), status: 'open' as const, r: 0.3 },
    { trade: base({}), status: 'void' as const, r: null },
  ];
  const s = summarize(js);
  assert.deepEqual([s.n, s.wins, s.losses, s.open, s.voided], [3, 1, 1, 1, 1]);
  assert.ok(Math.abs(s.sumR - 0.8) < 1e-9); assert.equal(s.winRate, 0.5);
  const lim = byCondition(js).find((r) => r.value === '지정가')!;
  assert.deepEqual([lim.n, lim.wins, lim.losses], [2, 0, 1]);
});
ok('관망 점검: 구간 고저·엔진 방향 손익', () => {
  const c = checkSkip({ round: 1, coin: 'BTC', price: 100, at: new Date(T0).toISOString(), engine: 'short', reason: '' },
    bars([[100, 103, 99, 101], [101, 102, 96, 97]]), END)!;
  assert.equal(c.highPct, 3); assert.equal(c.lowPct, -4); assert.equal(c.engineWouldWin, true);
});
ok('이항검정·판정 문구: n<30은 결론 불가', () => {
  assert.ok(Math.abs(binomTailP(1, 1) - 0.5) < 1e-12);
  assert.ok(binomTailP(22, 30) < 0.05);
  assert.match(verdictText(2, 0.5, 0.5), /결론 불가/);
  assert.match(verdictText(30, 0.73, binomTailP(22, 30)), /유의/);
});
ok('리마인더: 마지막 라운드 12시간 뒤에만, 대기·미결·최근 라운드 상태 포함', () => {
  const t = base({ round: 4, openedAt: new Date(T0).toISOString() });
  const log = { trades: [base({ round: 1, openedAt: new Date(T0 - 48 * H).toISOString() }), t], skips: [] };
  assert.equal(roundStatus(log, T0 + 11 * H).due, false);
  const st = roundStatus(log, T0 + 13 * H); assert.deepEqual([st.last, st.due], [4, true]);
  assert.equal(remindText(log, [], T0 + 11 * H), null);
  const msg = remindText(log, [{ trade: t, status: 'pending', r: null }, { trade: log.trades[0], status: 'win', r: 2 }], T0 + 13 * H)!;
  assert.match(msg, /R5 진행 가능/); assert.match(msg, /R4 BTC 롱 지정가 100 → ⌛ 체결 대기/); assert.ok(!/R1 BTC/.test(msg)); assert.match(msg, /1승 0패/);
});
ok('보조 기준 평균 R: 정규 근사 단측, n<30은 결론 불가', () => {
  assert.ok(Math.abs(normCdf(1.645) - 0.95) < 1e-3); assert.ok(Math.abs(normCdf(0) - 0.5) < 1e-7);
  const rs = Array.from({ length: 30 }, (_, i) => (i % 3 === 0 ? 2 : -1) + 0.8);   // 평균 +0.8, z≈3
  const m = meanRTest(rs); assert.ok(Math.abs(m.mean - 0.8) < 1e-9); assert.ok(m.p < 0.05);
  assert.match(meanRText(m), /0보다 유의/);
  assert.match(meanRText(meanRTest([2, -1, 2])), /결론 불가/);
  assert.match(meanRText(meanRTest(Array.from({ length: 30 }, (_, i) => (i % 2 ? 1 : -1)))), /우연 범위/);
});
console.log(`\n${passed} passed`);
