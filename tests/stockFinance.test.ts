/**
 * 종목 실적 추이·뉴스·공시 파서(lib/stockFinance) — 네이버 finance(국내·해외)·news·disclosure 형식 → 화면값.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import { parseFinance, yoy, parseStockNews, parseDisclosures } from '../lib/stockFinance';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

const kr = { financeInfo: {
  trTitleList: [{ key: '202509', title: '2025.09.', isConsensus: 'N' }, { key: '202609', title: '2026.09.', isConsensus: 'Y' }],
  rowList: [
    { title: '매출액', columns: { '202509': { value: '860,617' }, '202609': { value: '2,007,657' } } },
    { title: '영업이익', columns: { '202509': { value: '121,661' }, '202609': { value: '1,069,435' } } },
    { title: '영업이익률', columns: { '202509': { value: '14.14' }, '202609': { value: '53.27' } } },
    { title: 'ROE', columns: { '202509': { value: '8.37' }, '202609': { value: '-' } } },
  ],
} };

ok('국내 — 억원·추정치 표시·라벨·없는 값 null', () => {
  const f = parseFinance(kr, false);
  assert.equal(f.unit, '억원');
  assert.deepEqual(f.periods.map((p) => [p.label, p.estimate]), [['25.09', false], ['26.09', true]]);
  assert.equal(f.periods[1].op, 1069435);
  assert.equal(f.periods[1].roe, null);
  assert.equal(f.periods[0].opMargin, 14.14);
});

ok('해외 — USD 백만·EBIT·이익률 계산·연간 라벨', () => {
  const f = parseFinance({ unit: 'USD(백만)', trTitleList: [{ key: '2026.06.27', title: '2026.06.27', isConsensus: 'N' }],
    rowList: [{ title: '매출액', columns: { '2026.06.27': { value: '109,417.00' } } }, { title: 'EBIT', columns: { '2026.06.27': { value: '35,695.00' } } }] }, true);
  assert.equal(f.unit, 'USD 백만');
  assert.equal(f.periods[0].label, '2026');
  assert.equal(f.periods[0].op, 35695);
  assert.equal(f.periods[0].opMargin, 32.62);
});

ok('형식이 다르면 빈 목록', () => {
  assert.deepEqual(parseFinance(null, false).periods, []);
  assert.deepEqual(parseFinance({ financeInfo: {} }, true).periods, []);
});

ok('전년 같은 분기 대비 — 4칸 전, 이전 값이 0 이하면 null', () => {
  const ps = [10, 20, 30, 40, 15, -5].map((op, i) => ({ key: String(i), label: '', estimate: false, revenue: 1, op, net: null, opMargin: null, eps: null, roe: null }));
  assert.equal(yoy(ps, 4, false), 50);
  assert.equal(yoy(ps, 3, false), null);
  assert.equal(yoy(ps, 1, true), 100);
  ps[1].op = 0;
  assert.equal(yoy(ps, 5, false), null);
});

ok('뉴스 — 묶음마다 첫 기사, https 링크만, 중복 제거, 시각 형식', () => {
  const n = parseStockNews([
    { items: [{ id: 'a', titleFull: '제목A', officeName: '조선비즈', datetime: '202610301652', mobileNewsUrl: 'https://n.news.naver.com/a' }, { id: 'b', title: '둘째', mobileNewsUrl: 'https://x' }] },
    { items: [{ id: 'c', title: '같은 링크', mobileNewsUrl: 'https://n.news.naver.com/a' }] },
    { items: [{ id: 'd', title: '위험', mobileNewsUrl: 'javascript:alert(1)' }] },
  ]);
  assert.equal(n.length, 1);
  assert.equal(n[0].at, '2026-10-30 16:52');
  assert.deepEqual(parseStockNews({}), []);
});

ok('공시 — 링크 조립·시각', () => {
  const d = parseDisclosures([{ disclosureId: 171920191, title: ' 기타 경영사항 ', datetime: '2026-10-29T06:52:29' }, { title: 'id 없음' }], '005930');
  assert.equal(d.length, 1);
  assert.equal(d[0].title, '기타 경영사항');
  assert.equal(d[0].at, '2026-10-29 06:52');
  assert.equal(d[0].url, 'https://m.stock.naver.com/domestic/stock/005930/disclosure/171920191');
});

console.log(`\nstockFinance: ${passed} passed`);
