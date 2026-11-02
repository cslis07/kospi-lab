/**
 * 거래소별 파생 수급(lib/derivsMulti) — 펀딩 환산·OI 교집합 합산·변화율·OI/가격 4분면·롱숏 쏠림 차이.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import {
  fundingNorm, premiumPct, fundingSummary, sumAligned, changeOver, oiPriceQuadrant, longPctOf, crowdGap, crowdGapText, nextHour, venueSymbols,
  type VenueSnap,
} from '../lib/derivsMulti';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
const near = (a: number | null | undefined, b: number, eps = 1e-9) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const H = 3600_000;

ok('펀딩 환산 — 8h 0.01% = 연 10.95%, 1h 0.00125% = 8h 0.01%', () => {
  const a = fundingNorm(0.0001, 8)!;
  near(a.per8hPct, 0.01); near(a.annualPct, 10.95);
  const h = fundingNorm(0.0000125, 1)!;
  near(h.per8hPct, 0.01); near(h.annualPct, 10.95);
  near(fundingNorm(0.0001, 4)!.per8hPct, 0.02);
  assert.equal(fundingNorm(null, 8), null);
  assert.equal(fundingNorm(0.0001, 0), null);
});

ok('마크−인덱스 괴리', () => {
  near(premiumPct(101, 100), 1);
  near(premiumPct(99.5, 100), -0.5);
  assert.equal(premiumPct(100, null), null);
});

ok('펀딩 요약 — OI 가중 평균·최고·최저·차이', () => {
  const s = (venue: VenueSnap['venue'], rate: number, intervalH: number, oi: number | null): VenueSnap => ({ venue, fundingRate: rate, intervalH, nextFundingTime: null, oiCoins: oi, mark: null, index: null });
  const r = fundingSummary([s('binance', 0.0001, 8, 300), s('hyperliquid', 0.0000125, 1, 100), s('bybit', -0.0001, 8, 100)]);
  near(r.weightedAnnualPct, (10.95 * 300 + 10.95 * 100 - 10.95 * 100) / 500);
  assert.equal(r.min!.venue, 'bybit');
  near(r.spreadPct, 21.9);
  assert.deepEqual(fundingSummary([]), { weightedAnnualPct: null, max: null, min: null, spreadPct: null });
});

ok('OI 합산 — 모든 거래소에 있는 시각만(한 곳 빠진 시각 제외)', () => {
  const a = new Map([[1, 10], [2, 11], [3, 12]]), b = new Map([[2, 5], [3, 6], [4, 7]]);
  assert.deepEqual(sumAligned([a, b]), [{ ts: 2, sum: 16 }, { ts: 3, sum: 18 }]);
  assert.deepEqual(sumAligned([a, new Map()]), [{ ts: 1, sum: 10 }, { ts: 2, sum: 11 }, { ts: 3, sum: 12 }]); // 실패(빈) 거래소는 빼고
  assert.deepEqual(sumAligned([]), []);
});

ok('변화율 — 정확히 N시간 전 점과 비교, 없으면 null', () => {
  const pts = Array.from({ length: 25 }, (_, i) => ({ ts: i * H, v: 100 + i }));
  near(changeOver(pts, 1), (124 / 123 - 1) * 100);
  near(changeOver(pts, 24), 24);
  assert.equal(changeOver(pts.slice(5), 24), null);
});

ok('OI·가격 4분면 + 횡보·변화 작음', () => {
  assert.equal(oiPriceQuadrant(1, 1, '1h'), 'longBuild');
  assert.equal(oiPriceQuadrant(1, -1, '1h'), 'shortCover');
  assert.equal(oiPriceQuadrant(-1, 1, '1h'), 'shortBuild');
  assert.equal(oiPriceQuadrant(-1, -1, '1h'), 'longUnwind');
  assert.equal(oiPriceQuadrant(0.1, 1, '1h'), 'rangeBuild');
  assert.equal(oiPriceQuadrant(0.1, -1, '1h'), 'rangeUnwind');
  assert.equal(oiPriceQuadrant(3, 0.2, '1h'), 'flat');
  assert.equal(oiPriceQuadrant(0.5, 2, '24h'), 'rangeBuild'); // 24h 기준은 더 넓다(가격 0.5%는 횡보)
  assert.equal(oiPriceQuadrant(2, 1, '24h'), 'flat');        // OI 1% 는 24h 기준 '변화 작음'
  assert.equal(oiPriceQuadrant(null, 1, '1h'), null);
});

ok('롱숏 — 비율→롱%, 큰손−전체 차이 해석', () => {
  near(longPctOf(1), 50); near(longPctOf(3), 75);
  assert.equal(longPctOf(null), null);
  near(crowdGap(62.6, 69.7), -7.1, 1e-6);
  assert.equal(crowdGapText(-7), '큰손과 전체 계정의 쏠림이 비슷');
  assert.equal(crowdGapText(-15), '전체 계정(개미)이 큰손보다 롱에 쏠림');
  assert.equal(crowdGapText(12), '큰손이 전체 계정보다 롱에 쏠림');
  assert.equal(crowdGapText(null), null);
});

ok('심볼 표기·하이퍼리퀴드 다음 정산', () => {
  assert.deepEqual(venueSymbols('ETHUSDT'), { base: 'ETH', binance: 'ETHUSDT', bybit: 'ETHUSDT', bitget: 'ETHUSDT', okx: 'ETH-USDT-SWAP', hyperliquid: 'ETH' });
  assert.equal(nextHour(5 * H + 1), 6 * H);
  assert.equal(nextHour(5 * H), 6 * H);
});

console.log(`\nderivsMulti: ${passed} passed`);
