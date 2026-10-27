import assert from 'node:assert/strict';
import { resolveWarn, resolveShock, appendAlerts, summarizeAlertLog, dueAt, type AlertLogEntry } from '../lib/alertLog';
import type { Bar } from '../lib/crashWarning';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
console.log('alertLog.ts');
const M = 60_000, T = Date.parse('2026-10-27T00:00:00Z');
const bars = (start: number, stepMin: number, n: number, low: (i: number) => number, c = 100): Bar[] =>
  Array.from({ length: n }, (_, i) => ({ ts: start + i * stepMin * M, o: c, h: c + 0.5, l: low(i), c, v: 1 }));

ok('warn: 15분 뒤~75분 안 −3% 도달이면 hit, 15분 안 급락은 안 셈, 봉 모자라면 null', () => {
  const e = { ts: T, px: 100 };
  assert.equal(resolveWarn(e, bars(T, 5, 20, (i) => (i === 5 ? 96.9 : 99.5))), 'hit');   // T+25분 봉
  assert.equal(resolveWarn(e, bars(T, 5, 20, (i) => (i === 1 ? 90 : 99.5))), 'miss');    // T+5분 봉 — 선행 15분 안이라 제외
  assert.equal(resolveWarn(e, bars(T, 5, 20, (i) => (i === 14 ? 96.9 : 99.5))), 'hit');  // T+70분 시작 → T+75분 끝: 포함 경계
  assert.equal(resolveWarn(e, bars(T, 5, 20, (i) => (i === 15 ? 96.9 : 99.5))), 'miss'); // T+75분 시작 — 창 밖
  assert.equal(resolveWarn(e, bars(T, 5, 8, () => 99.5)), null);
  assert.equal(dueAt({ kind: 'warn', ts: T }), T + 75 * M); assert.equal(dueAt({ kind: 'shock', ts: T }), T + 135 * M);
});
ok('shock: 충격봉 뒤 8봉 안 봉 크기만큼 추가 하락=cont, 반등=rev', () => {
  const b = (f: (i: number) => [number, number]) => Array.from({ length: 10 }, (_, i): Bar => {
    const [h, l] = i === 0 ? [102, 100] : f(i);
    return { ts: T + i * 15 * M, o: 101, h, l, c: i === 0 ? 100.2 : 100, v: 1 };
  });
  assert.equal(resolveShock({ ts: T }, b(() => [100.5, 98])), 'cont');   // 100.2 − 98 ≥ 2
  assert.equal(resolveShock({ ts: T }, b(() => [102.5, 99.9])), 'rev');
  assert.equal(resolveShock({ ts: T }, b(() => [100.5, 99.9])), 'neither');
  assert.equal(resolveShock({ ts: T }, b(() => [100.5, 98]).slice(0, 5)), null);
});
ok('기록 추가는 중복 없이, 집계는 판정된 것만·포기한 건 제외', () => {
  const w = (ts: number, outcome?: AlertLogEntry['outcome'], gaveUp?: boolean): AlertLogEntry => ({ kind: 'warn', sym: 'ETHUSDT', ts, px: 1, at: ts, outcome, gaveUp });
  const log = appendAlerts({ entries: [w(1, 'hit')] }, [w(1), w(2, 'miss'), w(3), w(4, undefined, true), { kind: 'shock', sym: 'BTCUSDT', ts: 5, at: 5, outcome: 'cont' }]);
  assert.equal(log.entries.length, 5);
  const s = summarizeAlertLog(log);
  assert.deepEqual([s.warn.n, s.warn.hit, s.warn.pending, s.warn.ratePct], [2, 1, 1, 50]);
  assert.deepEqual([s.shock.n, s.shock.cont, s.shock.contPct], [1, 1, 100]);
  assert.equal(summarizeAlertLog(null).warn.ratePct, null);
});
console.log(`\n${passed} passed`);
