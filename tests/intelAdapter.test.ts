/**
 * 코인 분석 응답 → 의사결정 엔진 연결(lib/intel/fromAnalysis·trigger·bridgeEntryRec).
 * BTCUSDT·ETHUSDT·SOLUSDT 3개 + 거래 보류 + 트리거 규칙. 가격대는 11-12 ETH 화면 배치를 코인별 가격 수준으로 옮긴 합성 입력.
 */
import assert from 'node:assert/strict';
import { recommendEntry, type RecInput, type EntryRec } from '../lib/entryRec';
import { buildDecision, buildObservations, macroAvailableAt, type AnalysisSnapshot, type DecisionSettings } from '../lib/intel/fromAnalysis';
import { zoneTrigger, closedBars, type Candle } from '../lib/intel/trigger';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

const NOW = Date.parse('2026-11-13T03:07:00Z');
const ST: DecisionSettings = { equityUsd: 1000, riskPerTradePct: 0.5, maxLeverage: 10, makerFeePct: 0.02, takerFeePct: 0.06, slippagePct: 0.05, holdHours: 8, minNetRR: 1.5, eventPreMin: 60, eventPostMin: 30 };

/** ETH 2,052.5 배치를 k 배로 옮긴 entryRec 입력 */
function recInput(k: number, ctx: Partial<RecInput['ctx']> = {}): RecInput {
  const p = (x: number) => x * k;
  return {
    price: p(2052.5), atr15: p(6), atr1h: p(14),
    zones: [
      { price: p(2116.7), touches: 3, kind: 'resistance' }, { price: p(2087.1), touches: 4, kind: 'resistance' },
      { price: p(2068.1), touches: 10, kind: 'resistance' }, { price: p(2054.7), touches: 4, kind: 'resistance' },
      { price: p(2046.0), touches: 6, kind: 'support' }, { price: p(2040.5), touches: 3, kind: 'support' },
    ],
    high24h: p(2103), low24h: p(2033.9),
    fib: { direction: 'down', r382: p(2053.4), r50: p(2055.6), r618: p(2057.8), e1272: p(2041.1), e1618: p(2034.6) },
    smc: null,
    ma: [{ label: '1H EMA20', value: p(2066), weight: 1.5 }, { label: '15m EMA20', value: p(2050), weight: 1 }],
    bb: [{ label: '1H 볼린저', lower: p(2031), upper: p(2072), weight: 1.5 }],
    walls: { bid: p(2040), ask: p(2069) },
    ctx: { engineDir: 'short', h4: 'down', d1: 'down', newsPos: 0, newsNeg: 0, fundingPct: 0.01, lsRatio: 1.4, fearGreed: 30, macroBias: 'short', takerRatio: 0.95, eventHours: null, eventTitle: null, ...ctx },
  };
}

const bear: Omit<AnalysisSnapshot, 'symbol' | 'price' | 'm15Candles'> = {
  updatedAt: NOW - 60_000,
  h1: { structure: '하락', emaAlign: '역배열', priceVsEma20: 'below' },
  m15: { structure: '하락', emaAlign: '역배열', priceVsEma20: 'below' },
  regime: { h4: 'down', d1: 'down' },
  macro: { bias: 'short', strength: '보통', asOf: ['2026-11-12', '2026-11-12'] },
  funding: { ratePct: 0.01, intervalH: 8 }, lsRatio: 1.4, takerRatio: 0.85, event: null,
};

/** 마지막 닫힌 15분봉이 숏 존에 닿고 음봉·윗꼬리로 마감 + 진행 중인 봉 하나 */
function shortTriggerBars(rec: EntryRec): Candle[] {
  const z = rec.short!;
  const lastOpen = Math.floor(NOW / 900_000) * 900_000; // 진행 중인 봉 시작
  const prev = lastOpen - 900_000;
  const body = (z.zoneHigh - z.zoneLow) * 0.3;
  const o = z.zoneLow + body, c = z.zoneLow;
  return [
    { ts: prev - 900_000, o: c - body, h: c, l: c - 2 * body, c: c - body / 2 },
    { ts: prev, o, h: z.zoneHigh, l: c - body * 0.2, c },
    { ts: lastOpen, o: c, h: c + body, l: c - body, c: c + body / 2 },
  ];
}

const snap = (symbol: string, rec: EntryRec, price: number, extra: Partial<AnalysisSnapshot> = {}): AnalysisSnapshot =>
  ({ ...bear, symbol, price, m15Candles: shortTriggerBars(rec), ...extra });

function checkPrices(out: ReturnType<typeof buildDecision>['output'], rec: EntryRec) {
  // 엔진은 새 가격을 만들지 않는다 — 후보 가격 = entryRec 가격
  for (const e of out.evaluated) {
    const r = rec[e.side]!;
    assert.deepEqual([e.entry, e.zoneLow, e.zoneHigh, e.stop, e.target1, e.target2], [r.entry, r.zoneLow, r.zoneHigh, r.stop, r.target1, r.target2]);
  }
}

console.log('코인 3종');
ok('BTCUSDT — 하락 배경·숏 트리거 확인이어도 손절폭 0.24%면 비용 반영 손익비 미달 → 후보 없음', () => {
  const k = 91_000 / 2052.5;
  const rec = recommendEntry(recInput(k));
  const r = buildDecision(snap('BTCUSDT', rec, 2052.5 * k), rec, NOW, ST);
  checkPrices(r.output, rec);
  assert.equal(r.output.bias, 'SHORT_CONTEXT');
  const s = r.output.evaluated.find((e) => e.side === 'short')!;
  assert.equal(s.triggerConfirmed, true);
  // 비용 전 2.83 → 수수료 8bp·슬리피지 5bp·펀딩 1bp 반영 1.43
  assert.ok(rec.short!.rr1 > 2.5 && s.rr1Net! < 1.6);
  assert.ok(s.issues.includes('비용 반영 1차 손익비 부족'));
  assert.equal(r.output.status, 'NO_SETUP');
});
ok('BTCUSDT — 같은 후보라도 비용을 낮게 가정하면 조건 충족(실험), 손실은 자본×위험% 안', () => {
  const k = 91_000 / 2052.5;
  const rec = recommendEntry(recInput(k));
  const cheap = { ...ST, makerFeePct: 0, takerFeePct: 0.02, slippagePct: 0 };
  const r = buildDecision(snap('BTCUSDT', rec, 2052.5 * k, { funding: { ratePct: 0, intervalH: 8 } }), rec, NOW, cheap);
  assert.equal(r.output.status, 'READY');
  assert.equal(r.output.selected?.side, 'short');
  assert.ok(r.output.selected!.rr1Net! >= 1.6);
  assert.ok(r.output.selected!.modeledMaxLossUsd! <= 5.01); // 1,000 × 0.5%
});
ok('ETHUSDT — 같은 배경, 트리거 없음(닫힌 봉이 존 밖) → 대기', () => {
  const rec = recommendEntry(recInput(1));
  const far: Candle[] = [{ ts: NOW - 1_800_000, o: 2050, h: 2052, l: 2048, c: 2049 }];
  const r = buildDecision(snap('ETHUSDT', rec, 2052.5, { m15Candles: far }), rec, NOW, ST);
  checkPrices(r.output, rec);
  assert.equal(r.output.status, 'WATCH');
  assert.equal(r.output.selected?.triggerConfirmed, false);
});
ok('SOLUSDT — 거시 자료를 못 받으면 거래 보류(가격 후보는 참고만)', () => {
  const k = 140 / 2052.5;
  const rec = recommendEntry(recInput(k));
  const r = buildDecision(snap('SOLUSDT', rec, 2052.5 * k, { macro: null }), rec, NOW, ST);
  checkPrices(r.output, rec);
  assert.equal(r.output.status, 'BLOCKED');
  assert.ok(r.output.blocks.some((b) => b.includes('거시경제 입력 누락')));
  assert.ok(r.missing.some((m) => m.startsWith('거시')));
});

console.log('거래 보류');
ok('CPI 20분 전이면 트리거가 확인돼도 보류', () => {
  const k = 91_000 / 2052.5;
  const rec = recommendEntry(recInput(k));
  const r = buildDecision(snap('BTCUSDT', rec, 2052.5 * k, { event: { title: '미국 CPI', hoursUntil: 21 / 60 } }), rec, NOW, ST);
  assert.equal(r.output.status, 'BLOCKED');
  assert.ok(r.output.blocks.some((b) => b.includes('미국 CPI')));
});
ok('분석이 2시간 지난 화면(시세 60분 유효)이면 기술 입력 만료 → 보류', () => {
  const k = 91_000 / 2052.5;
  const rec = recommendEntry(recInput(k));
  const r = buildDecision(snap('BTCUSDT', rec, 2052.5 * k), rec, NOW + 2 * 3_600_000, ST);
  assert.equal(r.output.status, 'BLOCKED');
  assert.ok(r.output.staleIds.includes('tech-1h'));
});
ok('비용(펀딩 0.1%·8시간)이 커지면 순손익비가 줄어든다', () => {
  const k = 91_000 / 2052.5;
  const rec = recommendEntry(recInput(k));
  const a = buildDecision(snap('BTCUSDT', rec, 2052.5 * k), rec, NOW, ST);
  const b = buildDecision(snap('BTCUSDT', rec, 2052.5 * k, { funding: { ratePct: 0.1, intervalH: 8 } }), rec, NOW, ST);
  assert.ok(b.costs.fundingBps > a.costs.fundingBps);
  const rr = (x: typeof a) => x.output.evaluated.find((e) => e.side === 'short')!.rr1Net!;
  assert.ok(rr(b) < rr(a));
});

console.log('트리거·관측값');
ok('진행 중인 봉은 트리거에 쓰지 않는다', () => {
  const bars: Candle[] = [{ ts: NOW - 300_000, o: 10, h: 11, l: 9, c: 10.5 }];
  assert.equal(closedBars(bars, NOW).length, 0);
  assert.equal(zoneTrigger(bars, NOW, 'long', { zoneLow: 9.5, zoneHigh: 10, stop: 9 }).confirmed, false);
});
ok('롱: 존 터치 후 양봉·아래꼬리 마감이면 확인, 꼬리 짧거나 손절선 아래 마감이면 아님', () => {
  const ts = NOW - 1_800_000;
  const zone = { zoneLow: 99, zoneHigh: 100, stop: 98 };
  assert.equal(zoneTrigger([{ ts, o: 99.5, h: 100.4, l: 98.9, c: 100.2 }], NOW, 'long', zone).confirmed, true);
  assert.equal(zoneTrigger([{ ts, o: 99.2, h: 100.4, l: 99.1, c: 100.2 }], NOW, 'long', zone).confirmed, false);   // 꼬리 짧음
  assert.equal(zoneTrigger([{ ts, o: 97, h: 97.8, l: 96, c: 97.5 }], NOW, 'long', zone).confirmed, false);         // 손절선 아래
  assert.equal(zoneTrigger([], NOW, 'long', zone).confirmed, false);
});
ok('관측값: 상위 추세·1H·15m·거시·펀딩·롱숏·체결 — 받은 값만, 출처·시각 포함', () => {
  const o = buildObservations({ ...bear, symbol: 'ETHUSDT', price: 2052.5, m15Candles: [] });
  assert.deepEqual(o.map((x) => x.id), ['tech-htf', 'tech-1h', 'tech-15m', 'macro-rates-dollar', 'deriv-funding', 'deriv-ls', 'deriv-taker']);
  assert.ok(o.every((x) => x.source && Number.isFinite(Date.parse(x.availableAt))));
  assert.equal(o.find((x) => x.id === 'deriv-taker')!.direction, -1);
  const none = buildObservations({ ...bear, symbol: 'ETHUSDT', price: 2052.5, m15Candles: [], regime: null, macro: null, funding: null, lsRatio: null, takerRatio: null });
  assert.deepEqual(none.map((x) => x.id), ['tech-1h', 'tech-15m']);
});
ok('거시 공개 시각: 날짜만 있으면 그날 0시(UTC), 없으면 수집 시각', () => {
  assert.equal(macroAvailableAt(['2026-11-12', '2026-11-11'], 0), '2026-11-11T00:00:00.000Z');
  assert.equal(macroAvailableAt([null], Date.parse('2026-11-13T00:00:00Z')), '2026-11-13T00:00:00.000Z');
});

console.log(`\nintelAdapter: ${passed} passed`);
