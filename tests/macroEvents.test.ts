import assert from 'node:assert/strict';
import { classify, flattenEvents, dedupeForCalendar, keyOfLabel } from '../lib/macroEvents';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
console.log('macroEvents.ts');

ok('이벤트명 분류·한국어', () => {
  assert.deepEqual(classify('CPI (YoY)'), { key: 'cpi', ko: 'CPI(전년비)' });
  assert.equal(classify('Core PCE Price Index (MoM)').key, 'pce');
  assert.equal(classify('Nonfarm Payrolls').ko, '비농업 고용');
  assert.equal(classify('FOMC Meeting Minutes').key, 'minutes');
  assert.equal(classify('Fed Interest Rate Decision').key, 'fomc');
  assert.deepEqual(classify('Something New'), { key: null, ko: 'Something New' });
});
ok('펼치기: 날짜 오름차순·빈 값 제외', () => {
  const f = flattenEvents([{ date: '2026-11-05', events: ['CPI', ''] }, { date: '2026-11-03', events: ['Nonfarm Payrolls'] }]);
  assert.deepEqual(f.map((e) => e.date), ['2026-11-03', '2026-11-05']);
});
ok('달력 중복 제거: 기존 한국어 라벨·같은 지표 여러 줄', () => {
  const evts = flattenEvents([{ date: '2026-11-12', events: ['CPI (YoY)', 'CPI (MoM)', 'Core CPI (MoM)', 'Retail Sales'] }, { date: '2026-11-04', events: ['FOMC Rate Decision'] }]);
  const out = dedupeForCalendar(evts, [{ date: '2026-11-04', label: 'FOMC 금리 결정' }, { date: '2026-11-12', label: '소매판매' }]);
  assert.deepEqual(out.map((e) => e.ko), ['CPI(전년비)']);
  assert.equal(keyOfLabel('고용 10월'), 'jobs');
});
console.log(`\n${passed} passed`);
