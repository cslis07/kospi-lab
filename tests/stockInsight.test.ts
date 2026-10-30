/**
 * 종목 상세 '투자 지표·목표주가·동종업계·리포트' 파서(lib/stockInsight) — 네이버 integration 형식 → 화면값.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import { parseInsight, numOf, opinionLabel, upsidePct, parseOverseasInsight, reutersCandidates } from '../lib/stockInsight';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

const sample = {
  totalInfos: [
    { code: 'openPrice', key: '시가', value: '223,000' },
    { code: 'per', key: 'PER', value: '10.00배' },
    { code: 'cnsPer', key: '추정PER', value: 'N/A' },
    { code: 'pbr', key: 'PBR', value: '2.59배' },
    { code: 'foreignRate', key: '외인소진율', value: '46.17%' },
    { code: 'dividendYieldRatio', key: '배당수익률', value: '-' },
  ],
  consensusInfo: { createDate: '2026-10-29', recommMean: '4.00', priceTargetMean: '495,227' },
  industryCompareInfo: [
    { itemCode: '000660', stockName: 'SK하이닉스', closePrice: '1,418,000', fluctuationsRatio: '-7.08', marketValue: '1,035,838,173', stockExchangeType: { nameKor: '코스피' } },
    { itemCode: 'bad', stockName: 'x', closePrice: '1' },
  ],
  researches: [{ id: 97383, bnm: '미래에셋증권', tit: '제목', wdt: '20261030' }, { id: 1 }],
};

ok('숫자 파싱 — 쉼표·단위·부호', () => {
  assert.equal(numOf('1,234원'), 1234);
  assert.equal(numOf('-7.08'), -7.08);
  assert.equal(numOf('N/A'), null);
  assert.equal(numOf(undefined), null);
});

ok('지표는 정해진 순서로, 시세·N/A·빈 값은 제외', () => {
  const r = parseInsight(sample);
  assert.deepEqual(r.metrics.map((m) => m.key), ['per', 'pbr', 'foreignRate']);
});

ok('컨센서스·괴리율·투자의견', () => {
  const r = parseInsight(sample);
  assert.equal(r.consensus?.targetMean, 495227);
  assert.equal(r.consensus?.recommMean, 4);
  assert.equal(opinionLabel(4), '매수');
  assert.equal(opinionLabel(3), '중립');
  assert.equal(opinionLabel(null), null);
  assert.ok(Math.abs((upsidePct(495227, 232000) ?? 0) - 113.46) < 0.01);
  assert.equal(upsidePct(null, 1000), null);
});

ok('동종업계 — 코드 형식 검사·시총 백만원→억', () => {
  const r = parseInsight(sample);
  assert.equal(r.peers.length, 1);
  assert.equal(r.peers[0].marketCapEok, 10358382);
  assert.equal(r.peers[0].market, '코스피');
});

ok('리포트 — 제목 없는 항목 제외·날짜·주소', () => {
  const r = parseInsight(sample);
  assert.equal(r.reports.length, 1);
  assert.equal(r.reports[0].date, '2026-10-30');
  assert.match(r.reports[0].url, /research\/company\/97383$/);
});

ok('형식이 다르면 빈 값(throw 없음)', () => {
  const r = parseInsight(null);
  assert.deepEqual(r, { metrics: [], consensus: null, peers: [], reports: [] });
});

ok('해외 — 목표가 범위·개요·동종업계(시총 원값)', () => {
  const r = parseOverseasInsight({
    corporateOverview: ' 애플은 ... ',
    consensusInfo: { createDate: '2026-10-15', recommMean: '3.70', priceTargetMean: '326.61', priceTargetHigh: '405.00', priceTargetLow: '215.00' },
    industryCompareInfo: { globalStocks: [{ symbolCode: 'DELL', stockName: '델테크놀로지', closePrice: '475.51', fluctuationsRatio: '0.00', marketValueRaw: '302335320752', dividendYield: '0.53' }, { symbolCode: null, closePrice: '1' }, { symbolCode: '6758', stockName: '소니 그룹', closePrice: '3958', currencyType: { code: 'JPY' } }] },
  });
  assert.equal(r.consensus?.targetHigh, 405);
  assert.equal(r.consensus?.targetLow, 215);
  assert.equal(r.overview, '애플은 ...');
  assert.equal(r.peers.length, 1);
  assert.equal(r.peers[0].marketCapUsd, 302335320752);
  assert.deepEqual(parseOverseasInsight(undefined), { consensus: null, overview: null, peers: [] });
});

ok('해외 — 로이터 코드 후보(뉴욕 그대로 먼저, 나스닥 .O)', () => {
  assert.deepEqual(reutersCandidates('aapl').slice(0, 2), ['AAPL', 'AAPL.O']);
  assert.deepEqual(reutersCandidates('$$'), []);
});

console.log(`\nstockInsight: ${passed} passed`);
