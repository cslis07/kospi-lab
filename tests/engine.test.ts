/**
 * 돈에 직접 닿는 계산의 회귀 테스트.
 * 실행: npm test  (= npx tsx tests/engine.test.ts)
 *
 * 대상:
 *  - lib/positionSizing: 노션·청산가·안전배수·분할 매수
 *  - lib/coinAnalysis buildVerdict: 방향·손절/목표·레버리지·진입자리 게이트·상위TF 역행 차단·진입 플랜
 *  - lib/stockAnalysis: 수급 결측 시 매수판정 차단(과거 실버그 회귀)
 */
import assert from 'node:assert/strict';
import {
  buildVerdict, tfTrend,
  type TimeframeAnalysis, type SRZone, type Candle,
} from '../lib/coinAnalysis';
import { buildStockVerdict, analyzeSupply, type InvestorDay } from '../lib/stockAnalysis';
import { analyzeTimeframe, srZones, fibonacci, atr } from '../lib/coinAnalysis';
import { notionForRisk, isolatedLiqPrice, liqSafety, tranches3 } from '../lib/positionSizing';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

/* ── 가짜 타임프레임 생성기 ─────────────────────────── */
function mkTF(over: Partial<TimeframeAnalysis> = {}): TimeframeAnalysis {
  return {
    tf: '15m', close: 100,
    ema20: 99, ema60: 98, ema200: 95, vwap: 99,
    rsi: 50, macd: { line: 0, signal: 0, hist: 0, histSlope: 0 },
    bb: { upper: 102, mid: 100, lower: 98, bandwidth: 0.04, squeeze: false },
    atr: 0.5, atrPct: 0.5, volumeRatio: 1,
    structure: '횡보', emaAlign: '혼조', priceVsEma20: 'above', priceVsVwap: 'above',
    lastCandle: { longLowerWick: false, longUpperWick: false, strongBull: false, strongBear: false, microBreakUp: false, microBreakDown: false },
    ...over,
  };
}
const bullTF = (p = 100): TimeframeAnalysis => mkTF({
  close: p, ema20: p * 0.99, ema60: p * 0.97, ema200: p * 0.9, vwap: p * 0.99,
  emaAlign: '정배열', priceVsEma20: 'above', priceVsVwap: 'above', structure: '상승',
  rsi: 48, macd: { line: 1, signal: 0.5, hist: 0.5, histSlope: 0.1 },
  atr: p * 0.005, atrPct: 0.5, volumeRatio: 2,
});
const bearTF = (p = 100): TimeframeAnalysis => mkTF({
  close: p, ema20: p * 1.01, ema60: p * 1.03, ema200: p * 1.1, vwap: p * 1.01,
  emaAlign: '역배열', priceVsEma20: 'below', priceVsVwap: 'below', structure: '하락',
  rsi: 55, macd: { line: -1, signal: -0.5, hist: -0.5, histSlope: -0.1 },
  atr: p * 0.005, atrPct: 0.5, volumeRatio: 2,
});

const P = 100;
const longM5 = (): TimeframeAnalysis => ({ ...bullTF(P), tf: '5m',
  lastCandle: { longLowerWick: true, longUpperWick: false, strongBull: true, strongBear: false, microBreakUp: true, microBreakDown: false } });
const supportZone: SRZone = { price: P * 0.99, touches: 3, kind: 'support' };
const farRes: SRZone = { price: P * 1.05, touches: 2, kind: 'resistance' };

console.log('\n[ positionSizing — 사이징·청산가 ]');
ok('노션 = 시드×리스크%÷손절% (1000·1%·0.5% → 2000)', () => {
  assert.equal(notionForRisk(1000, 1, 0.5), 2000);
});
ok('손절폭 0이면 노션 0 (0으로 나누기 방어)', () => {
  assert.equal(notionForRisk(1000, 1, 0), 0);
});
ok('격리 청산가: 롱 10배 entry100 → 90.5 / 숏 → 109.5 (MMR 0.5%)', () => {
  assert.ok(Math.abs(isolatedLiqPrice(100, 10, false) - 90.5) < 1e-9);
  assert.ok(Math.abs(isolatedLiqPrice(100, 10, true) - 109.5) < 1e-9);
});
ok('청산여유÷손절거리: 롱 10배·손절 1% → 9.5배', () => {
  assert.ok(Math.abs(liqSafety(100, 1, 10, false) - 9.5) < 1e-9);
});
ok('분할 3분할: 가중 합=1, 노션·증거금 보존, 평단이 존 안', () => {
  const t = tranches3(3000, 10, 100, 99, true, { type: 'pullback', zoneLow: 98, zoneHigh: 100 });
  assert.equal(t.rows.length, 3);
  assert.ok(Math.abs(t.rows.reduce((a, r) => a + r.weight, 0) - 1) < 1e-9);
  assert.ok(Math.abs(t.rows.reduce((a, r) => a + r.notion, 0) - 3000) < 1e-6);
  assert.ok(Math.abs(t.rows.reduce((a, r) => a + r.margin, 0) - 300) < 1e-6);
  assert.ok(t.avg > 98 && t.avg < 100);
  // 롱 눌림: 위(100)→아래(98) 순서로 담기
  assert.ok(t.rows[0].price > t.rows[2].price);
});
ok('분할(시장가): 계단이 손절 방향, 마지막도 손절 안쪽', () => {
  const t = tranches3(2000, 5, 100, 99, true, { type: 'now', zoneLow: 100, zoneHigh: 100 });
  assert.equal(t.rows[0].price, 100);
  assert.ok(t.rows[2].price > 99 && t.rows[2].price < 100); // 손절(99) 위
});

console.log('\n[ coinAnalysis buildVerdict — 방향·손절·레버리지 ]');
ok('강한 롱 정렬: long + entryOk + 손절=구조지지·목표=1R/1.5R', () => {
  const v = buildVerdict(bullTF(P), bullTF(P), longM5(), 0, null, null, [supportZone, farRes], null, {});
  assert.equal(v.direction, 'long');
  assert.equal(v.entryOk, true);
  assert.ok(Math.abs(v.stop - P * 0.99) < 1e-9, `stop=${v.stop}`);
  const risk = P - v.stop;
  assert.ok(Math.abs(v.target1 - (P + risk)) < 1e-9);
  assert.ok(Math.abs(v.target2 - (P + risk * 1.5)) < 1e-9);
  assert.ok(Math.abs(v.stopPct - 1) < 1e-9);
});
ok('레버리지 공식: 손절1%→청산한계25배 캡, ATR0.5%→볼캡15, 강신호→적극15·보수8', () => {
  const v = buildVerdict(bullTF(P), bullTF(P), longM5(), 0, null, null, [supportZone, farRes], null, {});
  assert.equal(v.leverage.max, 25);          // floor(100/3)=33 → 캡 25
  assert.equal(v.leverage.aggressive, 15);   // min(25,15)×1.0
  assert.equal(v.leverage.conservative, 8);  // ceil(15/2)
});
ok('진입자리 게이트: 저항이 0.3% 위(1R 미만) → roomOk=false·entryOk=false', () => {
  const nearRes: SRZone = { price: P * 1.003, touches: 2, kind: 'resistance' };
  const v = buildVerdict(bullTF(P), bullTF(P), longM5(), 0, null, null, [supportZone, nearRes], null, {});
  assert.equal(v.entryQuality.roomOk, false);
  assert.ok(v.entryQuality.rrToObstacle < 1);
  assert.equal(v.entryOk, false);
});
ok('상위TF 역행: 1D 하락인데 롱 → aligned=false·counterTrend 차단', () => {
  const v = buildVerdict(bullTF(P), bullTF(P), longM5(), 0, null, null, [supportZone, farRes], null,
    { htf: { h4: bearTF(P), d1: bearTF(P) } });
  assert.equal(v.regime?.aligned, false);
  assert.equal(v.entryOk, false);
  assert.ok(v.warnings.some((w) => w.includes('역추세')));
});
ok('상위TF 정렬: 1D·4H 상승 + 롱 → aligned=true·가점', () => {
  const base = buildVerdict(bullTF(P), bullTF(P), longM5(), 0, null, null, [supportZone, farRes], null, {});
  const v = buildVerdict(bullTF(P), bullTF(P), longM5(), 0, null, null, [supportZone, farRes], null,
    { htf: { h4: bullTF(P), d1: bullTF(P) } });
  assert.equal(v.regime?.aligned, true);
  assert.ok(v.score >= base.score);
  assert.equal(v.confidence.grade, '견고');
});
ok('중립: direction=wait + 진입플랜에 기울기 표시', () => {
  // 진짜 균형: EMA20 위(+8) vs VWAP 아래(-6), RSI 65(밴드 밖), 구조 횡보 → |score|<20
  const flat15 = mkTF({ priceVsEma20: 'above', priceVsVwap: 'below', rsi: 65 });
  const v = buildVerdict(mkTF({ tf: '1H' }), flat15, mkTF({ tf: '5m', priceVsVwap: 'below', rsi: 65 }), 0, null, null, [], null, {});
  assert.equal(v.direction, 'wait', `score=${v.score}`);
  assert.equal(v.entryPlan.type, 'wait');
  assert.ok(v.entryPlan.note.includes('관망'));
});
ok('이벤트 12h 내: entryOk 강제 차단', () => {
  const v = buildVerdict(bullTF(P), bullTF(P), longM5(), 0, null, null, [supportZone, farRes], null,
    { event: { title: 'CPI', hoursUntil: 3 } });
  assert.equal(v.entryOk, false);
  assert.ok(v.entryNote.includes('CPI'));
});
ok('tfTrend: 정배열+EMA20위+200위=up / 역배열+아래=down / 혼조=flat', () => {
  assert.equal(tfTrend(bullTF()), 'up');
  assert.equal(tfTrend(bearTF()), 'down');
  assert.equal(tfTrend(mkTF()), 'flat');
});

console.log('\n[ stockAnalysis — 수급 결측 회귀 (과거 실버그) ]');
ok('수급 결측이면 기술적으로 강해도 entryOk=false', () => {
  // 가파른 상승 240봉 + 얕은 눌림 3봉 (posInRange<0.97, EMA20 위 유지)
  const candles: Candle[] = [];
  for (let i = 0; i < 240; i++) {
    const base = 50000 + i * 800; const c = base + 300;
    candles.push({ ts: i, o: base, h: c + 200, l: base - 200, c, v: 1_000_000, qv: c * 1_000_000 });
  }
  const peak = candles[candles.length - 1].c;
  for (let i = 0; i < 3; i++) {
    const c = peak * (1 - 0.008 * (i + 1));
    candles.push({ ts: 240 + i, o: c * 1.002, h: c * 1.004, l: c * 0.996, c, v: 2_200_000, qv: c * 2_200_000 });
  }
  const daily = analyzeTimeframe('1d', candles);
  const price = daily.close;
  const zones = srZones(candles, price, atr(candles));
  const fib = fibonacci(candles, price);
  const boost = {
    catalyst: { discPos: 2, discNeg: 0, policyPos: 2, policyNeg: 0 },
    cio: { sector: 'IT', stance: 'overweight' as const, label: '비중확대' },
    fin: { grade: 'A' } as never,
  };
  const goodSupply: InvestorDay[] = Array.from({ length: 10 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    individual: -5000, foreign: 8000, institution: 3000, foreignHoldRatio: 50 + i * 0.1,
    close: price,
  }));
  const withSupply = buildStockVerdict(daily, candles, fib, zones, { ...boost, supply: analyzeSupply(goodSupply) });
  const noSupply = buildStockVerdict(daily, candles, fib, zones, { ...boost });
  assert.equal(withSupply.entryOk, true, '수급 양호면 진입 가능해야');
  assert.equal(noSupply.entryOk, false, '수급 결측이면 진입 차단');
  assert.ok(noSupply.entryNote.includes('수급 데이터 없음'));
});

console.log(`\n전체 ${passed}개 테스트 통과 ✅\n`);
