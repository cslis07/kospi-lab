/**
 * ETH 체제 보드 순수함수 회귀 테스트 (레이어1·2·4) — 실행: npm test
 * 공급 합산·프리미엄·맥스페인이 틀리면 "체제 판정"이 통째로 거짓이 되므로 계산을 고정한다.
 */
import assert from 'node:assert/strict';
import { summarizeStables, summarizeCex, supplyState } from '../lib/coinSupply';
import { premiumPct, demandState } from '../lib/coinPremium';
import { parseInstrument, expiryToTs, maxPain, summarizeOptions } from '../lib/coinOptions';

let passed = 0;
function ok(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    throw e;
  }
}

console.log('coinSupply.ts');

ok('summarizeStables: USD 페그만 합산, 전일/전주 변화율', () => {
  const r = summarizeStables([
    { pegType: 'peggedUSD', circulating: { peggedUSD: 100 }, circulatingPrevDay: { peggedUSD: 99 }, circulatingPrevWeek: { peggedUSD: 95 } },
    { pegType: 'peggedUSD', circulating: { peggedUSD: 100 }, circulatingPrevDay: { peggedUSD: 101 }, circulatingPrevWeek: { peggedUSD: 105 } },
    { pegType: 'peggedEUR', circulating: { peggedUSD: 9999 } }, // 제외돼야
  ])!;
  assert.equal(r.totalUsd, 200);
  assert.equal(r.prevDayUsd, 200);
  assert.equal(r.prevWeekUsd, 200);
  assert.equal(r.weekChangePct, 0);
});

ok('summarizeStables: 빈 배열이면 null', () => {
  assert.equal(summarizeStables([]), null);
  assert.equal(summarizeStables([{ pegType: 'peggedEUR' }]), null);
});

ok('summarizeCex: cleanAssetsTvl 우선 합산·최대·개수', () => {
  const r = summarizeCex([{ cleanAssetsTvl: 100 }, { cleanAssetsTvl: 300 }, { currentTvl: 50 }, { cleanAssetsTvl: 0 }])!;
  assert.equal(r.totalReserveUsd, 450);
  assert.equal(r.topReserveUsd, 300);
  assert.equal(r.count, 3);
});

ok('supplyState: 스테이블 증가=supportive, stETH 디스카운트=headwind', () => {
  assert.equal(supplyState({ stableWeekPct: 1.0, stethPegPct: 0 }), 'supportive');
  assert.equal(supplyState({ stableWeekPct: -1.0, stethPegPct: 0 }), 'headwind');
  assert.equal(supplyState({ stableWeekPct: 0.1, stethPegPct: -0.5 }), 'headwind');
  assert.equal(supplyState({ stableWeekPct: 0, stethPegPct: 0 }), 'neutral');
  // 상쇄: 증가 +1, 디페그 -1 → neutral
  assert.equal(supplyState({ stableWeekPct: 1.0, stethPegPct: -0.5 }), 'neutral');
});

console.log('coinPremium.ts');

ok('premiumPct: (a/b-1)*100, b=0이면 0', () => {
  assert.ok(Math.abs(premiumPct(110, 100) - 10) < 1e-9);
  assert.ok(Math.abs(premiumPct(99, 100) - -1) < 1e-9);
  assert.equal(premiumPct(100, 0), 0);
});

ok('demandState: 코인베이스 프리미엄 주가중', () => {
  assert.equal(demandState({ coinbasePremiumPct: 0.1 }), 'buying');
  assert.equal(demandState({ coinbasePremiumPct: -0.1 }), 'selling');
  assert.equal(demandState({ coinbasePremiumPct: 0, kimchiPct: 0 }), 'neutral');
  // 프리미엄 중립 + 김프만으론 0.5라 neutral
  assert.equal(demandState({ coinbasePremiumPct: 0, kimchiPct: 5 }), 'neutral');
  // 프리미엄 + 김프 과열 동시
  assert.equal(demandState({ coinbasePremiumPct: 0.1, kimchiPct: 5 }), 'buying');
});

console.log('coinOptions.ts');

ok('parseInstrument: 행사가·만기·콜풋 추출', () => {
  assert.deepEqual(parseInstrument('ETH-27NOV26-3100-P'), { expiry: '27NOV26', strike: 3100, type: 'P' });
  assert.deepEqual(parseInstrument('ETH-9JAN26-2000-C'), { expiry: '9JAN26', strike: 2000, type: 'C' });
  assert.equal(parseInstrument('ETH-27NOV26-3100'), null); // 콜풋 없음
  assert.equal(parseInstrument('BTC-PERPETUAL'), null);
});

ok('expiryToTs: DDMMMYY → 08:00 UTC, 잘못된 월은 null', () => {
  assert.equal(expiryToTs('27NOV26'), Date.UTC(2026, 10, 27, 8, 0, 0));
  assert.equal(expiryToTs('9JAN26'), Date.UTC(2026, 0, 9, 8, 0, 0));
  assert.equal(expiryToTs('1ZZZ26'), null);
});

ok('maxPain: 총 내재가치 최소 행사가(유일 최소)', () => {
  // 중앙(2500)에 OI가 몰려 양끝(2000·3000)보다 지급액이 작다 → 맥스페인 2500
  const opts = [
    { strike: 2000, type: 'C' as const, oi: 10 },
    { strike: 2500, type: 'C' as const, oi: 100 },
    { strike: 2500, type: 'P' as const, oi: 100 },
    { strike: 3000, type: 'P' as const, oi: 10 },
  ];
  // K=2500 지급=10000 < K=2000(60000)·K=3000(60000)
  assert.equal(maxPain(opts), 2500);
  assert.equal(maxPain([]), null);
});

ok('summarizeOptions: 만기별 묶기·미래 만기만·가까운 순', () => {
  const now = Date.UTC(2026, 9, 19, 0, 0, 0); // 2026-10-19
  const rows = [
    { instrument_name: 'ETH-20OCT26-2400-C', open_interest: 50 },
    { instrument_name: 'ETH-20OCT26-2600-P', open_interest: 30 },
    { instrument_name: 'ETH-27NOV26-3000-C', open_interest: 10 },
    { instrument_name: 'ETH-1JAN26-2000-C', open_interest: 99 }, // 과거 만기 → 제외
    { instrument_name: 'ETH-20OCT26-2400-C', open_interest: 0 }, // OI 0 → 제외
    { instrument_name: 'garbage', open_interest: 100 }, // 파싱 불가 → 제외
  ];
  const r = summarizeOptions(rows, now);
  assert.equal(r.expiries.length, 2);
  assert.equal(r.nearest!.expiry, '20OCT26');
  assert.equal(r.nearest!.totalOiEth, 80);
  assert.ok(r.nearest!.daysToExpiry >= 0);
  assert.equal(r.expiries[1].expiry, '27NOV26');
});

console.log(`\n${passed} passed`);
