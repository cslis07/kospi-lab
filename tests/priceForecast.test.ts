import assert from 'node:assert/strict';
import { ols, buildForecasts, pickConsensus, parseAiAdjust, clampAdj, isPriceNews, latestRunFor, shiftYm, FRED_IDS, AI_ADJ_MAX, type SeriesMap, type Pt, type ForecastRun } from '../lib/priceForecast';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
console.log('priceForecast.ts');

ok('ols: y = 1 + 2a - 3b 를 그대로 복원', () => {
  const X = Array.from({ length: 30 }, (_, i) => [Math.sin(i), Math.cos(i * 1.7)]);
  const b = ols(X, X.map(([a, c]) => 1 + 2 * a - 3 * c))!;
  assert.ok(Math.abs(b[0] - 1) < 1e-8 && Math.abs(b[1] - 2) < 1e-8 && Math.abs(b[2] + 3) < 1e-8);
});
ok('ols: 풀 수 없으면 null(열이 전부 같은 값)', () => {
  assert.equal(ols(Array.from({ length: 20 }, () => [1, 1]), Array.from({ length: 20 }, (_, i) => i)), null);
});
ok('shiftYm: 해 넘김', () => { assert.equal(shiftYm('2026-01', -1), '2025-12'); assert.equal(shiftYm('2025-12', 1), '2026-01'); });

// 합성 자료: 휘발유 전월비가 CPI 전월비를 0.03배로 움직이고, 근원은 매달 0.25% 안팎
const months = Array.from({ length: 120 }, (_, i) => shiftYm('2016-01', i));
const gasMom = months.map((_, i) => 6 * Math.sin(i * 0.9) + 2 * Math.cos(i * 0.37));
const lvl = (moms: number[], start = 100) => { let v = start; return moms.map((m) => (v *= 1 + m / 100)); };
const mk = (vals: number[]): Pt[] => vals.map((v, i) => ({ date: `${months[i]}-01`, value: v }));
const coreMom = months.map((_, i) => 0.25 + 0.03 * Math.sin(i * 0.21));
const foodMom = months.map((_, i) => 0.2 + 0.05 * Math.cos(i * 0.6));
const cpiMom = months.map((_, i) => 0.2 + 0.03 * gasMom[i]);
const series: SeriesMap = {
  [FRED_IDS.cpi]: mk(lvl(cpiMom)).slice(0, -1), [FRED_IDS.cpiNsa]: mk(lvl(cpiMom)).slice(0, -1),
  [FRED_IDS.coreCpi]: mk(lvl(coreMom)).slice(0, -1), [FRED_IDS.foodCpi]: mk(lvl(foodMom)).slice(0, -1),
  [FRED_IDS.ppi]: mk(lvl(cpiMom)).slice(0, -1), [FRED_IDS.ppiNsa]: mk(lvl(cpiMom)).slice(0, -1), [FRED_IDS.corePpi]: mk(lvl(coreMom)).slice(0, -1),
  [FRED_IDS.gas]: mk(lvl(gasMom, 3)), [FRED_IDS.diesel]: mk(lvl(months.map((_, i) => 4 * Math.cos(i * 1.3)), 4)),
  [FRED_IDS.wti]: mk(lvl(months.map((_, i) => 5 * Math.sin(i * 2.1)), 70)), [FRED_IDS.natgas]: mk(lvl(months.map((_, i) => 3 * Math.cos(i)), 3)),
  [FRED_IDS.usd]: mk(lvl(months.map((_, i) => Math.sin(i * 0.5)), 100)),
  [FRED_IDS.bei]: mk(months.map((_, i) => 2.2 + 0.1 * Math.sin(i * 0.3))), [FRED_IDS.wage]: mk(lvl(months.map((_, i) => 0.3 + 0.05 * Math.sin(i)), 30)).slice(0, -1),
};
const target = months.at(-1)!;
const fc = buildForecasts(series, `${target}-15`);
const cpi = fc.find((t) => t.key === 'cpi')!;

ok('대상 월 = 마지막 발표 월의 다음 달, 진행 중 표시', () => {
  assert.equal(cpi.month, target);
  assert.equal(cpi.prevMonth, shiftYm(target, -1));
  assert.equal(cpi.partial, true);
});
ok('휘발유 관계를 학습해 대상 월 전월비를 맞힌다', () => {
  const truth = 0.2 + 0.03 * gasMom.at(-1)!;
  assert.ok(cpi.mom != null && Math.abs(cpi.mom - truth) < 0.02, `${cpi.mom} vs ${truth}`);
});
ok('평소 수준 + 요인 기여 합 = 예상치', () => {
  const sum = cpi.base! + cpi.drivers.reduce((s, d) => s + d.contrib, 0);
  assert.ok(Math.abs(sum - cpi.mom!) < 1e-6);
  assert.equal(cpi.drivers[0].key, 'gas'); // 가장 큰 요인
});
ok('과거 검증: 모델 오차가 직전 평균(나이브)보다 작다', () => {
  assert.ok(cpi.backtest.n > 20);
  assert.ok(cpi.backtest.maeModel! < cpi.backtest.maeNaive!);
});
ok('전년비: 지수를 이어 붙인 값', () => {
  const idx = lvl(cpiMom);
  const truth = (idx.at(-2)! * (1 + cpi.mom! / 100) / idx.at(-13)! - 1) * 100;
  assert.ok(Math.abs(cpi.yoy! - truth) < 1e-6);
});
ok('빈 달(미발표)이 있어도 계산된다', () => {
  const holed: SeriesMap = { ...series, [FRED_IDS.coreCpi]: series[FRED_IDS.coreCpi].filter((p) => !p.date.startsWith(shiftYm(target, -5))) };
  const c = buildForecasts(holed, `${target}-15`).find((t) => t.key === 'cpi')!;
  assert.ok(c.mom != null && Number.isFinite(c.mom));
});
ok('자료가 없으면 null(터지지 않음)', () => {
  const e = buildForecasts({}, '2026-11-11');
  assert.equal(e.length, 4);
  assert.ok(e.every((t) => t.mom == null && t.backtest.n === 0));
});

const events = [
  { date: '2026-11-13 13:30:00', country: 'US', event: 'Producer Price Index MoM (Oct)', actual: null, estimate: 0.4, previous: 1.3 },
  { date: '2026-11-13 13:30:00', country: 'US', event: 'PPI Ex Food, Energy and Trade MoM (Oct)', actual: null, estimate: 0.3, previous: 0.5 },
  { date: '2026-11-13 13:30:00', country: 'US', event: 'Core PPI MoM (Oct)', actual: null, estimate: 0.3, previous: 0.7 },
  { date: '2026-11-13 13:30:00', country: 'US', event: 'Producer Price Index YoY (Oct)', actual: null, estimate: 6.6, previous: 6.3 },
  { date: '2026-11-10 13:30:00', country: 'US', event: 'Inflation Rate MoM (Oct)', actual: 0.4, estimate: 0.3, previous: 0.6 },
  { date: '2026-11-10 13:30:00', country: 'US', event: 'Core Inflation Rate MoM (Oct)', actual: 0.3, estimate: 0.2, previous: 0.3 },
  { date: '2026-11-10 07:00:00', country: 'DE', event: 'Inflation Rate MoM (Oct)', actual: 0.1, estimate: 0.1, previous: 0.2 },
];
ok('시장 예상치: 이름·월·국가로 정확히 고른다', () => {
  const p = pickConsensus(events, 'ppi', '2026-10');
  assert.equal(p.mom?.estimate, 0.4); assert.equal(p.yoy?.estimate, 6.6);
  assert.equal(p.releaseAt, '2026-11-13T13:30:00Z');
  assert.equal(pickConsensus(events, 'corePpi', '2026-10').mom?.estimate, 0.3);
  const c = pickConsensus(events, 'cpi', '2026-10');
  assert.equal(c.mom?.estimate, 0.3); assert.equal(c.mom?.actual, 0.4);
  assert.equal(pickConsensus(events, 'coreCpi', '2026-10').mom?.estimate, 0.2);
});
ok('시장 예상치: 다른 달이면 없음', () => {
  const c = pickConsensus(events, 'cpi', '2026-11');
  assert.equal(c.mom, null); assert.equal(c.releaseAt, null);
});

ok('AI 보정: 한도 안으로 자르고 0.01 단위', () => {
  assert.equal(clampAdj(0.5), AI_ADJ_MAX); assert.equal(clampAdj(-3), -AI_ADJ_MAX);
  assert.equal(clampAdj(0.034), 0.03); assert.equal(clampAdj('x'), 0); assert.equal(clampAdj(undefined), 0);
});
ok('AI 응답 파싱: 앞뒤 군말·코드블록이 있어도 읽고, 이상한 값은 정리', () => {
  const t = '```json\n{"adjust":{"cpi":0.3,"coreCpi":"0.02","ppi":-0.05},"reasons":{"cpi":"관세"},"summary":"요약","articles":[{"title":"A","effect":"up","why":"w"},{"title":"","effect":"up"},{"title":"B","effect":"weird"}]}\n```';
  const p = parseAiAdjust(t)!;
  assert.deepEqual(p.adjust, { cpi: 0.1, coreCpi: 0.02, ppi: -0.05, corePpi: 0 });
  assert.equal(p.reasons.cpi, '관세'); assert.equal(p.reasons.ppi, undefined);
  assert.equal(p.articles.length, 2); assert.equal(p.articles[1].effect, 'neutral');
  assert.equal(parseAiAdjust('죄송합니다'), null); assert.equal(parseAiAdjust('{broken'), null);
});
ok('물가 기사 고르기', () => {
  assert.ok(isPriceNews('Fed Governor Waller says rate hike is possible'));
  assert.ok(isPriceNews('휘발유값 5주 연속 상승'));
  assert.ok(!isPriceNews('삼성전자 신제품 공개'));
});
ok('지표·월별 최신 실행', () => {
  const t = (month: string) => ({ month, model: 0.2, adj: 0, final: 0.2, consensus: null });
  const mkRun = (ranAt: number, m: string): ForecastRun => ({ ranAt, aiModel: null, targets: { cpi: t(m), coreCpi: t(m), ppi: t('2026-10'), corePpi: t('2026-10') }, summary: '', articles: [], newsCount: 0 });
  const runs = [mkRun(1, '2026-10'), mkRun(3, '2026-11'), mkRun(2, '2026-11')];
  assert.equal(latestRunFor(runs, 'cpi', '2026-11')?.ranAt, 3);
  assert.equal(latestRunFor(runs, 'cpi', '2026-10')?.ranAt, 1);
  assert.equal(latestRunFor(runs, 'cpi', '2026-12'), null);
});

console.log(`  ${passed} passed`);
