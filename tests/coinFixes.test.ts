/**
 * 코인 영역 점검 수정 회귀(2026-11-06) — 사이징 공식 통일(코인 분석·계산기·위험관리), 실행 판정의 비용 포함 손실·발표 직후 차단.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import { notionalForNetRisk, perUnitStopLoss, STD_MARKET_COSTS, notionForRisk } from '../lib/positionSizing';
import { sizePosition, DEFAULT_RISK_SETTINGS } from '../lib/riskControl';
import { evaluateTradeGate, type TradePlan } from '../lib/tradeGate';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
const near = (a: number, b: number, eps = 0.05) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

ok('사이징 — 같은 입력(시드 1000·1%·BTC 100000/99000 시장가)이면 코인 분석·계산기·위험관리 같은 노션', () => {
  const coin = notionalForNetRisk(10, 100000, 99000, STD_MARKET_COSTS);
  const rc = sizePosition({
    direction: 'long', entry: 100000, stop: 99000, target: null, equity: 1000, leverage: 5,
    entryOrder: 'market', targetOrder: 'market', fundingRate: null, fundingIntervalH: null, riskCapUsdt: null,
  }, { ...DEFAULT_RISK_SETTINGS, riskPerTradePct: 1 });
  near(coin, 820.4, 0.1);
  near(rc.notional!, coin, 1e-6);
  // 손절 시 순손실 = 정확히 허용손실 10 USDT(예전 notionForRisk 는 노션 1000 → 실제 −12.19)
  near((coin / 100000) * perUnitStopLoss(100000, 99000, STD_MARKET_COSTS), 10, 1e-9);
  const old = notionForRisk(1000, 1, 1);
  assert.ok((old / 100000) * perUnitStopLoss(100000, 99000, STD_MARKET_COSTS) > 12);
});

ok('사이징 — 숏도 대칭, 손절=진입·0 입력은 0', () => {
  near(notionalForNetRisk(10, 100000, 101000, STD_MARKET_COSTS) / 100000 * perUnitStopLoss(100000, 101000, STD_MARKET_COSTS), 10, 1e-9);
  assert.equal(notionalForNetRisk(10, 100, 100, STD_MARKET_COSTS), 0);
  assert.equal(notionalForNetRisk(0, 100, 99, STD_MARKET_COSTS), 0);
});

const plan = (o: Partial<TradePlan> = {}): TradePlan => ({
  direction: 'long', entry: 100, stop: 99, target1: 102,
  seed: 1000, riskPct: 1, leverage: 5, notion: 1000, margin: 200,
  liqSafety: 5, eventHoursUntil: null, account: null, ...o,
});

ok('실행 판정 — 비용 포함 손실을 주면 그 값으로 % 계산, 축소 권고도 비례', () => {
  const g = evaluateTradeGate(plan({ netLossAtStop: 12.2 }));
  near(g.lossAtStop, 12.2); near(g.lossPctOfSeed, 1.22);
  const big = evaluateTradeGate(plan({ notion: 3000, netLossAtStop: 36.6 }));
  assert.equal(big.suggest.maxNotion, Math.floor(3000 * 20 / 36.6));
  const gross = evaluateTradeGate(plan({ notion: 3000 }));
  assert.equal(gross.suggest.maxNotion, 2000); // 비용 없으면 예전과 동일(20 ÷ 1%)
});

ok('실행 판정 — 발표 후 2시간까지 이벤트 차단(판정 엔진과 같은 창), 그 뒤·12시간 밖은 통과', () => {
  const ev = (h: number) => evaluateTradeGate(plan({ eventHoursUntil: h, eventTitle: 'CPI' })).checks.find((c) => c.id === 'event')!;
  assert.equal(ev(-1).state, 'fail');
  assert.ok(ev(-1).detail.includes('발표 1.0시간 후'));
  assert.equal(ev(-2).state, 'fail');
  assert.equal(ev(-2.5).state, 'pass');
  assert.equal(ev(3).state, 'fail');
  assert.equal(ev(12).state, 'pass');
});

console.log(`coinFixes: ${passed} passed`);
