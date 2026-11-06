/**
 * 거시·복기 점검 수정 회귀(2026-11-06) — SoSoValue 날짜 오프셋 보정, 월별 보고서 첫 달 '일부' 표시, 2027 정적 일정. 실행: npm test
 */
import assert from 'node:assert/strict';
import { buildSchedule } from '../lib/macroSchedule';
import { providerDayOffset, shiftYmd } from '../lib/calendarOfficial';
import { monthlyStats, type TradePosition } from '../lib/tradeReport';
import { CALENDAR_EVENTS } from '../lib/calendarEvents';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

const OFF = buildSchedule({ jobs: ['2026-11-06', '2026-12-04'], cpi: ['2026-11-10'], ppi: ['2026-11-13'], retail: ['2026-11-17'] }, ['2026-12-09']);

ok('SoSoValue 오프셋 — 2026-11 실측처럼 일관되게 하루 이르면 +1, 공식 일정에 없는 종류도 같이 옮김', () => {
  const soso = [
    { date: '2026-11-04', key: 'claims' }, { date: '2026-11-05', key: 'jobs' }, { date: '2026-11-09', key: 'cpi' },
    { date: '2026-11-12', key: 'ppi' }, { date: '2026-11-16', key: 'retail' },
  ];
  assert.equal(providerDayOffset(soso, OFF), 1);
  assert.equal(shiftYmd('2026-11-04', 1), '2026-11-05'); // 실업수당 청구 수 → 목요일
  assert.equal(shiftYmd('2026-11-30', 1), '2026-12-01');
});

ok('SoSoValue 오프셋 — 날짜가 맞으면 0, 표본 1개·엇갈리면 보정 안 함', () => {
  assert.equal(providerDayOffset([{ date: '2026-11-06', key: 'jobs' }, { date: '2026-11-10', key: 'cpi' }], OFF), 0);
  assert.equal(providerDayOffset([{ date: '2026-11-05', key: 'jobs' }], OFF), 0);
  assert.equal(providerDayOffset([{ date: '2026-11-05', key: 'jobs' }, { date: '2026-11-11', key: 'cpi' }], OFF), 0);
  assert.equal(providerDayOffset([], []), 0);
});

const pos = (closeTs: number, net: number): TradePosition => ({
  positionId: String(closeTs), symbol: 'BTCUSDT', side: 'long', openTs: closeTs - 3600_000, closeTs,
  openAvg: 100, closeAvg: 101, size: 1, pnl: net, netProfit: net, fee: 0, funding: 0,
} as unknown as TradePosition);

ok('월별 보고서 — 조회 시작이 달 중간이면 그 달만 partialFrom(MM/DD), 1일부터면 null', () => {
  const ps = [pos(Date.parse('2026-10-20T03:00:00Z'), 5), pos(Date.parse('2026-11-03T03:00:00Z'), -2)];
  const m = monthlyStats(ps, Date.parse('2026-10-07T03:00:00Z'));
  assert.equal(m.find((x) => x.month === '2026-10')!.partialFrom, '10/07');
  assert.equal(m.find((x) => x.month === '2026-11')!.partialFrom, null);
  assert.equal(monthlyStats(ps, Date.parse('2026-09-30T16:00:00Z')).find((x) => x.month === '2026-10')!.partialFrom, null); // 10/01 00:00 KST
  assert.ok(monthlyStats(ps).every((x) => x.partialFrom === null));
});

ok('정적 일정 — 2026 설 2/16~18, 2027 금통위 8회·국내 휴장(평일)·NYSE 휴장 포함', () => {
  const has = (d: string, t: string) => CALENDAR_EVENTS.some((e) => e.date === d && e.title.includes(t));
  assert.ok(has('2026-02-17', '설날') && !has('2026-01-28', '설'));
  assert.equal(CALENDAR_EVENTS.filter((e) => e.category === 'bok' && e.date.startsWith('2027')).length, 8);
  assert.ok(has('2027-02-09', '설 대체') && has('2027-09-15', '추석') && has('2027-12-27', '성탄절'));
  assert.ok(has('2027-03-26', '성금요일') && has('2027-12-24', '크리스마스'));
  for (const e of CALENDAR_EVENTS.filter((x) => x.category === 'holiday' && x.date >= '2027')) {
    const dow = new Date(`${e.date}T00:00:00Z`).getUTCDay();
    assert.ok(dow !== 0 && dow !== 6, `주말 휴장 행 ${e.date} ${e.title}`);
  }
});

console.log(`macroFixes: ${passed} passed`);
