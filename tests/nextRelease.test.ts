/**
 * KL-010 홈 '다음 발표' 계산(lib/nextRelease) — 가장 가까운 발표·보류 구간·한국 시간 표기.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import { nextReleaseWindow, fmtKstShort, fmtKstHm } from '../lib/nextRelease';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
const M = 60_000;
// 2026-11-24(화) 13:30 UTC = 22:30 KST(PPI, 서머타임 종료 뒤 08:30 ET)
const PPI = '2026-11-24T13:30:00.000Z', PCE = '2026-11-25T13:30:00.000Z';
const NOW = Date.parse('2026-11-24T05:00:00.000Z'); // 14:00 KST

console.log('nextRelease — 다음 발표·보류 구간');
ok('가장 가까운 발표 선택(순서 섞여도)', () => {
  const w = nextReleaseWindow([{ title: 'PCE', at: PCE }, { title: 'PPI', at: PPI }], NOW)!;
  assert.equal(w.title, 'PPI'); assert.equal(w.minutesUntil, 510); assert.equal(w.active, false);
});
ok('보류 구간 = 발표 전 60분 ~ 후 30분(기본) · 설정값 반영', () => {
  const w = nextReleaseWindow([{ title: 'PPI', at: PPI }], NOW)!;
  assert.equal(fmtKstHm(w.fromMs), '21:30'); assert.equal(fmtKstHm(w.toMs), '23:00');
  const w2 = nextReleaseWindow([{ title: 'PPI', at: PPI }], NOW, 30, 15)!;
  assert.equal(fmtKstHm(w2.fromMs), '22:00'); assert.equal(fmtKstHm(w2.toMs), '22:45');
});
ok('구간 안이면 active — 발표 20분 뒤에도 아직 보류', () => {
  assert.equal(nextReleaseWindow([{ title: 'PPI', at: PPI }], Date.parse(PPI) - 30 * M)!.active, true);
  assert.equal(nextReleaseWindow([{ title: 'PPI', at: PPI }], Date.parse(PPI) + 20 * M)!.active, true);
});
ok('보류가 끝난 발표는 건너뛰고 다음 것', () => {
  const w = nextReleaseWindow([{ title: 'PPI', at: PPI }, { title: 'PCE', at: PCE }], Date.parse(PPI) + 31 * M)!;
  assert.equal(w.title, 'PCE');
});
ok('잘못된 시각·빈 목록은 null', () => {
  assert.equal(nextReleaseWindow([{ title: 'X', at: 'not a date' }], NOW), null);
  assert.equal(nextReleaseWindow([], NOW), null);
  assert.equal(nextReleaseWindow(undefined, NOW), null);
});
ok('한국 시간 표기 — 11/24(화) 22:30', () => assert.equal(fmtKstShort(Date.parse(PPI)), '11/24(화) 22:30'));

console.log(`nextRelease: ${passed}건 통과`);
