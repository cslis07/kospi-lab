import assert from 'node:assert/strict';
import {
  compareRows, forecastRows, categorize, topDrivers, pctFrac, pct, signPp,
  monthsEndingAt, sparkCompareRows, gasRanked, metrosByRent, avg,
  snapDrivers, truflationTrendRows, acctForecasters, usHighImpact, printFile, nfLink,
  priceRows, valueYearAgo, cartTotals,
  type CompareDaily, type Forecast, type PulseDriver, type StateRow, type MetroRow, type LatestSnapshot,
  type AcctPrint, type EconCalWindow, type GroceryItem,
} from '../lib/inflation';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

console.log('inflation (Nowflation 허브 가공)');

ok('compareRows: 월별 마지막 게이지 + 공식 발표치 병합', () => {
  const cd: CompareDaily = {
    dates: ['2026-07-01', '2026-07-31', '2026-08-15'],
    series: { gauge: { data: [3.1, 3.2, 3.3] } },
    prints: [{ print_month: '2026-07', actual: 3.0 }],
  };
  const r = compareRows(cd);
  assert.deepEqual(r, [
    { month: '2026-07', nowcast: 3.2, official: 3.0 }, // 7월 마지막=3.2
    { month: '2026-08', nowcast: 3.3, official: null },
  ]);
});

ok('compareRows: null·빈 입력 안전', () => {
  assert.deepEqual(compareRows(null), []);
  assert.deepEqual(compareRows({ dates: [], series: {}, prints: [] } as CompareDaily), []);
});

ok('forecastRows: 실측+밴드+공식 투영 병합·정렬', () => {
  const f: Forecast = {
    history: [['2026-08', 3.4]],
    forecast: [{ month: '2026-09', central: 3.6, low: 3.4, high: 3.8 }],
    official_projection: [{ month: '2026-09', yoy: 3.6 }],
  };
  const r = forecastRows(f);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { month: '2026-08', actual: 3.4, central: null, band: null, official: null });
  assert.deepEqual(r[1], { month: '2026-09', actual: null, central: 3.6, band: [3.4, 3.8], official: 3.6 });
});

ok('categorize: 식품·주거·연료·기타', () => {
  assert.equal(categorize('food_home'), '식품');
  assert.equal(categorize('food_away'), '식품');
  assert.equal(categorize('shelter_rent'), '주거');
  assert.equal(categorize('shelter_owned'), '주거');
  assert.equal(categorize('fuel'), '연료');
  assert.equal(categorize('nat_gas'), '연료');
  assert.equal(categorize('electricity'), '연료');
  assert.equal(categorize('used_vehicles'), '기타');
  assert.equal(categorize('apparel'), '기타');
});

ok('topDrivers: 기여 절대값 큰 순', () => {
  const ds: PulseDriver[] = [
    { component: 'a', label: 'A', weight: 0.1, yoy: 0.01, contribution_bps: 5 },
    { component: 'b', label: 'B', weight: 0.1, yoy: 0.4, contribution_bps: -130 },
    { component: 'c', label: 'C', weight: 0.1, yoy: 0.02, contribution_bps: 40 },
  ];
  assert.deepEqual(topDrivers(ds, 2).map((d) => d.component), ['b', 'c']);
  assert.equal(topDrivers(undefined).length, 0);
});

ok('포맷터: 분수/퍼센트/pp', () => {
  assert.equal(pctFrac(0.0346), '3.46%');
  assert.equal(pctFrac(-0.3666, 1), '-36.7%');
  assert.equal(pct(3.46), '3.46%');
  assert.equal(signPp(0.16), '+0.16%p');
  assert.equal(signPp(-0.028), '-0.03%p');
  assert.equal(pctFrac(null), '—');
  assert.equal(pct(undefined), '—');
});

ok('monthsEndingAt: 연도 경계 포함 오름차순', () => {
  assert.deepEqual(monthsEndingAt('2026-02', 4), ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.deepEqual(monthsEndingAt('2026-08', 1), ['2026-08']);
});

ok('sparkCompareRows: ours/bls 분수→% + 월 동기화 + null 유지', () => {
  const r = sparkCompareRows({ ours: [0.031, 0.029, 0.021], bls: [0.034, null, 0.0275] }, '2026-08');
  assert.deepEqual(r, [
    { month: '2026-06', nowcast: 3.1, official: 3.4 },
    { month: '2026-07', nowcast: 2.9, official: null },
    { month: '2026-08', nowcast: 2.1, official: 2.75 },
  ]);
  assert.deepEqual(sparkCompareRows(undefined, '2026-08'), []);
});

ok('gasRanked·metrosByRent: 내림차순·null 제외', () => {
  const st: StateRow[] = [
    { state: 'A', name: 'A', gas: 3.9, elec_cents: 16, elec_yoy: 0.03 },
    { state: 'B', name: 'B', gas: 5.0, elec_cents: 28, elec_yoy: 0.05 },
    { state: 'C', name: 'C', gas: null, elec_cents: null, elec_yoy: null },
  ];
  assert.deepEqual(gasRanked(st).map((s) => s.state), ['B', 'A']);
  const mt: MetroRow[] = [
    { metro: 'X', rent: 3409, yoy: 0.1 }, { metro: 'Y', rent: 3815, yoy: 0.07 }, { metro: 'Z', rent: null, yoy: null },
  ];
  assert.deepEqual(metrosByRent(mt).map((m) => m.metro), ['Y', 'X']);
});

ok('avg: null 제외 평균', () => {
  assert.equal(avg([3, 5, null]), 4);
  assert.equal(avg([null, undefined]), null);
});

ok('snapDrivers: 기여 절대값 내림차순·빈 입력 안전', () => {
  const s: LatestSnapshot = {
    pace_1m_drivers: [
      { component: 'a', label: 'A', contribution_pp: 0.05 },
      { component: 'b', label: 'B', contribution_pp: -0.27 },
      { component: 'c', label: 'C', contribution_pp: 0.1 },
    ],
  };
  assert.deepEqual(snapDrivers(s).map((d) => d.component), ['b', 'c', 'a']);
  assert.deepEqual(snapDrivers(null), []);
  assert.deepEqual(snapDrivers({}), []);
});

ok('truflationTrendRows: 최근 N개월 창 + gauge·truflation 정렬, null 안전', () => {
  const cd: CompareDaily = {
    dates: ['2024-01-01', '2025-06-01', '2026-10-01', '2026-10-07'],
    series: {
      gauge: { data: [2.0, 2.5, 3.4, 3.46] },
      truflation: { data: [1.9, 2.4, null, 2.88] },
    },
    prints: [],
  };
  const rows = truflationTrendRows(cd, 12); // 2026-10-07 기준 12개월 → 2025-10-07 이후만
  assert.deepEqual(rows.map((r) => r.date), ['2026-10-01', '2026-10-07']);
  assert.deepEqual(rows[0], { date: '2026-10-01', gauge: 3.4, truflation: null });
  assert.deepEqual(rows[1], { date: '2026-10-07', gauge: 3.46, truflation: 2.88 });
  assert.deepEqual(truflationTrendRows(null), []);
});

ok('acctForecasters: 절대오차 오름차순 + best 표시 + 표시명', () => {
  const p: AcctPrint = {
    print_month: '2026-08', actual: 3.4,
    forecasts: {
      fmc: { value: 3.23, err: -0.17, abs: 0.17 },
      street_consensus: { value: 3.4, err: 0, abs: 0 },
      cleveland_fed: { value: 3.38, err: -0.02, abs: 0.02 },
    },
    best: ['street_consensus'],
  };
  const r = acctForecasters(p);
  assert.deepEqual(r.map((x) => x.key), ['street_consensus', 'cleveland_fed', 'fmc']);
  assert.equal(r[0].best, true);
  assert.equal(r[0].name, '월가 컨센서스');
  assert.equal(r[2].name, 'Nowflation');
  assert.deepEqual(acctForecasters({ print_month: 'x', actual: 0, forecasts: {} }).length, 0);
});

ok('usHighImpact: 미국 High/Medium만·상한', () => {
  const w: EconCalWindow = {
    events: [
      { date: 'd1', country: 'US', event: 'CPI', actual: null, estimate: null, previous: null, impact: 'High' },
      { date: 'd2', country: 'US', event: 'x', actual: null, estimate: null, previous: null, impact: 'Low' },
      { date: 'd3', country: 'NZ', event: 'y', actual: null, estimate: null, previous: null, impact: 'High' },
      { date: 'd4', country: 'US', event: 'PCE', actual: null, estimate: null, previous: null, impact: 'Medium' },
    ],
  };
  assert.deepEqual(usHighImpact(w).map((e) => e.event), ['CPI', 'PCE']);
  assert.deepEqual(usHighImpact(w, 1).map((e) => e.event), ['CPI']);
  assert.deepEqual(usHighImpact(null), []);
});

ok('printFile: print_month → 파일명, 형식 외엔 null', () => {
  assert.equal(printFile('2026-09'), 'print_2026_09.json');
  assert.equal(printFile('2026-9'), null);
  assert.equal(printFile(undefined), null);
  assert.equal(printFile(''), null);
});

ok('nfLink: 상대→절대, 절대/빈값 보존', () => {
  assert.equal(nfLink('/articles/x'), 'https://nowflation.com/articles/x');
  assert.equal(nfLink('https://x.com/a'), 'https://x.com/a');
  assert.equal(nfLink(undefined), 'https://nowflation.com');
});

ok('priceRows: 최근 N개월·date/value, 빈 입력 안전', () => {
  const s: [string, number][] = [['2020-01-01', 1], ['2020-02-01', 2], ['2020-03-01', 3]];
  assert.deepEqual(priceRows(s, 2), [{ date: '2020-02-01', value: 2 }, { date: '2020-03-01', value: 3 }]);
  assert.deepEqual(priceRows(null), []);
});

ok('valueYearAgo: 13번째 뒤 값(12개월 전), 짧으면 null', () => {
  const s: [string, number][] = Array.from({ length: 13 }, (_, i) => [`m${i}`, i] as [string, number]);
  assert.equal(valueYearAgo(s), 0); // 길이 13 → s[0]
  assert.equal(valueYearAgo(s.slice(0, 12)), null);
});

ok('cartTotals: 수량>0 품목 합계·전년대비', () => {
  const mkSeries = (ya: number, now: number): [string, number][] => [...Array.from({ length: 12 }, (_, i) => [`m${i}`, ya] as [string, number]), ['now', now]];
  const items: GroceryItem[] = [
    { code: 'egg', label: 'Eggs', latest: { date: 'now', value: 3 }, series: mkSeries(2, 3) },
    { code: 'milk', label: 'Milk', latest: { date: 'now', value: 4 }, series: mkSeries(4, 4) },
  ];
  const r = cartTotals(items, { egg: 2, milk: 1 });
  assert.equal(r.now, 10); // 3*2 + 4*1
  assert.equal(r.yearAgo, 8); // 2*2 + 4*1
  assert.equal(Math.round((r.yoyPct ?? 0) * 100) / 100, 25); // (10-8)/8
  assert.equal(cartTotals(items, {}).now, 0);
});

console.log(`inflation: ${passed} passed\n`);
