import assert from 'node:assert/strict';
import { buildTrendIndex, trendAt, tradeFlags, disciplineByDay, disciplineSummary, scoreFromParts, type DTrade, type Closes1h } from '../lib/discipline';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

console.log('discipline.ts');
const H = 3_600_000, M = 60_000;
const T0 = Date.parse('2026-10-01T00:00:00Z');
// 100봉 꾸준히 상승 → 이후 100봉 꾸준히 하락
const rows: Closes1h = [];
for (let i = 0; i < 100; i++) rows.push([T0 + i * H, 100 + i]);
for (let i = 0; i < 100; i++) rows.push([T0 + (100 + i) * H, 199 - i * 2]);
const idx = buildTrendIndex(rows);

ok('추세 판정은 진입 직전 마감 봉까지만 사용', () => {
  assert.equal(trendAt(idx, T0 + 10 * H), null);           // 워밍업 전
  assert.equal(trendAt(idx, T0 + 90 * H + 30 * M), 'up');  // 89번 봉까지 마감
  assert.equal(trendAt(idx, T0 + 190 * H), 'down');
  assert.equal(trendAt(idx, T0 - H), null);                // 데이터 이전
  assert.equal(trendAt(idx, T0 + 400 * H), null);          // 데이터 범위 밖(빈 구간)
  // 진행 중인 100번 봉(첫 하락 봉)은 100:30 진입 시 아직 미마감 → 99번 봉 기준 상승
  assert.equal(trendAt(idx, T0 + 100 * H + 30 * M), 'up');
});

const t = (id: string, o: Partial<DTrade> & { openTs: number }): DTrade => ({
  id, symbol: 'BTCUSDT', side: 'long', closeTs: o.openTs + 60 * M, netProfit: 10, hasStop: true, ...o,
});

ok('복수 재진입(손실 청산 30분 이내)·초단타 손실·추세 순응 플래그', () => {
  const base = T0 + 90 * H;
  const trades = [
    t('a', { openTs: base, closeTs: base + 10 * M, netProfit: -5 }),                     // 손실
    t('b', { openTs: base + 20 * M, closeTs: base + 21 * M, netProfit: -1, hasStop: false }), // 10분 뒤 재진입·1분 손실
    t('c', { openTs: base + 2 * H, side: 'short' }),                                       // 손실 후 1h50m → 복수 아님, 역추세
  ];
  const fl = tradeFlags(trades, { BTCUSDT: idx });
  const by = Object.fromEntries(fl.map((f) => [f.id, f]));
  assert.equal(by.a.revenge, false);
  assert.equal(by.b.revenge, true);
  assert.equal(by.b.lossScalp, true);
  assert.equal(by.a.lossScalp, false);
  assert.equal(by.a.aligned, true);
  assert.equal(by.c.aligned, false);
  assert.equal(by.c.revenge, false);
});

ok('하루 점수 — 가중치 합산과 판정 불가 항목 제외', () => {
  // 전부 지킴 = 100
  assert.equal(scoreFromParts({ stop: 1, trend: 1, revenge: 1, overtrade: 1, scalp: 1 }), 100);
  // 손절 0 (가중 30) → 70
  assert.equal(scoreFromParts({ stop: 0, trend: 1, revenge: 1, overtrade: 1, scalp: 1 }), 70);
  // 추세 판정 불가 → 나머지 75 로 재환산: 손절 0 → 45/75 = 60
  assert.equal(scoreFromParts({ stop: 0, trend: null, revenge: 1, overtrade: 1, scalp: 1 }), 60);
});

ok('과매매 — 하루 6건 초과부터 감점', () => {
  const day = T0 + 90 * H;
  const nine = Array.from({ length: 9 }, (_, i) => t(`x${i}`, { openTs: day + i * 2 * H }));
  const [d] = disciplineByDay(tradeFlags(nine, {})); // 추세 데이터 없음
  assert.equal(d.n, 9);
  assert.equal(d.parts.trend, null);
  assert.equal(d.parts.overtrade, 0.5);
  // (30 + 20 + 15×0.5 + 10) / 75 = 67.5/75 = 90
  assert.equal(d.score, 90);
});

ok('KST 날짜로 묶고 요약은 매매 비율 기준', () => {
  const a = t('a', { openTs: Date.parse('2026-10-05T14:30:00Z'), hasStop: false }); // KST 10-05 23:30
  const b = t('b', { openTs: Date.parse('2026-10-05T15:30:00Z') });                  // KST 10-06 00:30
  const days = disciplineByDay(tradeFlags([a, b], {}));
  assert.deepEqual(days.map((d) => d.day), ['2026-10-05', '2026-10-06']);
  assert.equal(days[0].stops, 0);
  const s = disciplineSummary(tradeFlags([a, b], {}))!;
  assert.equal(s.n, 2);
  assert.equal(s.parts.stop, 0.5);
  assert.equal(disciplineSummary([]), null);
});

console.log(`discipline: ${passed} passed`);
