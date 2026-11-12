import assert from 'node:assert/strict';
import { nextFomc, seriesCard, naverCard, type Pt } from '../lib/coinEnvLive';
import { fngLabel, fngBand, fngCompare } from '../lib/fearGreed';

let passed = 0;
function ok(name: string, fn: () => void) { fn(); passed++; console.log(`ok - ${name}`); }

ok('공포·탐욕 구간 이름', () => {
  // 0~25 극단적 공포 · 26~45 공포 · 46~55 중립 · 56~75 탐욕 · 76~100 극단적 탐욕
  assert.deepEqual([0, 25, 26, 45, 46, 55, 56, 75, 76, 100].map(fngLabel),
    ['극단적 공포', '극단적 공포', '공포', '공포', '중립', '중립', '탐욕', '탐욕', '극단적 탐욕', '극단적 탐욕']);
  assert.equal(fngBand(-5).label, '극단적 공포');
  assert.equal(fngBand(120).label, '극단적 탐욕');
});

ok('공포·탐욕 비교: 전일·1주·1개월·1년 전 — 자료가 없는 기간은 뺀다', () => {
  const day = (i: number) => new Date(Date.parse('2026-11-12T00:00:00Z') - i * 86_400_000).toISOString().slice(0, 10);
  const full = Array.from({ length: 400 }, (_, i) => ({ date: day(399 - i), value: (399 - i) % 100 })); // 값 = 며칠 전인지(100 으로 나눈 나머지)
  assert.deepEqual(fngCompare(full), [{ label: '전일', value: 1 }, { label: '1주 전', value: 7 }, { label: '1개월 전', value: 30 }, { label: '1년 전', value: 65 }]);
  assert.deepEqual(fngCompare(full.slice(-20)).map((r) => r.label), ['전일', '1주 전']);
  // 그 날짜가 빠져 있으면 그 이전 가장 가까운 날
  const gap = full.filter((p) => p.date !== day(7));
  assert.equal(fngCompare(gap)[1].value, 8);
  assert.deepEqual(fngCompare([]), []);
});

ok('다음 FOMC: 오늘 포함 가장 가까운 결정일과 남은 일수', () => {
  const dates = ['2026-10-28', '2026-12-09', '2027-01-27'];
  assert.deepEqual(nextFomc(Date.parse('2026-11-12T03:00:00Z'), dates), { date: '2026-12-09', dday: 27 });
  assert.deepEqual(nextFomc(Date.parse('2026-12-09T23:00:00Z'), dates), { date: '2026-12-09', dday: 0 });
  assert.equal(nextFomc(Date.parse('2027-02-01T00:00:00Z'), dates), null);
});

ok('시계열 카드: 오늘 진행분은 현재값으로, 전일 대비는 어제 종가 기준', () => {
  const s: Pt[] = [{ date: '2026-11-10', value: 1357 }, { date: '2026-11-11', value: 1355 }, { date: '2026-11-12', value: 1350 }];
  const c = seriesCard(s, 1352, '2026-11-12')!;
  assert.equal(c.change, -3);
  assert.deepEqual(c.spark, [1357, 1355, 1352]);
  assert.equal(c.week52High, 1357);
  assert.equal(c.week52Low, 1352);
  assert.equal(seriesCard([{ date: '2026-11-12', value: 1 }], 1, '2026-11-12'), null);
});

ok('네이버 카드: 금리는 4자리, 지연 시세는 지연 표기', () => {
  const base = { flag: undefined, tradedAt: '', spark: [1, 2] };
  const b = naverCard({ ...base, code: 'US10YT=RR', name: '미국 국채 10년', cat: 'bond', unit: '%', price: 4.992, change: 0.003, changeRate: 0.06, status: '실시간' });
  assert.equal(b.dec, 4); assert.equal(b.live, true); assert.equal(b.tag, undefined);
  const o = naverCard({ ...base, code: 'LCOcv1', name: '브렌트유', cat: 'energy', unit: '$', price: 92.18, change: -0.58, changeRate: -0.63, status: '10분 지연' });
  assert.equal(o.dec, 2); assert.equal(o.live, true); assert.equal(o.tag, '10분 지연');
  const c = naverCard({ ...base, code: '.DXY', name: '달러인덱스', cat: 'exchange', price: 102.9, change: 0, changeRate: 0, status: '장마감' });
  assert.equal(c.live, false);
});

console.log(`\n${passed} passed`);
