/**
 * 매매일지 월별 보고서(lib/tradeReport) 회귀 테스트.
 * 실행: npm test
 *
 * 집계가 틀리면 "내 실제 성적"이 거짓이 되므로 월 버킷팅(KST)·승률·롱숏·기분 집계를 고정한다.
 */
import assert from 'node:assert/strict';
import { monthlyStats, moodStats, kstMonth, type TradePosition } from '../lib/tradeReport';
import type { MoodKey } from '../lib/tradeMood';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

// 2026-01-15 00:00 UTC = 2026-01-15 09:00 KST
const JAN = Date.UTC(2026, 0, 15, 0, 0);
// 2026-01-31 16:00 UTC = 2026-02-01 01:00 KST → KST로는 2월
const JAN31_UTC_16 = Date.UTC(2026, 0, 31, 16, 0);
const FEB = Date.UTC(2026, 1, 10, 3, 0);

function pos(over: Partial<TradePosition>): TradePosition {
  return {
    positionId: 'p', symbol: 'BTCUSDT', side: 'long', openAvg: 100, closeAvg: 110,
    netProfit: 0, fee: 0, funding: 0, openTs: JAN, closeTs: JAN, ...over,
  };
}

ok('kstMonth은 UTC가 아니라 KST 월로 버킷팅한다(월말 밤 → 다음달)', () => {
  assert.equal(kstMonth(JAN), '2026-01');
  assert.equal(kstMonth(JAN31_UTC_16), '2026-02'); // KST +9h로 2월로 넘어감
});

ok('월별로 나뉘고 최신 월이 먼저 온다', () => {
  const r = monthlyStats([
    pos({ positionId: 'a', closeTs: JAN, netProfit: 5 }),
    pos({ positionId: 'b', closeTs: FEB, netProfit: -3 }),
  ]);
  assert.equal(r.length, 2);
  assert.equal(r[0].month, '2026-02'); // 최신 먼저
  assert.equal(r[1].month, '2026-01');
});

ok('승률·순손익·롱숏·수수료·펀딩 합계', () => {
  const [m] = monthlyStats([
    pos({ positionId: 'a', closeTs: JAN, netProfit: 10, fee: 1, funding: 0.5, side: 'long' }),
    pos({ positionId: 'b', closeTs: JAN, netProfit: -4, fee: 2, funding: -0.5, side: 'short' }),
    pos({ positionId: 'c', closeTs: JAN, netProfit: 6, fee: 1, funding: 0, side: 'long' }),
  ]);
  assert.equal(m.count, 3);
  assert.equal(m.wins, 2);
  assert.equal(Math.round(m.winRate!), 67);
  assert.equal(m.netSum, 12);
  assert.equal(m.feeSum, 4);
  assert.equal(m.fundingSum, 0);
  assert.equal(m.longCount, 2);
  assert.equal(m.shortCount, 1);
});

ok('최고·최저 순손익 매매를 찾는다', () => {
  const [m] = monthlyStats([
    pos({ positionId: 'a', closeTs: JAN, netProfit: 10 }),
    pos({ positionId: 'b', closeTs: JAN, netProfit: -8 }),
    pos({ positionId: 'c', closeTs: JAN, netProfit: 3 }),
  ]);
  assert.equal(m.best?.positionId, 'a');
  assert.equal(m.worst?.positionId, 'b');
});

ok('평균 보유시간은 양수 보유만, 없으면 null', () => {
  const [m] = monthlyStats([
    pos({ positionId: 'a', openTs: JAN, closeTs: JAN + 3600_000 }),        // 1h
    pos({ positionId: 'b', openTs: JAN, closeTs: JAN + 3 * 3600_000 }),    // 3h
  ]);
  assert.equal(m.avgHoldMs, 2 * 3600_000);
});

ok('기분별 성적 — 기록된 매매만, 건수 내림차순', () => {
  const positions = [
    pos({ positionId: 'a', closeTs: JAN, netProfit: 5 }),
    pos({ positionId: 'b', closeTs: JAN, netProfit: -2 }),
    pos({ positionId: 'c', closeTs: JAN, netProfit: 3 }),
    pos({ positionId: 'd', closeTs: JAN, netProfit: 1 }), // 기분 없음 → 제외
  ];
  const moods: Record<string, { mood: MoodKey }> = {
    a: { mood: 'fomo' }, b: { mood: 'fomo' }, c: { mood: 'calm' },
  };
  const r = moodStats(positions, moods);
  assert.equal(r.length, 2);
  assert.equal(r[0].mood, 'fomo'); // 2건으로 최다
  assert.equal(r[0].count, 2);
  assert.equal(r[0].wins, 1);
  assert.equal(r[0].netSum, 3);
  assert.equal(r[1].mood, 'calm');
  assert.equal(r[1].count, 1);
});

console.log(`\n${passed} passed`);
