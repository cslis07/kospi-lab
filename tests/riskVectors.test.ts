/**
 * KL-001 손절 수량 계산 회귀 테스트 — 2차 실행 패키지의 독립 테스트 사례(tests/fixtures/riskTestVectors.json, R01~R14)를
 * lib/positionSizing.sizeByRisk 에 맞춰 돌린다. 사례 JSON 은 '정답 증명'이 아니라 불변 조건 검증용 참조 데이터다.
 * 매핑: riskPct(비율) × equity = 위험 예산 · 진입 슬리피지 0 · 손절 슬리피지 = stopSlippageRate · fundingPerBaseUnit = 1개당 펀딩.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sizeByRisk, floorToStep, perUnitStopLoss, notionalForNetRisk, type SizeInput } from '../lib/positionSizing';
import { sizePosition, DEFAULT_RISK_SETTINGS } from '../lib/riskControl';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
const near = (a: number, b: number, rel = 1e-9) => assert.ok(Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * rel), `${a} ≈ ${b}`);

interface Vec {
  id: string; title: string; side: 'long' | 'short'; contractType: string;
  equity: string; riskPct: string; entryPrice: string; stopPrice: string;
  entryFeeRate: string; exitFeeRate: string; stopSlippageRate: string; fundingPerBaseUnit: string;
  quantityStep: string; minQuantity: string; leverage: string;
  expected: { status: string; stopFillPrice?: string; perBaseUnitLoss?: string; maxBaseQuantity?: string; estimatedStopLossUSDT?: string; riskBudgetUSDT?: string; marginAtEnteredLeverage?: string };
}
const data = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'riskTestVectors.json'), 'utf8')) as { cases: Vec[] };

const toInput = (v: Vec): SizeInput => ({
  side: v.side, entry: +v.entryPrice, stop: +v.stopPrice,
  riskBudget: +v.equity * +v.riskPct,
  costs: { entryFee: +v.entryFeeRate, exitFee: +v.exitFeeRate, entrySlip: 0, exitSlip: +v.stopSlippageRate },
  fundingPerUnit: +v.fundingPerBaseUnit, leverage: +v.leverage,
  spec: { qtyStep: +v.quantityStep, minQty: +v.minQuantity },
  contractType: v.contractType as SizeInput['contractType'],
});

console.log('riskVectors — 사례 R01~R14');
for (const v of data.cases) {
  ok(`${v.id} ${v.title}`, () => {
    const r = sizeByRisk(toInput(v));
    const e = v.expected;
    const want = e.status === 'REJECT_INPUT' ? 'REJECT_INPUT' : e.status;
    assert.equal(r.status, want, `${v.id} status ${r.status} (${r.reason})`);
    if (e.status !== 'OK') return;
    near(r.stopFill, +e.stopFillPrice!);
    near(r.perUnitLoss, +e.perBaseUnitLoss!);
    assert.equal(r.qty, +e.maxBaseQuantity!, `${v.id} qty ${r.qty} ≠ ${e.maxBaseQuantity}`);
    near(r.estLoss, +e.estimatedStopLossUSDT!);
    near(r.margin, +e.marginAtEnteredLeverage!);
    assert.ok(r.estLoss <= +e.riskBudgetUSDT! + 1e-12, '내림한 수량의 손실은 예산 이하');
  });
}

console.log('riskVectors — 성질(속성) 테스트');
// 고정 시드 난수 — 매번 같은 사례로 재현
let seed = 20261123;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];

function randomCase(): SizeInput {
  const side = rnd() < 0.5 ? 'long' : 'short';
  const entry = +(50 + rnd() * 120000).toFixed(2);
  const dist = 0.002 + rnd() * 0.08;
  const stop = +(side === 'long' ? entry * (1 - dist) : entry * (1 + dist)).toFixed(2);
  const step = pick([0.0001, 0.001, 0.01, 0.1, 1]);
  return {
    side, entry, stop, riskBudget: +(1 + rnd() * 200).toFixed(2),
    costs: { entryFee: pick([0, 0.0002, 0.0006, 0.001]), exitFee: pick([0, 0.0002, 0.0006, 0.001]), entrySlip: pick([0, 0.0005]), exitSlip: pick([0, 0.0005, 0.001, 0.005]) },
    fundingPerUnit: pick([0, entry * 0.0001, entry * 0.001]), leverage: pick([1, 3, 5, 10, 20, 50]),
    spec: { qtyStep: step, minQty: step },
  };
}

ok('500개 무작위 사례 — 내림한 수량의 손실은 항상 예산 이하, 수량은 단위의 배수', () => {
  for (let i = 0; i < 500; i++) {
    const c = randomCase();
    const r = sizeByRisk(c);
    if (r.status !== 'OK') { assert.ok(['BLOCK_MIN_QTY'].includes(r.status), `${r.status} ${r.reason}`); continue; }
    assert.ok(r.estLoss <= c.riskBudget * (1 + 1e-12), `손실 ${r.estLoss} > 예산 ${c.riskBudget}`);
    const k = r.qty / c.spec!.qtyStep;
    assert.ok(Math.abs(k - Math.round(k)) < 1e-6, `수량 ${r.qty} 이 단위 ${c.spec!.qtyStep} 배수 아님`);
    // 한 단계 더 사면 예산을 넘어야 한다(= 최대 수량)
    assert.ok((r.qty + c.spec!.qtyStep) * r.perUnitLoss > c.riskBudget * (1 - 1e-9), '한 단계 더 살 수 있는데 덜 삼');
  }
});

ok('수수료·슬리피지·펀딩이 늘면 허용 수량은 늘지 않는다(T08)', () => {
  for (let i = 0; i < 300; i++) {
    const c = randomCase();
    const base = sizeByRisk(c);
    const worse = [
      { ...c, costs: { ...c.costs, entryFee: c.costs.entryFee + 0.0004 } },
      { ...c, costs: { ...c.costs, exitSlip: (c.costs.exitSlip ?? 0) + 0.002 } },
      { ...c, fundingPerUnit: (c.fundingPerUnit ?? 0) + c.entry * 0.0005 },
    ];
    for (const w of worse) assert.ok(sizeByRisk(w).qty <= base.qty, '비용 증가인데 수량 증가');
  }
});

ok('레버리지를 바꿔도 위험 기준 수량은 같고 증거금만 달라진다(T07)', () => {
  for (let i = 0; i < 200; i++) {
    const c = randomCase();
    const a = sizeByRisk({ ...c, leverage: 10 }), b = sizeByRisk({ ...c, leverage: 20 });
    assert.equal(a.qty, b.qty);
    if (a.qty > 0) near(a.margin, b.margin * 2);
  }
});

ok('손절 방향이 틀리거나 같으면 거부(T05)', () => {
  const base: SizeInput = { side: 'long', entry: 100, stop: 95, riskBudget: 10, costs: { entryFee: 0.0006, exitFee: 0.0006 }, leverage: 5 };
  assert.equal(sizeByRisk({ ...base, stop: 105 }).status, 'REJECT_INPUT');
  assert.equal(sizeByRisk({ ...base, stop: 100 }).status, 'REJECT_INPUT');
  assert.equal(sizeByRisk({ ...base, side: 'short', stop: 95 }).status, 'REJECT_INPUT');
  assert.equal(sizeByRisk({ ...base, stop: NaN }).status, 'REJECT_INPUT');
  assert.equal(sizeByRisk({ ...base, riskBudget: 0 }).status, 'REJECT_INPUT');
  assert.equal(sizeByRisk({ ...base, contractType: 'inverse' }).status, 'UNSUPPORTED');
});

ok('최소 주문 금액 미달은 차단(T06)', () => {
  const r = sizeByRisk({ side: 'long', entry: 90000, stop: 88000, riskBudget: 0.05, costs: { entryFee: 0.0006, exitFee: 0.0006 }, leverage: 10, spec: { qtyStep: 0.0001, minQty: 0.0001, minNotional: 5 } });
  assert.equal(r.status, 'BLOCK_MIN_QTY'); // 0.05/2108 → 0.00002 → 0
  const r2 = sizeByRisk({ side: 'long', entry: 90000, stop: 88000, riskBudget: 0.25, costs: { entryFee: 0.0006, exitFee: 0.0006 }, leverage: 10, spec: { qtyStep: 0.0001, minQty: 0.0001, minNotional: 10 } });
  assert.equal(r2.status, 'BLOCK_MIN_NOTIONAL'); // 0.0001 × 90000 = 9 USDT < 10
});

ok('가용 증거금 상한 — 증거금이 가용액을 넘지 않게 수량을 줄인다', () => {
  const r = sizeByRisk({ side: 'long', entry: 90000, stop: 89900, riskBudget: 10, costs: { entryFee: 0, exitFee: 0 }, leverage: 5, spec: { qtyStep: 0.0001, minQty: 0.0001 }, availableMargin: 50 });
  assert.equal(r.marginCapped, true);
  assert.ok(r.margin <= 50 + 1e-9, `증거금 ${r.margin}`);
});

ok('floorToStep — 부동소수 경계(0.005/0.0001 등)에서 한 칸 덜 내리거나 올리지 않음', () => {
  assert.equal(floorToStep(10 / 2000, 0.0001), 0.005);
  assert.equal(floorToStep(0.0045563, 0.0001), 0.0045);
  assert.equal(floorToStep(0.3, 0.1), 0.3);
  assert.equal(floorToStep(0.7, 0.1), 0.7);
  assert.equal(floorToStep(0.29999, 0.1), 0.2);
  assert.equal(floorToStep(12.999, 1), 12);
  assert.equal(floorToStep(0, 0.01), 0);
});

ok('세 화면 공통 공식 일치 — 코인 분석·계산기(notionalForNetRisk)·위험관리(sizePosition)가 같은 1개당 손실을 쓴다', () => {
  const costs = { entryFee: 0.0006, exitFee: 0.0006, entrySlip: 0.0005, exitSlip: 0.0005 };
  const per = perUnitStopLoss(90000, 88000, costs);
  near(notionalForNetRisk(10, 90000, 88000, costs) / 90000, 10 / per);
  const s = sizePosition(
    { equity: 1000, direction: 'long', entry: 90000, stop: 88000, target: null, leverage: 10, entryOrder: 'market', targetOrder: 'market', fundingRate: null, fundingIntervalH: 8, riskCapUsdt: null },
    { ...DEFAULT_RISK_SETTINGS, riskPerTradePct: 1, takerFeePct: 0.06, makerFeePct: 0.02, slippagePct: 0.05 },
  );
  assert.ok(s.ok);
  near(s.qty, 10 / per);
  const r = sizeByRisk({ side: 'long', entry: 90000, stop: 88000, riskBudget: 10, costs, leverage: 10 });
  near(r.rawQty, 10 / per);
});

ok('숏 손절 수수료는 미끄러진(더 높은) 체결가 기준 — 예전 과소 추정 교정', () => {
  const c = { entryFee: 0.0006, exitFee: 0.0006, exitSlip: 0.001 };
  near(perUnitStopLoss(90000, 92000, c), 2201.2552);   // R02: 92092 체결 기준
  near(perUnitStopLoss(90000, 88000, c), 2194.7472);   // R01: 87912 체결 기준
});

console.log(`riskVectors: ${passed}건 통과`);
