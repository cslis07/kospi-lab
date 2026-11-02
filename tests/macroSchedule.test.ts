/**
 * 경제지표 발표 일정(lib/macroSchedule) — 미 동부시간→UTC·KST 변환(서머타임), 일정 조립, 동시 발표, 관망 구간.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import { etToUtc, tzOffsetMin, fmtKst, fmtEt, fmtUtc, buildSchedule, coReleases, eventWindow, nextEvent, lastEvent, humanMin, FOMC_DECISION_DATES } from '../lib/macroSchedule';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
const M = 60_000;

ok('08:30 ET — 서머타임(EDT)은 12:30 UTC·21:30 KST, 표준시(EST)는 13:30 UTC·22:30 KST', () => {
  const edt = etToUtc('2026-10-14', '08:30');
  assert.equal(new Date(edt).toISOString(), '2026-10-14T12:30:00.000Z');
  assert.equal(fmtKst(edt), '10-14 21:30'); assert.equal(fmtUtc(edt), '12:30 UTC'); assert.equal(fmtEt(edt), '08:30 EDT');
  const est = etToUtc('2026-11-10', '08:30');
  assert.equal(new Date(est).toISOString(), '2026-11-10T13:30:00.000Z');
  assert.equal(fmtKst(est), '11-10 22:30'); assert.equal(fmtEt(est), '08:30 EST');
});

ok('서머타임 경계 — 2026-03-08 시작·11-01 종료', () => {
  assert.equal(new Date(etToUtc('2026-03-06', '08:30')).toISOString(), '2026-03-06T13:30:00.000Z');
  assert.equal(new Date(etToUtc('2026-03-11', '08:30')).toISOString(), '2026-03-11T12:30:00.000Z');
  assert.equal(new Date(etToUtc('2026-10-30', '08:30')).toISOString(), '2026-10-30T12:30:00.000Z');
  assert.equal(new Date(etToUtc('2026-11-02', '08:30')).toISOString(), '2026-11-02T13:30:00.000Z');
  assert.equal(tzOffsetMin(Date.UTC(2026, 6, 1)), -240);
  assert.equal(tzOffsetMin(Date.UTC(2026, 0, 1)), -300);
});

ok('FOMC — 14:00 ET 결정, 14:30 ET 기자회견, KST 다음 날 새벽', () => {
  const ev = buildSchedule({}, ['2026-12-09']);
  assert.deepEqual(ev.map((e) => e.kind), ['fomc', 'powell']);
  assert.equal(new Date(ev[0].ts).toISOString(), '2026-12-09T19:00:00.000Z');
  assert.equal(fmtKst(ev[0].ts), '12-10 04:00');
  assert.equal(fmtKst(ev[1].ts), '12-10 04:30');
  assert.ok(FOMC_DECISION_DATES.includes('2026-06-17') && !FOMC_DECISION_DATES.includes('2026-06-10'));
});

ok('일정 조립 — FRED 날짜 중복 제거·잘못된 날짜 버림·시각순', () => {
  const ev = buildSchedule({ cpi: ['2026-11-10', '2026-11-10', 'bad'], jobs: ['2026-11-06'] }, []);
  assert.deepEqual(ev.map((e) => e.id), ['jobs-2026-11-06', 'cpi-2026-11-10']);
  assert.equal(ev[0].title, '미국 고용보고서');
  assert.deepEqual(ev[0].includes, ['비농업고용(NFP)', '실업률']);
});

ok('동시 발표 — GDP·PCE 같은 날 08:30 이면 서로를 동시 발표로', () => {
  const ev = buildSchedule({ gdp: ['2026-10-29'], pce: ['2026-10-29'], cpi: ['2026-11-10'] }, []);
  const gdp = ev.find((e) => e.kind === 'gdp')!;
  assert.deepEqual(coReleases(ev, gdp).map((e) => e.kind), ['pce']);
  assert.deepEqual(coReleases(ev, ev.find((e) => e.kind === 'cpi')!), []);
});

ok('관망 구간 — 발표 전 60분·후 30분·정상화 확인 30~120분·그 밖은 clear', () => {
  const ev = buildSchedule({ cpi: ['2026-11-10'] }, []);
  const t = ev[0].ts, s = { preMin: 60, postMin: 30, extendMaxMin: 120 };
  assert.deepEqual(eventWindow(ev, t - 60 * M, s), { state: 'pre', event: ev[0], minutes: 60 });
  assert.equal(eventWindow(ev, t - 61 * M, s).state, 'clear');
  assert.equal(eventWindow(ev, t, s).state, 'post');
  assert.equal(eventWindow(ev, t + 29 * M, s).state, 'post');
  assert.equal(eventWindow(ev, t + 30 * M, s).state, 'settling');
  assert.equal(eventWindow(ev, t + 120 * M, s).state, 'clear');
  const c = eventWindow(ev, t - 3 * 60 * M, s);
  assert.equal(c.state, 'clear'); assert.equal(c.state === 'clear' && c.minutesToNext, 180);
});

ok('다음·직전 이벤트, 남은 시간 표기', () => {
  const ev = buildSchedule({ cpi: ['2026-11-10'], jobs: ['2026-11-06'] }, []);
  assert.equal(nextEvent(ev, ev[0].ts)!.kind, 'cpi');
  assert.equal(lastEvent(ev, ev[0].ts)!.kind, 'jobs');
  assert.equal(lastEvent(ev, ev[0].ts - 1), null);
  assert.equal(humanMin(45), '45분'); assert.equal(humanMin(125), '2시간 5분'); assert.equal(humanMin(60 * 50), '2일 2시간');
});

console.log(`\nmacroSchedule: ${passed} passed`);
