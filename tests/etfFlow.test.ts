import assert from 'node:assert/strict';
import { buildEtfFlow, etfAgeDays, etfBiasFor, STALE_DAYS } from '../lib/etfFlow';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

console.log('etfFlow.ts');
const NOW = Date.parse('2026-10-23T04:00:00Z');
const rows = (latest: string) => [
  { date: latest, totalNetInflow: 3e8, cumNetInflow: 5e10 },
  { date: '2026-10-01', totalNetInflow: 4e8, cumNetInflow: 4.97e10 },
  { date: '2026-09-30', totalNetInflow: 5e8, cumNetInflow: 4.93e10 },
  { date: '2026-09-29', totalNetInflow: -1e8, cumNetInflow: 4.88e10 },
];

ok('최신 집계일 기준 경과 일수', () => {
  assert.equal(etfAgeDays('2026-10-22', NOW), 1);
  assert.equal(etfAgeDays('2026-10-07', NOW), 16);
  assert.equal(etfAgeDays('잘못된', NOW), Infinity);
});

ok('최근 데이터 = stale 아님, 연속 유입 3일', () => {
  const f = buildEtfFlow(rows('2026-10-22'), NOW)!;
  assert.equal(f.stale, false);
  assert.equal(f.streak, 3);
  assert.equal(f.latest.date, '2026-10-22');
});

ok('10-07에서 멈춘 데이터 = stale, 방향 점수 0', () => {
  const f = buildEtfFlow(rows('2026-10-07'), NOW)!;
  assert.equal(f.stale, true);
  assert.equal(etfBiasFor({ BTC: f, ETH: null }, 'BTC'), 0);
});

ok('신선한 연속 유입은 양수 점수', () => {
  const f = buildEtfFlow(rows('2026-10-22'), NOW)!;
  assert.ok(etfBiasFor({ BTC: f, ETH: null }, 'BTC') > 0);
});

ok(`허용 경계 ${STALE_DAYS}일까지는 정상`, () => {
  const d = new Date(NOW - STALE_DAYS * 86_400_000).toISOString().slice(0, 10);
  assert.equal(buildEtfFlow(rows(d), NOW)!.stale, false);
});

ok('빈 데이터 = null', () => { assert.equal(buildEtfFlow([], NOW), null); });

console.log(`\n${passed} passed`);
