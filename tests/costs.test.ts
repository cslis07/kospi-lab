/**
 * 매매 비용 분석(lib/tradeCosts) 회귀 테스트 — 실행: npm test
 * 비용 비중이 틀리면 "수수료가 내 이익을 얼마나 먹나"가 거짓이 된다. 부호 규칙(Bitget)과 비율을 고정한다.
 */
import assert from 'node:assert/strict';
import { costBreakdown, costByHoldBand, type CostPosition } from '../lib/tradeCosts';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
const near = (a: number | null, b: number, eps = 1e-6) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≈ ${b}`);
// 순손익 = gross + fee + funding (Bitget 부호)
const pos = (gross: number, fee: number, funding: number, size = 1, open = 100, close = 100): CostPosition =>
  ({ grossPnl: gross, fee, funding, netProfit: gross + fee + funding, size, openAvg: open, closeAvg: close });

ok('합계와 총비용 — 비용 = −(수수료 + 펀딩)', () => {
  const c = costBreakdown([pos(10, -1, -0.5), pos(-4, -1, 0.2)]);
  near(c.gross, 6); near(c.fees, -2); near(c.funding, -0.3); near(c.net, 3.7); near(c.cost, 2.3);
  assert.equal(c.n, 2);
});

ok('번 돈 중 비용 비율 — 이익 매매의 gross 합 대비', () => {
  const c = costBreakdown([pos(10, -1, -0.5), pos(-4, -1, 0.2)]);
  near(c.grossWin, 10);
  near(c.costOfGrossWinPct, 23);   // 2.3 ÷ 10
});

ok('비용 때문에 뒤집힌 매매 — gross>0 인데 순손익 ≤ 0', () => {
  const c = costBreakdown([pos(0.5, -0.6, 0), pos(3, -0.6, 0), pos(-1, -0.6, 0)]);
  assert.equal(c.flipped, 1);
});

ok('실효 수수료율 — 수수료 ÷ (진입+청산 체결 대금)', () => {
  // 수량 2 × (100 + 110) = 420 체결, 수수료 0.252 → 0.06%
  const c = costBreakdown([pos(20, -0.252, 0, 2, 100, 110)]);
  near(c.turnover, 420);
  near(c.feeRatePct, 0.06);
  near(c.avgFee, 0.252);
});

ok('펀딩을 받으면 비용이 줄고, 이익이 없으면 비율은 null', () => {
  const c = costBreakdown([pos(-5, -1, 2)]);
  near(c.cost, -1);              // 수수료 1 냈지만 펀딩 2 받음 → 순비용 −1(이득)
  assert.equal(c.costOfGrossWinPct, null);
  assert.equal(costBreakdown([]).avgFee, null);
});

ok('보유시간별 비용 — 구간 묶음·비용 비율·비용이 이익을 다 먹은 구간', () => {
  const M = 60_000;
  const at = (holdMin: number, gross: number, fee: number): CostPosition => ({ ...pos(gross, fee, 0), openTs: 0, closeTs: holdMin * M });
  const rows = costByHoldBand([
    at(5, 3, -2), at(10, 1, -2),          // 스캘핑: 매매손익 +4, 비용 4 → 순 0 → 다 먹힘, 비용 비율 100%
    at(120, 20, -2),                        // 1~4시간: +20, 비용 2 → 10%
    { ...pos(9, -1, 0) },                   // 시각 없음 → 제외
  ]);
  assert.deepEqual(rows.map((r) => r.key), ['hb0', 'hb2']);
  assert.equal(rows[0].n, 2); near(rows[0].gross, 4); near(rows[0].cost, 4); near(rows[0].net, 0);
  near(rows[0].costOfGrossPct, 100); assert.equal(rows[0].eaten, true); near(rows[0].avgCost, 2);
  near(rows[1].costOfGrossPct, 10); assert.equal(rows[1].eaten, false);
});

ok('보유시간별 비용 — 매매손익이 0 이하인 구간은 비율 null', () => {
  const rows = costByHoldBand([{ ...pos(-5, -1, 0), openTs: 0, closeTs: 60_000 }]);
  assert.equal(rows[0].costOfGrossPct, null);
  assert.equal(rows[0].eaten, false);
});

console.log(`\n${passed} passed`);
