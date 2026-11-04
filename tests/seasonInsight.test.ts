/**
 * 계절성 쉬운 해석(lib/seasonInsight) + 해석용 통계 필드(lib/seasonality up·down·flat·worst·best).
 * 표본 구간(0·1·3·5·9·12·19·20·30), 평균·중앙값 부호 조합, 0% 수익률, 짝수·홀수 중앙값, 이상치, 진행 중인 달 제외, 금지 표현.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import { seasonality } from '../lib/seasonality';
import { buildSeasonalityInsight, sampleCaution } from '../lib/seasonInsight';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

/** 11월 수익률 목록(연도 오름차순) → 월 종가 맵(10월·11월만) */
function novCloses(rets: number[], startYear = 2000): Map<string, number> {
  const m = new Map<string, number>();
  rets.forEach((r, i) => { const y = startYear + i; m.set(`${y}-10`, 100); m.set(`${y}-11`, 100 * (1 + r / 100)); });
  return m;
}
const NOW = new Date('2040-06-15T00:00:00Z');
const nov = (rets: number[], y0 = 2000) => seasonality(novCloses(rets, y0), NOW).stats[10];
const BANNED = /확률 \d|상승 확정|반드시|매수|매도 추천|강한 신호|승률|MDD|최대낙폭/;
const check = (t: string) => assert.ok(!BANNED.test(t), `금지 표현: ${t}`);

ok('해석용 필드 — 0% 는 상승·하락 아님, 최저·최고와 연도, 기존 평균·중앙값·상승 확률 불변', () => {
  const s = nov([5, 0, -3, 10, -36.4]);
  assert.equal(s.n, 5); assert.equal(s.up, 2); assert.equal(s.down, 2); assert.equal(s.flat, 1);
  assert.deepEqual(s.worst, { pct: -36.4, year: 2004 }); assert.deepEqual(s.best, { pct: 10, year: 2003 });
  assert.equal(s.upPct, 40);
  assert.equal(s.median, 0);                                  // 홀수 표본 — 가운데 값
  assert.equal(nov([1, 3]).median, 2);                       // 짝수 표본 — 가운데 두 값 평균
  assert.equal(nov([-1, -2, -3]).up, 0);                     // 음수만
});

ok('진행 중인 달은 해석 통계에서도 빠진다', () => {
  const m = novCloses([5, 6]);
  m.set('2040-10', 100); m.set('2040-11', 50);               // 진행 중인 11월(−50%)
  const s = seasonality(m, new Date('2040-11-15T00:00:00Z')).stats[10];
  assert.equal(s.n, 2); assert.equal(s.down, 0); assert.deepEqual(s.worst, { pct: 5, year: 2000 });
});

ok('표본 구간별 안내 — 0·1·3·5·9·12·19·20·30', () => {
  const want: [number, string][] = [[0, '분석 가능한 과거 기록이 없습니다.'], [1, '너무 적어'], [3, '너무 적어'], [5, '각별한 주의'], [9, '각별한 주의'],
    [12, '제한적'], [19, '제한적'], [20, '보장하지 않습니다'], [30, '보장하지 않습니다']];
  for (const [n, frag] of want) assert.ok(sampleCaution(n).includes(frag), `${n}: ${sampleCaution(n)}`);
  for (const n of [1, 3, 5, 9, 12, 19, 20, 30]) {
    const rets = Array.from({ length: n }, (_, i) => (i % 3 === 0 ? -2 : 3));
    const ins = buildSeasonalityInsight('테스트', nov(rets));
    assert.ok(ins.shortText.includes(`과거 ${n}회 중`)); assert.equal(ins.isHistoricalOnly, true); check(ins.shortText);
    // 10회 미만은 화면 문장에, 10회 이상은 툴팁에 표본 안내 — 어느 쪽이든 빠지지 않는다
    assert.ok((n < 10 ? ins.shortText : ins.riskDetail).includes(sampleCaution(n)), `${n}`);
  }
  const none = buildSeasonalityInsight('테스트', { month: 11, n: 0, avg: null, median: null, upPct: null });
  assert.equal(none.shortText, '테스트 11월: 분석 가능한 과거 기록이 없습니다.');
  assert.equal(buildSeasonalityInsight('테스트', null).shortText, '테스트 ?월: 분석 가능한 과거 기록이 없습니다.');
});

ok('표본 1~4개는 100% 여도 관계 해석 없이 표본 부족부터', () => {
  const ins = buildSeasonalityInsight('비트코인', nov([20, 30]));
  assert.ok(ins.shortText.includes('2회 중 2회 상승(100%)'));
  assert.ok(ins.shortText.includes('너무 적어 패턴을 판단할 수 없습니다'));
  assert.ok(!ins.shortText.includes('평균'));
  check(ins.shortText);
});

ok('평균 +·중앙값 − → 일부 큰 상승 영향 가능(상승 유리라고 하지 않음) — 코스피 11월 형태', () => {
  const s = nov([-4.4, -3.92, 11.3, 7.8, -4.43, 14.3, 0.22, 3.31, -1.86, -1.23, -1.85, 0.83, 0.73, 1.09, -3.22, 1.15, -1.59, -3.32, -7.69]);
  assert.equal(s.n, 19); assert.equal(s.up, 9);
  const ins = buildSeasonalityInsight('코스피', s);
  assert.ok(ins.shortText.startsWith('코스피 11월: 과거 19회 중 9회 상승(47%).'), ins.shortText);
  assert.ok(ins.shortText.includes('평균 +0.4%지만 중앙값은 −1.2%라 일부 큰 상승의 영향을 받았을 수 있습니다'));
  assert.ok(!ins.shortText.includes('제한적'), '10회 이상은 표본 안내를 툴팁으로');
  assert.ok(ins.sampleCaution.includes('제한적'));
  assert.ok(!/유리|오를/.test(ins.shortText)); check(ins.shortText);
  assert.ok(ins.riskDetail.startsWith('참고할 기록은 있으나 미래 예측 근거로는 제한적입니다. 하락 10회, 최저 −7.7%(2018년)'), ins.riskDetail);
});

ok('평균·중앙값 모두 + 이고 상승 비율 50% 이상 → 하락한 해도 함께 — 비트코인 11월 형태', () => {
  const s = nov([11.74, 20.1, 6.38, 58.21, -36.41, -17.72, 42.41, -7.03, -16.23, 8.78, 37.36, -17.49], 2014);
  const ins = buildSeasonalityInsight('비트코인', s, { btc: true });
  assert.ok(ins.shortText.startsWith('비트코인 11월: 과거 12회 중 7회 상승(58%).'), ins.shortText);
  assert.ok(ins.shortText.includes('하락한 해도 5회 있었습니다'));
  assert.ok(ins.riskDetail.includes('최저 −36.4%(2018년)'), ins.riskDetail);
  assert.ok(ins.riskDetail.includes('레버리지 청산'));
  check(ins.shortText); check(ins.riskDetail);
});

ok('평균 −·중앙값 + → 일부 큰 하락 영향 가능, 둘 다 − → 하락이 더 많았지만 올해 하락을 뜻하지 않음, 혼재 → 단정 어려움', () => {
  const a = buildSeasonalityInsight('X', nov([2, 3, 1, -40, 2]));
  assert.ok(a.shortText.includes('일부 큰 하락의 영향을 받았을 수 있습니다'), a.shortText);
  const b = buildSeasonalityInsight('X', nov([-2, -3, 1, -1, -4]));
  assert.ok(b.shortText.includes('하락한 해가 더 많았지만 올해 하락을 뜻하지 않습니다'), b.shortText);
  const c = buildSeasonalityInsight('X', nov([5, 4, -1, -1, -1, 3]));         // 평균·중앙값 + 인데 상승 50%
  assert.ok(c.shortText.includes('상승한 해가 조금 더 많았지만') || c.shortText.includes('단정하기 어렵습니다'));
  const d = buildSeasonalityInsight('X', nov([10, 0, 0, -1, 2]));             // 평균 + 이지만 중앙값 0(보합 다수)
  assert.ok(d.shortText.includes('단정하기 어렵습니다'), d.shortText);
  const e = buildSeasonalityInsight('X', nov([0.01, -0.02, 0.02, -0.01, 0.0]));  // 거의 0
  assert.ok(e.shortText.includes('단정하기 어렵습니다'), e.shortText);
  for (const t of [a, b, c, d, e]) check(t.shortText);
});

ok('중복값·큰 이상치에도 계산 안정', () => {
  const s = nov([3, 3, 3, 3, 300]);
  assert.equal(s.median, 3); assert.equal(s.up, 5); assert.deepEqual(s.best, { pct: 300, year: 2004 });
  check(buildSeasonalityInsight('X', s).shortText);
});

console.log(`seasonInsight: ${passed} passed`);
