/** npx tsx tests/microData.test.ts */
import assert from 'node:assert/strict';
import { toLevels, bandDepth, mergeResolutions, avgDepth, imbalance, liqBuckets, r6, utcDay, BUCKET_MS } from '../lib/microData';

// toLevels — 문자열·객체 행, 계약 환산, 0 수량 제거
assert.deepEqual(toLevels([['100', '2'], ['99', '0'], ['x', '1']], 0.5), [[100, 1]]);
assert.deepEqual(toLevels([{ px: '10', sz: '3' }]), [[10, 3]]);

// bandDepth — 중간가 100, 구간 0.5%·1%·5%
const book = { bids: toLevels([[99.9, 1], [99.6, 2], [99.2, 4], [98.9, 8]]), asks: toLevels([[100.1, 1], [100.4, 3], [100.9, 5], [101.5, 2]]) };
const d = bandDepth(book, [0.5, 1, 5])!;
assert.equal(d.mid, 100);
assert.ok(Math.abs(d.spreadBps - 20) < 1e-9);
assert.deepEqual(d.b, [3, 7, null]);      // 0.5% → 99.5 이상: 1+2 · 1% → 99 이상: +4 · 5% 는 호가창이 안 닿음
assert.deepEqual(d.a, [4, 9, null]);      // 0.5% → 100.5 이하: 1+3 · 1% → 101 이하(100.9 포함)
assert.equal(bandDepth({ bids: [], asks: book.asks }), null);
assert.equal(bandDepth({ bids: [[101, 1]], asks: [[100, 1]] }), null); // 교차 호가

// mergeResolutions — 촘촘한 것 우선, 안 닿는 구간은 묶음 호가창 값
const fine = { mid: 100, spreadBps: 1, b: [3, null], a: [4, null] }, coarse = { mid: 100.1, spreadBps: 9, b: [5, 20], a: [6, null] };
assert.deepEqual(mergeResolutions([fine, null, coarse]), { mid: 100, spreadBps: 1, b: [3, 20], a: [4, null] });
assert.equal(mergeResolutions([null]), null);

// avgDepth — 있는 표본만 평균
assert.deepEqual(avgDepth([{ mid: 100, spreadBps: 2, b: [2, null], a: [4, 1] }, null, { mid: 102, spreadBps: 4, b: [4, 6], a: [8, null] }]), { mid: 101, spreadBps: 3, b: [3, 6], a: [6, 1] });

assert.equal(imbalance(3, 1), 0.75);
assert.equal(imbalance(null, 1), null);
assert.equal(imbalance(0, 0), null);

// liqBuckets — 빈 버킷도 0으로, 범위 밖 무시, 덜 끝난 버킷 제외
const B = BUCKET_MS, t0 = 10 * B;
const bk = liqBuckets([
  { ts: t0 + 1, side: 'long', coins: 2 }, { ts: t0 + 5, side: 'long', coins: 3 }, { ts: t0 + 9, side: 'short', coins: 1 },
  { ts: t0 + 2 * B + 1, side: 'short', coins: 7 }, { ts: t0 - 1, side: 'long', coins: 99 }, { ts: t0 + 3 * B + 1, side: 'long', coins: 99 },
], t0, t0 + 3 * B + B / 2);
assert.deepEqual(bk, [
  { t: t0, l: 5, sh: 1, nl: 2, ns: 1, mx: 3 },
  { t: t0 + B, l: 0, sh: 0, nl: 0, ns: 0, mx: 0 },
  { t: t0 + 2 * B, l: 0, sh: 7, nl: 0, ns: 1, mx: 7 },
]);
assert.deepEqual(liqBuckets([], t0 + 1, t0 + B), []); // 완성된 버킷 없음

assert.equal(r6(123.456789), 123.457);
assert.equal(r6(null), null);
assert.equal(utcDay(Date.UTC(2026, 10, 13, 23, 59)), '2026-11-13');

console.log('microData ok');
