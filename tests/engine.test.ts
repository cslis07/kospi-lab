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
import { scoreGrowth, growthPct } from '../lib/growthScreener';
import { scoreUsGrowth, US_UNIVERSE, US_SECTORS, US_THEMES } from '../lib/usGrowth';
import { scoreboard } from '../lib/journalStats';
import { reconcileClosedPositions, plannedRiskUsdt, normSymbol, type ClosedPositionLike, type JournalLike } from '../lib/bitgetJournal';
import { aggregateRisk, type FuturesPositionLike } from '../lib/riskDashboard';
import { isEmptyData, findFirstSyncConflicts } from '../lib/cloudSync';
import { evaluateTradeGate, LIMITS, type TradePlan } from '../lib/tradeGate';
import { buildRetro, hasPlan, type RetroEntry } from '../lib/journalRetro';
import { evaluateBreaker, DEFAULT_LIMITS, type BreakerEntry } from '../lib/circuitBreaker';

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

  // M-1 회귀: supply 객체가 있어도 값이 전부 0(파서 실패·거래 없음)이면 통과하면 안 된다
  const zeroSupply: InvestorDay[] = Array.from({ length: 10 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    individual: 0, foreign: 0, institution: 0, foreignHoldRatio: null, close: price,
  }));
  const s = analyzeSupply(zeroSupply);
  assert.equal(s.dataDays, 0, '전부 0이면 dataDays=0');
  const zeroV = buildStockVerdict(daily, candles, fib, zones, { ...boost, supply: s });
  assert.equal(zeroV.entryOk, false, '전부 0인 수급은 검증됨으로 보지 않아 진입 차단');
});

console.log('\n[ coinAnalysis — 게이트 회귀 (M-4·M-5) ]');
ok('M-5: 펀딩 정산 직후(음수 분)도 회피 구간 — entryOk 차단', () => {
  const nextTs = Date.now() - 3 * 60_000;   // 3분 전 정산됨
  const v = buildVerdict(bullTF(P), bullTF(P), longM5(), 0, nextTs, null, [supportZone, farRes], null, {});
  assert.equal(v.entryOk, false, '정산 직후는 진입 불가');
  assert.ok(v.warnings.some((w) => w.includes('정산 직후')), `warnings=${v.warnings}`);
});
ok('M-4: 이벤트 임박이면 confidence 가 견고/보통이 아니라 약함', () => {
  const v = buildVerdict(bullTF(P), bullTF(P), longM5(), 0, null, null, [supportZone, farRes], null,
    { event: { title: 'CPI', hoursUntil: 3 }, htf: { h4: bullTF(P), d1: bullTF(P) } });
  assert.equal(v.entryOk, false);
  assert.equal(v.confidence.grade, '약함', `grade=${v.confidence.grade} pct=${v.confidence.pct}`);
  assert.ok(v.confidence.pct <= 40, `차단 게이트면 pct 상한 40: ${v.confidence.pct}`);
});

/* ── 2026-07-27 전체 점검에서 확정된 버그들의 회귀 테스트 ──────────────
 * 기존 15개는 강신호(score 96·entryOk=true) 구간만 밟아 실사용 구간
 * (score 20~60·entryOk=false)의 버그를 전부 놓쳤다. 아래는 그 구간을 겨냥한다. */
console.log('\n[ 회귀 — 분할매수 손절 불변식 (C-1) ]');
ok('tranches3: 손절 밖 존을 줘도 모든 차수가 손절 안쪽으로 클램프된다 (롱)', () => {
  // 손절 99 인데 존이 97~100 (마지막 차수가 손절 밖으로 나가던 구성)
  const t = tranches3(3000, 10, 100, 99, true, { type: 'pullback', zoneLow: 97, zoneHigh: 100 });
  for (const r of t.rows) assert.ok(r.price > 99, `차수 지정가 ${r.price} 가 손절 99 밖`);
  assert.ok(t.avg > 99, `평단 ${t.avg} 이 손절 밖`);
  assert.ok(Math.abs(t.rows.reduce((a, r) => a + r.notion, 0) - 3000) < 1e-6, '노션 보존');
});
ok('tranches3: 숏도 동일 — 모든 차수가 손절(위) 안쪽', () => {
  const t = tranches3(3000, 10, 100, 101, false, { type: 'pullback', zoneLow: 100, zoneHigh: 103 });
  for (const r of t.rows) assert.ok(r.price < 101, `차수 지정가 ${r.price} 가 손절 101 밖`);
  assert.ok(t.avg < 101);
});
ok('buildVerdict: EMA20이 손절 밖이어도 눌림 존이 손절 안쪽으로 좁혀진다', () => {
  // 트리거 없는 롱(=pullback 분기) + EMA20(97)이 손절(99)보다 아래
  const m15Low = { ...bullTF(P), ema20: 97 };
  const v = buildVerdict(bullTF(P), m15Low, bullTF(P), 0, null, null, [supportZone, farRes], null, {});
  assert.equal(v.direction, 'long', `score=${v.score}`);
  assert.equal(v.entryPlan.type, 'pullback');
  assert.ok(v.entryPlan.zoneLow > v.stop, `zoneLow=${v.entryPlan.zoneLow} stop=${v.stop}`);
  // 그 존을 그대로 분할매수에 넣어도 손절 밖 지정가가 나오지 않아야 한다
  const t = tranches3(1000, 5, v.entry, v.stop, true, v.entryPlan);
  for (const r of t.rows) assert.ok(r.price > v.stop, `차수 ${r.price} < 손절 ${v.stop}`);
});

console.log('\n[ 회귀 — 목표·손익비 (H-3) ]');
ok('피보나치 확장이 target2를 target1보다 나쁘게 덮어쓰지 않는다 (롱)', () => {
  // e1272=100.2 는 기본 target2(101.5)보다 가까움 → 채택되면 안 됨
  const fib = { direction: 'up' as const, swingLow: 95, swingHigh: 100,
    r382: 98, r50: 97.5, r618: 97, e1272: 100.2, e1618: 101, nearest: null };
  const v = buildVerdict(bullTF(P), bullTF(P), longM5(), 0, null, fib, [supportZone, farRes], null, {});
  assert.ok(v.target2 > v.target1, `target2=${v.target2} <= target1=${v.target1}`);
  assert.ok(v.rr >= 1.5, `rr=${v.rr}`);
});
ok('rr 은 상수 1.5 가 아니라 실제 target2 기준으로 계산된다', () => {
  const v = buildVerdict(bullTF(P), bullTF(P), longM5(), 0, null, null, [supportZone, farRes], null, {});
  const expected = Math.abs(v.target2 - v.entry) / Math.abs(v.entry - v.stop);
  assert.ok(Math.abs(v.rr - expected) < 1e-9, `rr=${v.rr} expected=${expected}`);
  const rrCheck = v.checklist.find((c) => c.label.includes('손익비'));
  assert.equal(rrCheck?.pass, v.rr >= 1.5, '체크리스트가 하드코딩 true 면 안 됨');
});

console.log('\n[ 회귀 — 레버리지 신호강도 (signalGrade) ]');
ok('signalGrade 가 entryOk 별칭이 아니라 score 의 함수다', () => {
  // 둘 다 트리거 없음(entryOk=false) — 예전에는 점수와 무관하게 똑같이 '약'(0.4)이었다
  const strong = buildVerdict(bullTF(P), bullTF(P), bullTF(P), 0, null, null, [supportZone, farRes], null,
    { htf: { h4: bullTF(P), d1: bullTF(P) } });
  const weakM15 = mkTF({ priceVsEma20: 'above', priceVsVwap: 'below', rsi: 60 });
  const weak = buildVerdict(mkTF({ tf: '1H', emaAlign: '정배열', priceVsEma20: 'above' }), weakM15,
    mkTF({ tf: '5m', priceVsVwap: 'below', rsi: 60 }), 0, null, null, [supportZone, farRes], null, {});
  assert.equal(strong.entryOk, false, '둘 다 트리거 미확인 상태여야');
  assert.equal(weak.entryOk, false);
  assert.ok(Math.abs(strong.score) > Math.abs(weak.score), `strong=${strong.score} weak=${weak.score}`);
  assert.ok(strong.leverage.aggressive > weak.leverage.aggressive,
    `점수가 높은 쪽 배율이 더 커야: strong=${strong.leverage.aggressive} weak=${weak.leverage.aggressive}`);
  assert.ok(strong.leverage.note.includes(`점수 ${strong.score}`), 'note 에 실제 점수가 드러나야');
});

console.log('\n[ 회귀 — stockAnalysis 목표가·백테스트 (H-6, H-5) ]');
ok('현재가 위 저항이 하나도 없어도 target1 이 Infinity 가 아니다', () => {
  const candles: Candle[] = [];
  // 오래 상승 후 마지막에 급락 — 모든 저항 클러스터가 현재가 위가 아니게 만든다
  for (let i = 0; i < 200; i++) {
    const base = 50000 + i * 300; const c = base + 100;
    candles.push({ ts: i, o: base, h: c + 150, l: base - 150, c, v: 1e6, qv: c * 1e6 });
  }
  const top = candles[candles.length - 1].c;
  for (let i = 0; i < 40; i++) {
    const c = top * (1 + 0.004 * (i + 1));   // 계속 신고가 → 위쪽 저항 없음
    candles.push({ ts: 200 + i, o: c * 0.999, h: c * 1.002, l: c * 0.997, c, v: 1e6, qv: c * 1e6 });
  }
  const daily = analyzeTimeframe('1d', candles);
  const price = daily.close;
  const v = buildStockVerdict(daily, candles, fibonacci(candles, price), srZones(candles, price, atr(candles)), {});
  assert.ok(Number.isFinite(v.target1), `target1=${v.target1} (Infinity 면 UI 에 "∞원"이 찍힌다)`);
  assert.ok(v.target1 > price, `target1=${v.target1} price=${price}`);
});
ok('technicalOnly 면 수급 게이트를 면제한다 (백테스트가 신호 0건이던 원인)', () => {
  const candles: Candle[] = [];
  for (let i = 0; i < 240; i++) {
    const base = 50000 + i * 800; const c = base + 300;
    candles.push({ ts: i, o: base, h: c + 200, l: base - 200, c, v: 1e6, qv: c * 1e6 });
  }
  const peak = candles[candles.length - 1].c;
  for (let i = 0; i < 3; i++) {
    const c = peak * (1 - 0.008 * (i + 1));
    candles.push({ ts: 240 + i, o: c * 1.002, h: c * 1.004, l: c * 0.996, c, v: 2.2e6, qv: c * 2.2e6 });
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
  const bt = buildStockVerdict(daily, candles, fib, zones, { ...boost, technicalOnly: true });
  const live = buildStockVerdict(daily, candles, fib, zones, { ...boost });
  assert.equal(bt.entryOk, true, '백테스트 모드는 수급 없이도 신호가 나와야');
  assert.equal(live.entryOk, false, '실시간 모드는 여전히 수급 결측을 차단해야');
});

console.log('\n[ growthScreener — 성장주 점수 (순수 함수) ]');
{
  const base = {
    code: '000000', years: ['202312', '202412', '202512'], consensusYear: '202612' as string | null,
    revenue: [100, 120, 150], opProfit: [10, 13, 18], netIncome: [8, 10, 14],
    eps: [800, 1000, 1400], roe: [12, 14, 16], opMargin: [10, 10.8, 12],
    per: [15, 14, 12], debtRatio: [60, 55, 50],
    cRevenue: 190, cOpProfit: 25, cNetIncome: 19, cEps: 1900, cPer: 9,
    netMargin: 9.3, quickRatio: 150, retention: 2000, pbr: 1.8, dividendPerShare: 500,
  };
  ok('고성장+컨센서스 좋은 종목은 고득점 + 배지', () => {
    const s = scoreGrowth({ ...base });
    assert.ok(s.total >= 70, `total=${s.total}`);
    assert.ok(s.badges.includes('고성장'), `badges=${s.badges}`);
    assert.ok(s.badges.includes('기대주'));
    assert.equal(s.hasConsensus, true);
    // PEG = 9 / ((1900-1400)/1400*100 = 35.7%) ≈ 0.25 → 저평가성장
    assert.ok(s.metrics.peg != null && s.metrics.peg < 1, `peg=${s.metrics.peg}`);
    assert.ok(s.badges.includes('저평가성장'));
  });
  ok('컨센서스 없으면 미래 기대 0점 + hasConsensus=false (미커버 소형주)', () => {
    const s = scoreGrowth({ ...base, consensusYear: null, cRevenue: null, cOpProfit: null, cNetIncome: null, cEps: null, cPer: null });
    assert.equal(s.hasConsensus, false);
    assert.equal(s.parts.outlook, 0);
    assert.ok(s.warnings.some((w) => w.includes('컨센서스 없음')));
  });
  ok('적자→흑자 컨센서스는 턴어라운드 배지, PEG 는 계산하지 않음', () => {
    const s = scoreGrowth({
      ...base,
      opProfit: [-30, -20, -10], netIncome: [-25, -18, -8], eps: [-500, -360, -160],
      per: [-10, -12, -20],                       // 적자 기업 PER 음수 (실측 328130 패턴)
      cOpProfit: 5, cNetIncome: 3, cEps: 60, cPer: 50,
    });
    assert.ok(s.badges.includes('턴어라운드'), `badges=${s.badges}`);
    assert.equal(s.metrics.trailingPer, null, '음수 PER 는 trailing 으로 쓰지 않는다');
    assert.equal(s.metrics.peg, null, '음수 EPS 기반 성장률로 PEG 계산 금지');
  });
  ok('버핏 체크: 우량 픽스처 통과 개수 + 데이터 결측은 null(–)', () => {
    const s = scoreGrowth({ ...base });
    // ROE 12→14→16 전부 10↑ ✓ · 흑자 3년 ✓ · 부채 50<100 ✓ · 매출 2년 연속 ✓ · 배당 500원 ✓ · 당좌 150 ✓ / 영업이익률 12<15 ✗
    assert.equal(s.buffett.pass, 6, `pass=${s.buffett.pass}: ${JSON.stringify(s.buffett.checks)}`);
    const s2 = scoreGrowth({ ...base, quickRatio: null, dividendPerShare: null });
    const q = s2.buffett.checks.find((c) => c.label.includes('당좌'));
    assert.equal(q?.pass, null, '결측은 실패가 아니라 미평가(null)');
  });
  ok('추천 코멘트: 강점·주의점이 룰대로 뽑힌다', () => {
    const good = scoreGrowth({ ...base });
    assert.ok(good.comment.includes('컨센서스 영업이익'), good.comment);   // cOpGrowth 38.9% ≥ 30
    const noCons = scoreGrowth({ ...base, consensusYear: null, cRevenue: null, cOpProfit: null, cNetIncome: null, cEps: null, cPer: null });
    assert.ok(noCons.comment.includes('미커버'), noCons.comment);
  });
  ok('limited(KIS 폴백) 이면 경고를 달고, 점수 하락이 데이터 부족 탓임을 알린다', () => {
    const s = scoreGrowth({
      ...base, limited: true,
      consensusYear: null, cRevenue: null, cOpProfit: null, cNetIncome: null, cEps: null, cPer: null,
    });
    assert.ok(s.warnings.some((w) => w.includes('KIS 최소 데이터')), `warnings=${s.warnings}`);
    assert.equal(s.parts.outlook, 0, '컨센서스 없으므로 미래 기대 0');
    assert.ok(s.total < scoreGrowth({ ...base }).total, '정상 데이터보다 점수가 낮아야');
  });
  ok('growthPct: 전기 0·null 은 null, ±300% 클램프', () => {
    assert.equal(growthPct(100, 0), null);
    assert.equal(growthPct(null, 100), null);
    assert.equal(growthPct(100, null), null);
    assert.equal(growthPct(1000, 10), 300, '이상치 클램프');
    assert.equal(growthPct(-1000, 10), -300);
    assert.equal(growthPct(120, 100), 20);
    assert.equal(growthPct(80, -100), 180, '적자 축소도 양의 개선율');
  });
}

console.log('\n[ usGrowth — 미국 성장주 점수 (Yahoo 필드) ]');
{
  // Yahoo quoteSummary 실제 응답 형태의 최소 픽스처
  const yf = (over: Record<string, unknown> = {}) => ({
    financialData: {
      revenueGrowth: { raw: 0.25 }, earningsGrowth: { raw: 0.3 },
      returnOnEquity: { raw: 0.28 }, operatingMargins: { raw: 0.3 }, profitMargins: { raw: 0.22 },
      freeCashflow: { raw: 5e9 }, debtToEquity: { raw: 45 }, currentPrice: { raw: 200 },
      ...((over.financialData as object) ?? {}),
    },
    defaultKeyStatistics: { trailingPE: { raw: 40 }, forwardPE: { raw: 28 }, pegRatio: { raw: 0.9 },
      ...((over.defaultKeyStatistics as object) ?? {}) },
    summaryDetail: { dividendYield: { raw: 0.006 }, marketCap: { raw: 1e12 },
      ...((over.summaryDetail as object) ?? {}) },
  });
  ok('우량 성장주(고성장·PEG<1·FCF+)는 고득점 + 배지 + 버핏 다수 통과', () => {
    const s = scoreUsGrowth(yf());
    assert.ok(s.total >= 70, `total=${s.total}`);
    assert.ok(s.badges.includes('고성장') && s.badges.includes('저평가성장'), `badges=${s.badges}`);
    assert.ok(s.buffett.pass >= 6, `buffett=${s.buffett.pass}: ${JSON.stringify(s.buffett.checks)}`);
    // 포워드 EPS 성장 = 40/28 - 1 = 42.9%
    assert.ok(s.metrics.cEpsGrowth != null && Math.abs(s.metrics.cEpsGrowth - 42.9) < 0.2, `cEpsGrowth=${s.metrics.cEpsGrowth}`);
  });
  ok('적자 기업(trailingPE 없음)은 PEG 미계산 + 턴어라운드 분류', () => {
    const s = scoreUsGrowth(yf({
      financialData: { profitMargins: { raw: -0.1 }, freeCashflow: { raw: -1e9 } },
      defaultKeyStatistics: { trailingPE: undefined, pegRatio: undefined },
    }));
    assert.equal(s.metrics.trailingPer, null);
    assert.equal(s.metrics.peg, null, 'Yahoo peg 없고 trailing 없으면 PEG 미계산');
    assert.ok(s.badges.includes('턴어라운드'), `badges=${s.badges}`);
    assert.ok(s.comment.includes('적자'), s.comment);
  });
  ok('유니버스 무결성: 티커 중복 없음 · 섹터/테마가 허용 목록 안 · 테마 1개 이상', () => {
    const seen = new Set<string>();
    for (const u of US_UNIVERSE) {
      assert.ok(!seen.has(u.ticker), `티커 중복: ${u.ticker}`);
      seen.add(u.ticker);
      assert.ok((US_SECTORS as readonly string[]).includes(u.sector), `${u.ticker}: 알 수 없는 섹터 ${u.sector}`);
      assert.ok(u.themes.length >= 1, `${u.ticker}: 테마 없음`);
      for (const t of u.themes) assert.ok((US_THEMES as readonly string[]).includes(t), `${u.ticker}: 알 수 없는 테마 ${t}`);
    }
    assert.ok(US_UNIVERSE.length >= 100, `유니버스 ${US_UNIVERSE.length}종목`);
  });
  ok('모든 섹터·테마에 종목이 최소 1개씩 (빈 카테고리 칩 방지)', () => {
    for (const s of US_SECTORS) {
      assert.ok(US_UNIVERSE.some((u) => u.sector === s), `섹터 '${s}' 에 종목 없음`);
    }
    for (const t of US_THEMES) {
      assert.ok(US_UNIVERSE.some((u) => u.themes.includes(t)), `테마 '${t}' 에 종목 없음`);
    }
  });
  ok('KR 과 동일한 출력 형태(parts 합=total, 부문 상한)', () => {
    const s = scoreUsGrowth(yf());
    const sum = s.parts.growth + s.parts.outlook + s.parts.quality + s.parts.valuation;
    assert.ok(Math.abs(sum - s.total) < 0.001, `sum=${sum} total=${s.total}`);
    assert.ok(s.parts.growth <= 35 && s.parts.outlook <= 30 && s.parts.quality <= 15 && s.parts.valuation <= 20);
  });
}

console.log('\n[ journalStats — 성적 실측 (순수 함수) ]');
{
  const now = 1_000_000_000_000;
  const DAY = 86_400_000;
  const rows = [
    { ts: now - 1 * DAY, result: 'win' as const, resultR: 1, realizedUsdt: 20 },
    { ts: now - 2 * DAY, result: 'loss' as const, resultR: -1, realizedUsdt: -18 },
    { ts: now - 3 * DAY, result: 'win' as const, resultR: 1.5, realizedUsdt: 30 },
    { ts: now - 40 * DAY, result: 'loss' as const, resultR: -1, realizedUsdt: null },
    { ts: now - 1 * DAY, result: 'open' as const, resultR: null },
    { ts: now - 5 * DAY, result: 'even' as const, resultR: 0 },
  ];
  ok('승률은 even·open 제외, 결정된 것만으로 계산', () => {
    const s = scoreboard(rows, now);
    // 승 2 · 패 2 → 50%
    assert.equal(s.winRate, 50);
    assert.equal(s.wins, 2); assert.equal(s.losses, 2); assert.equal(s.evens, 1); assert.equal(s.open, 1);
  });
  ok('기대값·best·worst·실현손익 합계', () => {
    const s = scoreboard(rows, now);
    // 청산 5건(win1+loss-1+win1.5+loss-1+even0)/5 = 0.1
    assert.ok(Math.abs(s.avgR! - 0.1) < 1e-9, `avgR=${s.avgR}`);
    assert.equal(s.bestR, 1.5); assert.equal(s.worstR, -1);
    assert.equal(s.realizedUsdt, 32); assert.equal(s.realizedCount, 3);   // null 은 제외
  });
  ok('미청산 비율 — 규율 신호', () => {
    const s = scoreboard(rows, now);
    assert.ok(Math.abs(s.openRatio - 1 / 6) < 1e-9, `openRatio=${s.openRatio}`);
  });
  ok('시간창: 최근 7일은 40일 전 건을 제외', () => {
    const s = scoreboard(rows, now);
    const w7 = s.windows.find((w) => w.label === '최근 7일')!;
    const all = s.windows.find((w) => w.label === '전체')!;
    assert.equal(w7.closed, 4);   // 40일 전 loss 제외, open 제외
    assert.equal(all.closed, 5);
  });
  ok('빈 저널은 null 로 안전 (0으로 나누기 방어)', () => {
    const s = scoreboard([], now);
    assert.equal(s.winRate, null); assert.equal(s.avgR, null);
    assert.equal(s.bestR, null); assert.equal(s.realizedUsdt, null);
    assert.equal(s.openRatio, 0);
  });
}

/* ── 거래소 대조 (돈이 걸린 판정이라 고정한다) ──────────── */
{
  const DAY = 86_400_000;
  const t0 = Date.UTC(2026, 7, 1);
  const closed = (over: Partial<ClosedPositionLike> = {}): ClosedPositionLike => ({
    positionId: 'p1', symbol: 'BTCUSDT', side: 'long',
    openAvg: 100, closeAvg: 110, netProfit: 50,
    openTs: t0, closeTs: t0 + DAY, ...over,
  });
  const plan = (over: Partial<JournalLike> = {}): JournalLike => ({
    id: 'j1', ts: t0, symbol: 'BTCUSDT', direction: 'long',
    entry: 100, stop: 95, result: 'open',
    seedUsdt: 1000, riskPct: 1, ...over,
  });

  ok('대조: 계획 기록에 실제 실현손익을 채우고 R 로 환산', () => {
    const r = reconcileClosedPositions([closed()], [plan()]);
    assert.equal(r.updates.length, 1);
    assert.equal(r.additions.length, 0);
    const p = r.updates[0].patch;
    assert.equal(p.result, 'win');
    assert.equal(p.realizedUsdt, 50);
    assert.equal(p.resultR, 5);              // 1R=시드1000의 1%=10 USDT → 50/10 = 5R
    assert.equal(p.exchangePositionId, 'p1');
  });

  ok('대조: 계획 리스크를 모르면 R 을 지어내지 않는다(null)', () => {
    const r = reconcileClosedPositions([closed()], [plan({ seedUsdt: null, riskPct: null })]);
    assert.equal(r.updates[0].patch.resultR, null);
    assert.equal(r.updates[0].patch.realizedUsdt, 50);
  });

  ok('대조: 노션·손절거리로 1R 역산 (2순위 경로)', () => {
    // 노션 2000 · 손절거리 5% → 1R = 100 USDT. 실현 50 → 0.5R
    const r = reconcileClosedPositions([closed()], [plan({ seedUsdt: null, riskPct: null, notionUsdt: 2000 })]);
    assert.equal(r.updates[0].patch.resultR, 0.5);
  });

  ok('대조: 계획 없이 친 매매는 숨기지 않고 새 기록으로 남긴다', () => {
    const r = reconcileClosedPositions([closed({ netProfit: -30 })], []);
    assert.equal(r.updates.length, 0);
    assert.equal(r.additions.length, 1);
    const a = r.additions[0];
    assert.equal(a.id, 'bitget-p1');
    assert.equal(a.result, 'loss');
    assert.equal(a.realizedUsdt, -30);
    assert.equal(a.resultR, null);          // 계획이 없으니 R 없음
    assert.equal(a.stop, 0);                // 손절가를 지어내지 않는다
  });

  ok('대조: 이미 반영된 포지션은 두 번 반영하지 않는다', () => {
    const done = plan({ id: 'j1', result: 'win', exchangePositionId: 'p1' });
    const r = reconcileClosedPositions([closed()], [done]);
    assert.equal(r.updates.length, 0);
    assert.equal(r.additions.length, 0);
    assert.equal(r.skipped, 1);
    // 자동 생성분(bitget-p1)도 같은 방식으로 걸러진다
    const r2 = reconcileClosedPositions([closed()], [{ ...done, id: 'bitget-p1', exchangePositionId: null }]);
    assert.equal(r2.skipped, 1);
  });

  ok('대조: 방향·심볼이 다르면 매칭하지 않는다', () => {
    const rDir = reconcileClosedPositions([closed({ side: 'short' })], [plan()]);
    assert.equal(rDir.updates.length, 0);
    assert.equal(rDir.additions.length, 1);
    const rSym = reconcileClosedPositions([closed({ symbol: 'ETHUSDT' })], [plan()]);
    assert.equal(rSym.updates.length, 0);
  });

  ok('대조: 한 계획 기록이 두 포지션에 중복 매칭되지 않는다', () => {
    const two = [closed({ positionId: 'p1' }), closed({ positionId: 'p2', closeTs: t0 + 2 * DAY })];
    const r = reconcileClosedPositions(two, [plan()]);
    assert.equal(r.updates.length, 1);      // 하나만 계획에 매칭
    assert.equal(r.additions.length, 1);    // 나머지는 계획 없는 매매로
  });

  ok('대조: 청산보다 나중에 기록된 계획은 매칭 대상이 아니다', () => {
    const r = reconcileClosedPositions([closed()], [plan({ ts: t0 + 5 * DAY })]);
    assert.equal(r.updates.length, 0);
    assert.equal(r.additions.length, 1);
  });

  ok('대조: 심볼 표기 차이(_UMCBL·소문자)를 흡수한다', () => {
    assert.equal(normSymbol('BTCUSDT_UMCBL'), 'BTCUSDT');
    assert.equal(normSymbol('btcusdt'), 'BTCUSDT');
    const r = reconcileClosedPositions([closed({ symbol: 'BTCUSDT_UMCBL' })], [plan()]);
    assert.equal(r.updates.length, 1);
  });

  ok('대조: 손익 0은 even', () => {
    const r = reconcileClosedPositions([closed({ netProfit: 0 })], [plan()]);
    assert.equal(r.updates[0].patch.result, 'even');
  });

  ok('plannedRiskUsdt: 시드·리스크% 우선, 없으면 노션×손절거리, 둘 다 없으면 null', () => {
    assert.equal(plannedRiskUsdt(plan()), 10);
    assert.equal(plannedRiskUsdt(plan({ seedUsdt: null, riskPct: null, notionUsdt: 2000 })), 100);
    assert.equal(plannedRiskUsdt(plan({ seedUsdt: null, riskPct: null })), null);
  });
}

/* ── 통합 리스크 집계 ────────────────────────────────── */
{
  const fx = 1400;
  const fut = (o: Partial<FuturesPositionLike> = {}): FuturesPositionLike => ({
    symbol: 'BTCUSDT', side: 'long', size: 1, markPrice: 100, leverage: 5,
    marginSize: 20, unrealizedPL: 0, liquidationPrice: 80, liqDistPct: 20, ...o,
  });
  const base = { futures: [], openPlans: [], holdings: [], futuresEquity: null, usdkrw: fx };

  ok('리스크: 빈 계좌는 0 과 null 로 안전', () => {
    const r = aggregateRisk({ ...base });
    assert.equal(r.grossExposureKrw, 0);
    assert.equal(r.effectiveLeverage, null);
    assert.equal(r.nearestLiq, null);
    assert.equal(r.warnings.length, 0);
  });

  ok('리스크: 선물 노션·주식 보유를 원화로 합산', () => {
    const r = aggregateRisk({
      ...base,
      futures: [fut({ size: 2, markPrice: 100 })],                    // 200 USDT
      holdings: [{ ticker: '005930', quantity: 10, avgPrice: 70000, price: null, currency: 'KRW' }], // 70만원
    });
    assert.equal(r.futuresNotionalKrw, 200 * fx);
    assert.equal(r.equityValueKrw, 700_000);
    assert.equal(r.grossExposureKrw, 200 * fx + 700_000);
    assert.equal(r.unpricedHoldings, 1);   // 현재가 없어 평단 대체 — 정직하게 센다
  });

  ok('리스크: 동시 손절 손실은 계획 있는 건만 합산하고 없는 건은 따로 센다', () => {
    const r = aggregateRisk({
      ...base,
      openPlans: [
        { symbol: 'BTCUSDT', direction: 'long', entry: 100, stop: 95, seedUsdt: 1000, riskPct: 1, result: 'open' },  // 10 USDT
        { symbol: 'ETHUSDT', direction: 'long', entry: 100, stop: 90, notionUsdt: 500, result: 'open' },             // 50 USDT
        { symbol: 'XRPUSDT', direction: 'long', entry: 100, stop: 0, result: 'open' },                               // 손절 없음
        { symbol: 'SOLUSDT', direction: 'long', entry: 100, stop: 95, seedUsdt: 1000, riskPct: 1, result: 'win' },   // 닫힘 → 제외
      ],
    });
    assert.equal(r.plannedStopLossKrw, 60 * fx);
    assert.equal(r.plansWithoutStop, 1);
  });

  ok('리스크: 청산 임박·고레버리지를 경고로 승격', () => {
    const r = aggregateRisk({
      ...base,
      futures: [fut({ liqDistPct: 6 })],
      futuresEquity: 10,                     // 노션 100 / 자기자본 10 → 10배
    });
    const liq = r.warnings.find((w) => w.title.includes('청산까지'));
    assert.ok(liq && liq.level === 'high', '청산 8% 미만은 high');
    const lev = r.warnings.find((w) => w.title.includes('실효 레버리지'));
    assert.ok(lev && lev.level === 'high', '6배 초과는 high');
    assert.ok(Math.abs(r.effectiveLeverage! - 10) < 1e-9);
  });

  ok('리스크: 코인 상관 경고 — 나눠 담아도 분산이 아니다', () => {
    const r = aggregateRisk({
      ...base,
      futures: [fut({ symbol: 'BTCUSDT' }), fut({ symbol: 'ETHUSDT' })],
    });
    assert.ok(r.warnings.some((w) => w.title.includes('코인 익스포저')));
  });

  ok('리스크: 방향 편중과 최대 집중을 계산', () => {
    const r = aggregateRisk({
      ...base,
      futures: [fut({ symbol: 'BTCUSDT', size: 8 }), fut({ symbol: 'ETHUSDT', size: 2, side: 'short' })],
    });
    assert.equal(r.longKrw, 800 * fx);
    assert.equal(r.shortKrw, 200 * fx);
    assert.equal(r.netDirectionKrw, 600 * fx);
    assert.equal(r.topConcentration!.label, 'BTC');
    assert.ok(Math.abs(r.topConcentration!.pct - 80) < 1e-9);
  });

  ok('리스크: 경고는 심각도 순으로 정렬된다', () => {
    const r = aggregateRisk({ ...base, futures: [fut({ liqDistPct: 5 })], futuresEquity: 10 });
    const lv = r.warnings.map((w) => w.level);
    const rank = { high: 0, mid: 1, low: 2 };
    for (let i = 1; i < lv.length; i++) assert.ok(rank[lv[i - 1]] <= rank[lv[i]], '정렬 위반');
  });

  ok('리스크: 환율 0·음수는 기본값으로 방어', () => {
    const r = aggregateRisk({ ...base, futures: [fut()], usdkrw: 0 });
    assert.equal(r.usdkrw, 1400);
    assert.ok(r.grossExposureKrw > 0);
  });
}

/* ── 클라우드 동기화 안전장치 (데이터 손실 방지) ────────── */
{
  ok('동기화: 빈 값 판별 — 빈 배열·객체·null·빈 문자열', () => {
    for (const v of [[], {}, null, undefined, '', '  ', '[]', '{}']) assert.equal(isEmptyData(v), true, String(v));
    for (const v of [[1], { a: 1 }, 'x', 0, false]) assert.equal(isEmptyData(v), false, String(v));
  });

  ok('동기화: 첫 동기화 충돌 — 양쪽에 내용이 있을 때만 충돌로 본다', () => {
    const g = globalThis as unknown as { localStorage?: unknown };
    const store: Record<string, string> = {
      'kospi-lab-coin-journal': JSON.stringify([{ id: 'a' }]),   // 이 기기에 기록 있음
      'kospi-lab-watchlist': JSON.stringify([]),                 // 이 기기는 비어 있음
    };
    const keys = Object.keys(store);
    g.localStorage = {
      length: keys.length,
      key: (i: number) => keys[i] ?? null,
      getItem: (k: string) => store[k] ?? null,
      setItem: () => {}, removeItem: () => {},
    };
    const remote = [
      { id: 'kospi-lab-coin-journal', data: [{ id: 'b' }], updatedAt: 1 },  // 서버도 내용 있음 → 충돌
      { id: 'kospi-lab-watchlist', data: [{ t: 'x' }], updatedAt: 1 },      // 이 기기가 비었으니 충돌 아님
      { id: 'kospi-lab-candidates', data: [{ c: 1 }], updatedAt: 1 },       // 이 기기에 없음 → 충돌 아님
    ];
    assert.deepEqual(findFirstSyncConflicts(remote, {}), ['kospi-lab-coin-journal']);
    // 이미 동기화 이력(meta)이 있으면 LWW 로 처리 — 충돌로 보지 않는다
    assert.deepEqual(findFirstSyncConflicts(remote, { 'kospi-lab-coin-journal': { hash: 'h', updatedAt: 1 } }), []);
    delete g.localStorage;
  });
}

/* ── 실행 가능 판정 (Go/No-Go) — "사도 되는가"에 정직하게 답하는 부분 ── */
{
  const plan = (o: Partial<TradePlan> = {}): TradePlan => ({
    direction: 'long', entry: 100, stop: 99, target1: 102,
    seed: 1000, riskPct: 1, leverage: 5, notion: 1000, margin: 200,
    liqSafety: 5, eventHoursUntil: null, account: null, ...o,
  });

  ok('판정: 조건이 맞으면 GO — 다만 "돈 번다"가 아니라 "버틴다"', () => {
    const g = evaluateTradeGate(plan());
    assert.equal(g.verdict, 'go');
    assert.equal(g.lossAtStop, 10);          // 노션1000 × 손절1% = 10 USDT
    assert.equal(g.lossPctOfSeed, 1);
    assert.ok(g.headline.includes('실행 가능'));
  });

  ok('판정: 손절 없으면 무조건 NO (크기 조정으로 해결 안 됨)', () => {
    const g = evaluateTradeGate(plan({ stop: 0 }));
    assert.equal(g.verdict, 'no');
    assert.equal(g.checks.find((c) => c.id === 'stop')!.state, 'fail');
  });

  ok('판정: 롱인데 손절이 진입가 위면 NO', () => {
    const g = evaluateTradeGate(plan({ stop: 101 }));
    assert.equal(g.verdict, 'no');
    assert.ok(g.checks.find((c) => c.id === 'stop')!.fix!.includes('아래로'));
  });

  ok('판정: 계좌 대비 손실 초과는 RESIZE + 최대 노션 제시', () => {
    // 노션 5000 × 손절1% = 50 USDT = 시드의 5% > 한도 2%
    const g = evaluateTradeGate(plan({ notion: 5000 }));
    assert.equal(g.verdict, 'resize');
    assert.equal(g.suggest.maxNotion, 2000);   // 1000×2% ÷ 1% = 2000
  });

  ok('판정: 청산이 손절보다 가까우면 RESIZE + 최대 배율 제시', () => {
    const g = evaluateTradeGate(plan({ liqSafety: 1 }));
    assert.equal(g.verdict, 'resize');
    assert.equal(g.checks.find((c) => c.id === 'liq')!.state, 'fail');
    assert.equal(g.suggest.maxLeverage, 2);    // 5배 × (1/2)
  });

  ok('판정: 증거금이 시드를 넘으면 RESIZE + 허용손실 상한 제시', () => {
    const g = evaluateTradeGate(plan({ margin: 2000 }));
    assert.equal(g.verdict, 'resize');
    assert.equal(g.suggest.maxRiskPct, 0.5);   // 1% × 1000/2000
  });

  ok('판정: 손익비 1 미만이면 NO (크기로 해결 안 되는 산수 문제)', () => {
    const g = evaluateTradeGate(plan({ target1: 100.5 }));   // 이익 0.5 vs 손실 1
    assert.equal(g.verdict, 'no');
    assert.equal(g.checks.find((c) => c.id === 'rr')!.state, 'fail');
  });

  ok('판정: 이벤트 12h 내면 NO', () => {
    const g = evaluateTradeGate(plan({ eventHoursUntil: 3, eventTitle: 'CPI' }));
    assert.equal(g.verdict, 'no');
    assert.ok(g.checks.find((c) => c.id === 'event')!.detail.includes('CPI'));
    // 12시간을 넘기면 통과
    assert.equal(evaluateTradeGate(plan({ eventHoursUntil: 30 })).verdict, 'go');
  });

  ok('판정: 같은 방향 쏠림이 한도를 넘으면 NO', () => {
    const g = evaluateTradeGate(plan({ account: { sameSideExposure: 9000, totalExposure: 9000 } }));
    assert.equal(g.checks.find((c) => c.id === 'skew')!.state, 'fail');
    assert.equal(g.verdict, 'no');
    // 반대 방향이 충분히 있으면 통과
    assert.equal(evaluateTradeGate(plan({ account: { sameSideExposure: 0, totalExposure: 9000 } })).verdict, 'go');
  });

  ok('판정: 열린 포지션이 없으면 비중 100%를 쏠림으로 부르지 않는다', () => {
    const g = evaluateTradeGate(plan({ account: { sameSideExposure: 0, totalExposure: 0 } }));
    const skew = g.checks.find((c) => c.id === 'skew')!;
    assert.equal(skew.state, 'pass');
    assert.ok(skew.detail.includes('첫 포지션'), skew.detail);
    assert.equal(g.verdict, 'go');
  });

  ok('판정: 계좌 정보를 못 읽으면 실패가 아니라 unknown (모르는 걸 통과로 위장하지 않는다)', () => {
    const g = evaluateTradeGate(plan());
    assert.equal(g.checks.find((c) => c.id === 'skew')!.state, 'unknown');
    assert.equal(g.verdict, 'go');   // unknown 은 차단 사유가 아니다
  });

  ok('판정: 한도 상수가 보수적으로 유지된다(무단 완화 방지)', () => {
    assert.equal(LIMITS.maxRiskPctPerTrade, 2);
    assert.equal(LIMITS.minLiqSafety, 2);
    assert.equal(LIMITS.eventBlockHours, 12);
  });

  ok('판정: 서킷브레이커 blocked 면 다른 게 다 통과해도 NO', () => {
    const g = evaluateTradeGate(plan({ breaker: { blocked: true, reason: '3연속 손절' } }));
    assert.equal(g.verdict, 'no');
    assert.ok(g.checks.find((c) => c.id === 'breaker')!.state === 'fail');
  });
}

/* ── 매매 복기 (과거 서술 — 예측 아님) ── */
{
  const DAY = 86_400_000;
  const t = Date.UTC(2026,7,20,3,0,0);   // KST 정오
  const e = (o: Partial<RetroEntry> = {}): RetroEntry => ({ ts:t, direction:'long', result:'loss', realizedUsdt:-10, entry:100, stop:99, ...o });

  ok('복기: 계획 유무 분리 — stop 없으면 계획 없음', () => {
    const rows = [ e({stop:99, result:'win', realizedUsdt:20}), e({stop:0, entry:100, result:'loss', realizedUsdt:-30}) ];
    const r = buildRetro(rows);
    assert.equal(r.planned.n, 1); assert.equal(r.planned.realizedUsdt, 20);
    assert.equal(r.unplanned.n, 1); assert.equal(r.unplanned.realizedUsdt, -30);
    assert.equal(hasPlan(rows[0]), true); assert.equal(hasPlan(rows[1]), false);
  });

  ok('복기: 승률은 even·open 제외, 방향별 분리', () => {
    const rows = [ e({direction:'long',result:'win'}), e({direction:'long',result:'loss'}), e({direction:'short',result:'win'}), e({result:'open'}) ];
    const r = buildRetro(rows);
    assert.equal(r.totalClosed, 3);
    assert.equal(r.long.winRate, 50); assert.equal(r.short.winRate, 100);
  });

  ok('복기: 최대·현재 연속 손절 계산', () => {
    // 시간순 L L W L L L (최대 3, 현재 3)
    const seq: RetroEntry['result'][] = ['loss','loss','win','loss','loss','loss'];
    const rows = seq.map((res,i)=> e({ts:t+i*DAY, result:res}));
    const r = buildRetro(rows);
    assert.equal(r.maxLossStreak, 3);
    assert.equal(r.currentLossStreak, 3);
  });

  ok('복기: 계획 없는 매매가 다수+손실이면 high 통찰', () => {
    const rows = Array.from({length:5}, (_,i)=> e({ts:t+i*DAY, stop:0, result:'loss', realizedUsdt:-20}));
    const r = buildRetro(rows);
    const hi = r.insights.find(x=>x.level==='high');
    assert.ok(hi && hi.text.includes('계획'), '계획 없음 통찰 없음');
  });

  ok('복기: 빈 입력 안전', () => {
    const r = buildRetro([]);
    assert.equal(r.totalClosed, 0); assert.equal(r.maxLossStreak, 0); assert.equal(r.insights.length, 0);
  });
}

/* ── 서킷브레이커 ── */
{
  const DAY = 86_400_000;
  const now = Date.UTC(2026,7,20,6,0,0);   // KST 오후3시
  const be = (o: Partial<BreakerEntry> = {}): BreakerEntry => ({ ts:now, result:'loss', realizedUsdt:-10, ...o });

  ok('브레이커: 3연속 손절이면 blocked', () => {
    const rows = [be({ts:now-3*DAY}),be({ts:now-2*DAY}),be({ts:now-DAY})];
    const r = evaluateBreaker(rows, DEFAULT_LIMITS, now);
    assert.equal(r.status, 'blocked'); assert.equal(r.lossStreak, 3);
  });

  ok('브레이커: 2연속이면 warn(한도 3 기준)', () => {
    const rows = [be({ts:now-2*DAY}),be({ts:now-DAY})];
    assert.equal(evaluateBreaker(rows, DEFAULT_LIMITS, now).status, 'warn');
  });

  ok('브레이커: 승리가 스트릭을 끊는다', () => {
    const rows = [be({ts:now-3*DAY}),be({ts:now-2*DAY,result:'win',realizedUsdt:30}),be({ts:now-DAY})];
    const r = evaluateBreaker(rows, DEFAULT_LIMITS, now);
    assert.equal(r.lossStreak, 1); assert.equal(r.status, 'ok');
  });

  ok('브레이커: 일일 손실 한도 초과 시 blocked (오늘 KST 기준)', () => {
    const rows = [be({ts:now, realizedUsdt:-60})];   // 오늘 -60
    const r = evaluateBreaker(rows, { maxConsecutiveLosses:99, dailyLossLimitUsdt:50, weeklyLossLimitUsdt:null }, now);
    assert.equal(r.status, 'blocked');
    assert.equal(r.todayRealized, -60);
  });

  ok('브레이커: 어제 손실은 오늘 한도에 안 들어간다', () => {
    const rows = [be({ts:now-DAY, realizedUsdt:-100})];
    const r = evaluateBreaker(rows, { maxConsecutiveLosses:99, dailyLossLimitUsdt:50, weeklyLossLimitUsdt:null }, now);
    assert.equal(r.todayRealized, null);       // 오늘 실현 없음
    assert.equal(r.status, 'ok');
  });

  ok('브레이커: 한도 미설정이면 스트릭만 본다', () => {
    const rows = [be({ts:now, realizedUsdt:-9999})];
    assert.equal(evaluateBreaker(rows, DEFAULT_LIMITS, now).status, 'ok');  // 1연속 손절뿐
  });
}

console.log(`\n전체 ${passed}개 테스트 통과 ✅\n`);
