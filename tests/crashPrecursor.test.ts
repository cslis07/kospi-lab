import assert from 'node:assert/strict';
import { rangePct, pctRank, downDrift, forwardMove, episodes, sigStat, shockEvents, shockStat, latestShock, liveState, type Bar, type Point } from '../lib/crashPrecursor';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
console.log('crashPrecursor.ts');

const M15 = 900_000, H = 3_600_000;
const flat = (n: number, px = 100, step = 0, v = 10): Bar[] => Array.from({ length: n }, (_, i) => {
  const c = px + step * i; return { ts: i * M15, o: c, h: c + 0.1, l: c - 0.1, c, v };
});

ok('6h 변동폭·백분위·결과(미래 4h)', () => {
  const b = flat(60);
  assert.ok(Math.abs(rangePct(b, 30, 24)! - 0.2) < 1e-9);
  assert.equal(rangePct(b, 10, 24), null);
  assert.equal(pctRank(Array(100).fill(1), 0.5), 0);
  assert.equal(pctRank(Array(10).fill(1), 0.5), null);
  b[35] = { ...b[35], l: 97 };
  assert.ok(Math.abs(forwardMove(b, 30)!.dn - 3) < 1e-9);
  assert.equal(forwardMove(b, 50, 16), null);
});
ok('하락 기울기: 6h 전보다 낮고 뒤 3h 고점 < 앞 3h 고점', () => {
  const b = flat(40, 100, -0.05);
  assert.equal(downDrift(b, 39), true);
  assert.equal(downDrift(flat(40, 100, 0.05), 39), false);
});
ok('에피소드는 6시간 간격으로 묶음 · 30건 미만이면 표본 부족', () => {
  const pts: Point[] = Array.from({ length: 48 }, (_, i) => ({ ts: i * H, comp: 0.1, down: true, up: false, nearLow: false, bigDn: i % 2 === 0, bigUp: false }));
  assert.equal(episodes(pts, () => true).length, 1);   // 연속 신호 = 한 에피소드
  assert.equal(sigStat(pts, () => true).verdictDn, 'thin');
});
ok('충격봉: 거래량 8배·변동폭 3배·하단 마감 → 이후 추가 하락 판정', () => {
  const b = flat(60);
  b[30] = { ts: 30 * M15, o: 100, h: 100.2, l: 98.8, c: 98.9, v: 100 };   // 변동 1.4 = 평균 0.2의 7배, 거래량 10배, 하단 마감
  b[33] = { ...b[33], l: 97.2 };
  const ev = shockEvents(b);
  assert.equal(ev.length, 1); assert.equal(ev[0].dir, 'down'); assert.equal(ev[0].cont, true); assert.equal(ev[0].rev, false);
  assert.equal(shockStat(ev).verdict, 'thin');
  assert.equal(latestShock(b.slice(0, 31), 2)?.dir, 'down');
  assert.equal(latestShock(b.slice(0, 40), 2), null);   // 2봉(30분) 지나면 없음
});
ok('실시간 상태: 1시간봉으로 압축 백분위·기울기, 켜진 신호 key', () => {
  const h1: Bar[] = Array.from({ length: 300 }, (_, i) => {
    const wide = i < 290; const c = 100 - (i >= 290 ? (i - 290) * 0.01 : 0);
    return { ts: i * H, o: c, h: c + (wide ? 2 : 0.05), l: c - (wide ? 2 : 0.05), c, v: 1 };
  });
  const s = liveState(h1, flat(120), 2);
  assert.ok(s.comp != null && s.comp <= 0.15); assert.equal(s.down, true);
  assert.ok(s.signals.includes('comp') && s.signals.includes('compDown'));
  assert.equal(s.oiBuild, true);   // OI +2% · 가격 6h 변화 −0.06%
});
console.log(`\n${passed} passed`);
