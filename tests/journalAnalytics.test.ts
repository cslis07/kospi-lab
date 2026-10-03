/**
 * 매매일지 분석(lib/journalAnalytics) 회귀 테스트 — 에쿼티·MDD·스트릭·일별 손익.
 * 실행: npm test
 *
 * 성적·낙폭이 틀리면 "내 실제 성적"이 거짓이 되므로 누적·최대낙폭·연속·KST 날짜 버킷팅을 고정한다.
 */
import assert from 'node:assert/strict';
import {
  kstDateKey, equityCurve, streaks, resultOf, aggregateDaily, monthList, monthDays, monthSummary, edgeSummary, afterLossStreaks,
} from '../lib/journalAnalytics';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

// 2026-01-31 16:00 UTC = 2026-02-01 01:00 KST → KST로는 2월 1일
const JAN31_UTC_16 = Date.UTC(2026, 0, 31, 16, 0);
const d = (y: number, mo: number, day: number, h = 3) => Date.UTC(y, mo - 1, day, h); // KST 오전

ok('kstDateKey는 UTC가 아니라 KST 날짜로 버킷팅(월말 밤 → 다음달 1일)', () => {
  assert.equal(kstDateKey(JAN31_UTC_16), '2026-02-01');
  assert.equal(kstDateKey(d(2026, 1, 15)), '2026-01-15');
});

ok('equityCurve 누적·시간순 정렬', () => {
  const r = equityCurve([
    { ts: d(2026, 1, 3), value: 6 },
    { ts: d(2026, 1, 1), value: 10 }, // 순서 섞어도 ts로 정렬
    { ts: d(2026, 1, 2), value: -4 },
  ]);
  assert.equal(r.points.length, 3);
  assert.deepEqual(r.points.map((p) => p.cum), [10, 6, 12]);
  assert.equal(r.finalCum, 12);
  assert.equal(r.peakCum, 12);
});

ok('최대낙폭(MDD) = 누적 최고에서 최저까지의 하락폭', () => {
  // cum: +10 → 4 → 1 → 7 ; peak 10, 최저 1 → MDD 9, % = 9/10*100
  const r = equityCurve([
    { ts: d(2026, 1, 1), value: 10 },
    { ts: d(2026, 1, 2), value: -6 },
    { ts: d(2026, 1, 3), value: -3 },
    { ts: d(2026, 1, 4), value: 6 },
  ]);
  assert.equal(r.maxDrawdown, 9);
  assert.equal(Math.round(r.maxDrawdownPct!), 90);
});

ok('처음부터 손실이면 기준 0 대비 낙폭, 최고가 0이면 % 는 null', () => {
  const r = equityCurve([
    { ts: d(2026, 1, 1), value: -5 },
    { ts: d(2026, 1, 2), value: -2 },
  ]);
  assert.equal(r.peakCum, 0);
  assert.equal(r.maxDrawdown, 7); // 0 → -7
  assert.equal(r.maxDrawdownPct, null);
});

ok('빈 입력은 0·빈 배열', () => {
  const r = equityCurve([]);
  assert.equal(r.tradeCount, 0);
  assert.equal(r.finalCum, 0);
  assert.equal(r.maxDrawdown, 0);
  assert.equal(r.maxDrawdownPct, null);
});

ok('streaks — 최대 연승·연패·현재(본전은 끊음)', () => {
  // W W L L L W  → 최대 연승2, 최대 연패3, 현재 +1
  const s = streaks(['win', 'win', 'loss', 'loss', 'loss', 'win']);
  assert.equal(s.maxWin, 2);
  assert.equal(s.maxLoss, 3);
  assert.equal(s.current, 1);
});

ok('streaks — 현재 연패는 음수, even이 직전이면 0', () => {
  assert.equal(streaks(['win', 'loss', 'loss']).current, -2);
  assert.equal(streaks(['win', 'win', 'even']).current, 0);
  assert.equal(streaks(['win', 'win', 'even']).maxWin, 2);
});

ok('resultOf — 부호로 승/패/본전', () => {
  assert.equal(resultOf(3), 'win');
  assert.equal(resultOf(-3), 'loss');
  assert.equal(resultOf(0), 'even');
});

ok('aggregateDaily — 같은 KST 날짜 합산·건수', () => {
  const m = aggregateDaily([
    { ts: d(2026, 1, 10, 3), value: 5 },
    { ts: d(2026, 1, 10, 7), value: -2 },
    { ts: JAN31_UTC_16, value: 4 }, // 2월 1일로 넘어감
  ]);
  assert.equal(m.get('2026-01-10')!.pnl, 3);
  assert.equal(m.get('2026-01-10')!.count, 2);
  assert.equal(m.get('2026-02-01')!.pnl, 4);
});

ok('monthList — 거래가 있는 달만, 최신 먼저', () => {
  const list = monthList([{ ts: d(2026, 1, 5) }, { ts: d(2026, 3, 9) }, { ts: d(2026, 1, 20) }]);
  assert.deepEqual(list, ['2026-03', '2026-01']);
});

ok('monthDays — 1일~말일, 요일(KST 무관), 거래 없는 날 null', () => {
  const m = aggregateDaily([{ ts: d(2026, 2, 14, 3), value: 7 }]);
  const cells = monthDays('2026-02', m);
  assert.equal(cells.length, 28);          // 2026년 2월 = 28일
  assert.equal(cells[0].day, 1);
  assert.equal(cells[0].dow, 0);           // 2026-02-01 = 일요일
  assert.equal(cells[13].date, '2026-02-14');
  assert.equal(cells[13].pnl, 7);
  assert.equal(cells[0].pnl, null);
});

ok('monthSummary — 거래일·플러스/마이너스 일수·합계', () => {
  const m = aggregateDaily([
    { ts: d(2026, 2, 3), value: 5 },
    { ts: d(2026, 2, 4), value: -2 },
    { ts: d(2026, 2, 4), value: -1 },
  ]);
  const s = monthSummary(monthDays('2026-02', m));
  assert.equal(s.tradedDays, 2);
  assert.equal(s.upDays, 1);
  assert.equal(s.downDays, 1);
  assert.equal(s.sum, 2);
});

ok('edgeSummary — 손익비·Profit Factor·기대값·손익분기 승률', () => {
  // 익절 +30, +10 / 손절 −10, −10 / 본전 0
  const e = edgeSummary([30, 10, -10, -10, 0]);
  assert.equal(e.n, 5); assert.equal(e.wins, 2); assert.equal(e.losses, 2);
  assert.equal(e.winRate, 50);              // 본전은 승률 분모에서 제외
  assert.equal(e.avgWin, 20); assert.equal(e.avgLoss, 10);
  assert.equal(e.payoff, 2);                // 20 ÷ 10
  assert.equal(e.profitFactor, 2);          // 40 ÷ 20
  assert.equal(e.expectancy, 4);            // 합계 20 ÷ 5건 (본전 포함)
  assert.ok(Math.abs(e.breakevenWinRate! - 33.333) < 0.01); // 10 ÷ (20 + 10)
});

ok('edgeSummary — 손실이 없으면 PF·손익비는 정의 불가(null), 빈 입력은 0건', () => {
  const e = edgeSummary([5, 3]);
  assert.equal(e.profitFactor, null); assert.equal(e.payoff, null); assert.equal(e.winRate, 100);
  const z = edgeSummary([]);
  assert.equal(z.n, 0); assert.equal(z.expectancy, null); assert.equal(z.winRate, null);
});

ok('edgeSummary — PF<1이면 잃은 돈이 더 많다(손익비가 좋아도 승률이 낮으면)', () => {
  const e = edgeSummary([30, -10, -10, -10, -10]); // 손익비 3, 승률 20%, 손익분기 25%
  assert.equal(e.payoff, 3);
  assert.ok(e.profitFactor! < 1);
  assert.ok(e.winRate! < e.breakevenWinRate!);
});

ok('afterLossStreaks — 진입 시점까지 청산된 결과로 연패 수, 첫 매매는 제외', () => {
  // 시간순(진입·청산 겹치지 않음): A +5, B −2, C −3, D +4(2연패 뒤), E −1(직전 이익 뒤)
  const t = (i: number, v: number, notional = 100) => ({ openTs: i * 10, closeTs: i * 10 + 5, value: v, notional });
  const rows = afterLossStreaks([t(0, 5), t(1, -2), t(2, -3, 300), t(3, 4, 300), t(4, -1)]);
  const by = Object.fromEntries(rows.map((r) => [r.prior, r]));
  assert.equal(by[0].count, 2);          // B(직전 A 이익), E(직전 D 이익)
  assert.equal(by[1].count, 1);          // C(직전 B 손실 1)
  assert.equal(by[2].count, 1);          // D(B·C 2연패)
  assert.equal(by[2].wins, 1); assert.equal(by[2].avg, 4);
  assert.equal(by[0].winRate, 0);        // B −2, E −1
  assert.equal(by[2].avgNotional, 300);  // 2연패 뒤 진입 규모
  assert.ok(!rows.some((r) => r.count === 0)); // 빈 줄은 안 만든다
});

ok('afterLossStreaks — 아직 청산 안 된(겹친) 매매 결과는 연패에 넣지 않는다', () => {
  // B 가 열려 있는 동안 C 진입 → C 진입 땐 B 결과를 몰랐다 → C 는 A(이익) 뒤
  const rows = afterLossStreaks([
    { openTs: 0, closeTs: 5, value: 5 },     // A
    { openTs: 10, closeTs: 40, value: -9 },  // B (늦게 청산)
    { openTs: 20, closeTs: 25, value: 1 },   // C — B 보유 중 진입
  ]);
  const by = Object.fromEntries(rows.map((r) => [r.prior, r]));
  assert.equal(by[0].count, 2);   // B(A 뒤), C(A 뒤 — B 는 아직 모름)
  assert.equal(by[1], undefined);
});

ok('afterLossStreaks — cap 이상 연패는 한 줄로', () => {
  const t = (i: number, v: number) => ({ openTs: i * 10, closeTs: i * 10 + 5, value: v });
  const rows = afterLossStreaks([t(0, 1), t(1, -1), t(2, -1), t(3, -1), t(4, -1), t(5, 2)], 3);
  const last = rows.find((r) => r.prior === 3)!;
  assert.equal(last.label, '3연패 이상 뒤');
  assert.equal(last.count, 2);    // 3연패 뒤(−1), 4연패 뒤(+2)
});

console.log(`\n${passed} passed`);
