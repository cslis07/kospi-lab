/**
 * 발표 전후 분석(lib/eventStudy) — 시점 가격(직전 봉 종가)·최대 상승/하락·거래량·안정화·OI·펀딩·부분 데이터.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import { checkpoints, closeEndingAt, excursion, volumeChange, stabilization, oiChange, fundingAround, studyEvent, compareSummary, type Bar } from '../lib/eventStudy';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
const near = (a: number | null | undefined, b: number, eps = 1e-9) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const M = 60_000;
const T = Date.UTC(2026, 9, 14, 12, 30);

/** 1분봉: 발표 전 100 고정(변동폭 0.1), 발표 후 k분 종가 = 100 + k*0.1, 첫 10분 변동폭 크게 */
function m1Bars(): Bar[] {
  const out: Bar[] = [];
  for (let k = -65; k < 240; k++) {
    const c = k < 0 ? 100 : 100 + (k + 1) * 0.1;
    const wide = k >= 0 && k < 10;
    out.push({ ts: T + k * M, o: c, h: c + (wide ? 1 : 0.05), l: c - (wide ? 1 : 0.05), c, v: k < 0 ? 10 : k < 15 ? 40 : 10 });
  }
  return out;
}
function m5Bars(): Bar[] {
  const out: Bar[] = [];
  for (let k = -12; k < 288; k++) { const c = 100 + Math.max(0, k + 1) * 0.5; out.push({ ts: T + k * 5 * M, o: c, h: c + 0.2, l: c - 0.2, c, v: 50 }); }
  return out;
}

ok('발표 직전 = 발표 시각에 끝나는 봉의 종가(발표 후 체결 미포함)', () => {
  const m1 = m1Bars();
  assert.equal(closeEndingAt(m1, T, M), 100);
  assert.equal(closeEndingAt(m1, T + 5 * M, M), 100.5);
  assert.equal(closeEndingAt([], T, M), null);
});

ok('시점별 가격·직전 대비 % — 4시간 이내는 1분봉, 24시간은 5분봉', () => {
  const cps = checkpoints(T, m1Bars(), m5Bars());
  const g = (k: string) => cps.find((c) => c.key === k)!;
  assert.equal(g('pre').price, 100); near(g('pre').pctFromPre, 0);
  assert.equal(g('m60').price, 100);
  near(g('p5').pctFromPre, 0.5); near(g('p15').pctFromPre, 1.5); near(g('p60').pctFromPre, 6); near(g('p240').pctFromPre, 24);
  near(g('p1440').price, 100 + 288 * 0.5); // 5분봉 ts=T+1435 종가
});

ok('부분 데이터 — 봉이 없으면 null(보간 안 함)', () => {
  const short = m1Bars().filter((b) => b.ts < T + 30 * M);
  const cps = checkpoints(T, short, []);
  assert.equal(cps.find((c) => c.key === 'p60')!.price, null);
  assert.equal(cps.find((c) => c.key === 'p60')!.pctFromPre, null);
  assert.equal(cps.find((c) => c.key === 'p1440')!.price, null);
  assert.equal(checkpoints(T, [], []).every((c) => c.price == null), true);
});

ok('최대 상승·하락과 도달 시각', () => {
  const ex = excursion(T, m1Bars(), M, 240, 100)!;
  near(ex.maxUpPct, (124 + 0.05 - 100)); assert.equal(ex.maxUpAtMin, 239);
  near(ex.maxDownPct, (100.1 - 1 - 100)); assert.equal(ex.maxDownAtMin, 0);
  assert.equal(ex.coveredMin, 240);
  assert.equal(excursion(T, [], M, 240, 100), null);
  assert.equal(excursion(T, m1Bars(), M, 240, null), null);
});

ok('거래량 — 발표 후 15분 ÷ (발표 전 60분 ÷ 4), 60분 ÷ 60분', () => {
  const v = volumeChange(T, m1Bars());
  assert.equal(v.pre60, 600); assert.equal(v.post15, 600); near(v.ratio15, 4);
  assert.equal(v.post60, 600 + 45 * 10); near(v.ratio60, 1050 / 600);
  assert.equal(volumeChange(T, m1Bars().filter((b) => b.ts !== T - 30 * M)).pre60, null); // 한 봉 빠지면 계산 안 함
});

ok('안정화 시간 — 첫 10분 큰 변동 후 기준 1.5배 이하가 되는 첫 15분 창', () => {
  const s = stabilization(T, m1Bars())!;
  assert.ok(s.baselinePct > 0);
  // 변동폭 큰 봉(0~9분)이 창 15개 중 과반(8개 이상)이면 중앙값이 큼 → k=3부터 큰 봉 7개
  assert.equal(s.minutes, 3);
  assert.equal(stabilization(T, m1Bars().filter((b) => b.ts >= T - 20 * M)), null); // 기준 구간 부족
});

ok('OI — 발표 직전 대비 1·4·24시간 뒤(10분 넘게 빈 값이면 null)', () => {
  const oi = [] as { ts: number; oi: number }[];
  for (let k = -12; k <= 60; k++) oi.push({ ts: T + k * 5 * M, oi: 1000 + Math.max(0, k) * 2 });
  const r = oiChange(T, oi);
  assert.equal(r.pre, 1000); near(r.pct60, 2.4); near(r.pct240, 9.6); assert.equal(r.p1440, null);
});

ok('펀딩 — 직전 정산·이후 두 번', () => {
  const f = [0, 8, 16, 24].map((h) => ({ ts: Date.UTC(2026, 9, 14, h % 24, 0) + (h >= 24 ? 86_400_000 : 0), rate: h / 1e5 }));
  const r = fundingAround(T, f);
  assert.equal(r.before!.rate, 8 / 1e5); assert.deepEqual(r.after.map((x) => x.rate), [16 / 1e5, 24 / 1e5]);
});

ok('과거 사례 요약 — 시점별 평균·중앙값·표본(빈 값 제외)', () => {
  const a = studyEvent(T, m1Bars(), m5Bars()), b = studyEvent(T, m1Bars().filter((x) => x.ts < T + 10 * M), []);
  const s = compareSummary([a, b]);
  const p5 = s.find((x) => x.key === 'p5')!, p60 = s.find((x) => x.key === 'p60')!;
  assert.equal(p5.n, 2); near(p5.mean, 0.5);
  assert.equal(p60.n, 1); near(p60.median, 6);
  assert.equal(a.coverage.m1, 305);
});

console.log(`\neventStudy: ${passed} passed`);
