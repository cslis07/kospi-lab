/**
 * 의사결정 엔진 Phase 4 — 코인 홈 '엔진 공통 환경'(lib/intel/marketBoard). 합성 입력.
 */
import assert from 'node:assert/strict';
import { buildMarketBoard, lastBySymbol } from '../lib/intel/marketBoard';
import type { IntelContext } from '../lib/intel/liquidity';
import type { EngineLogEntry } from '../lib/intel/evidenceLog';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

const NOW = Date.parse('2026-11-13T07:00:00Z');
const iso = (minFromNow: number) => new Date(NOW + minFromNow * 60_000).toISOString();
function ctx(over: Partial<IntelContext> = {}): IntelContext {
  return {
    ingestedAt: NOW - 60_000,
    stable: { latest: 289.5, latestDate: '2026-11-13', chg7dPct: -1.64, chg30dPct: -5.29 },
    etf: {
      BTC: { latestDate: '2026-11-11', latestNetUsd: -300e6, recent: [], streak: -5, recent3: -596e6, bias: -0.6, stale: false },
      ETH: { latestDate: '2026-11-11', latestNetUsd: -145e6, recent: [], streak: -5, recent3: -331e6, bias: -0.6, stale: false },
    },
    fed: [], news: [],
    releases: [{ title: '미국 PPI (생산자물가)', at: iso(390), importance: 'medium' }],
    health: { stable: { ok: true }, etf: { ok: true }, fed: { ok: true }, news: { ok: true }, calendar: { ok: true } },
    ...over,
  };
}

ok('보류 없음 + 다음 발표(6.5시간 뒤, 보류 구간 60분 전~30분 후)', () => {
  const b = buildMarketBoard(ctx(), NOW);
  assert.equal(b.blocks.length, 0);
  assert.equal(b.nextRelease!.title, '미국 PPI (생산자물가)');
  assert.equal(b.nextRelease!.hoursUntil, 6.5);
  assert.equal(b.nextRelease!.blockFrom, iso(330));
  assert.equal(b.nextRelease!.blockTo, iso(420));
  assert.equal(b.nextRelease!.active, false);
});
ok('발표 40분 전 → 공통 거래 보류 중, 보류 분은 위험관리 설정 값', () => {
  const b = buildMarketBoard(ctx({ releases: [{ title: '미국 CPI', at: iso(40), importance: 'high' }] }), NOW);
  assert.equal(b.blocks.length, 1);
  assert.ok(b.nextRelease!.active);
  const b2 = buildMarketBoard(ctx({ releases: [{ title: '미국 CPI', at: iso(40), importance: 'high' }] }), NOW, 30, 15);
  assert.equal(b2.blocks.length, 0);
});
ok('위기 속보(복수 보도) 30분 전 → 보류 사유에 속보·출처 링크', () => {
  const b = buildMarketBoard(ctx({ news: [
    { title: 'Major crypto exchange halts withdrawals after hack', link: 'https://a.example/1', source: 'CNBC', pubDate: iso(-30) },
    { title: 'Crypto exchange halts withdrawals after major hack', link: 'https://b.example/1', source: 'Bloomberg', pubDate: iso(-25) },
  ] }), NOW);
  assert.equal(b.blocks.length, 1);
  assert.match(b.blocks[0].name, /복수 보도/);
  assert.equal(b.blocks[0].sourceUrl, 'https://a.example/1');
  assert.equal(b.news[0].crisis, true);
});
ok('뉴스 보드: 주제 없는 연준 행정 공지는 빼고, FOMC 성명(연준·금리)은 남김', () => {
  const b = buildMarketBoard(ctx({ news: [
    { title: 'Federal Reserve Board announces pricing for payment services', link: 'https://www.federalreserve.gov/a', source: 'Federal Reserve', pubDate: iso(-60) },
    { title: 'Federal Reserve issues FOMC statement', link: 'https://www.federalreserve.gov/b', source: 'Federal Reserve', pubDate: iso(-50) },
    { title: 'Oil prices edge higher on supply outlook', link: 'https://x.example/o', source: 'CNBC', pubDate: iso(-40) },
  ] }), NOW);
  assert.deepEqual(b.news.map((e) => e.title), ['Federal Reserve issues FOMC statement', 'Oil prices edge higher on supply outlook']);
});
ok('유동성: 스테이블·BTC ETF·ETH ETF 3줄, 모두 숏 쪽 · 오래된 ETF 는 유효기간 지남', () => {
  const b = buildMarketBoard(ctx(), NOW);
  assert.deepEqual(b.liquidity.map((x) => [x.obs.id, x.obs.direction, x.stale]), [['liq-stable', -1, false], ['liq-etf', -1, false], ['liq-etf', -1, false]]);
  assert.match(b.liquidity[2].obs.source, /ETH/);
  const old = buildMarketBoard(ctx({ etf: { BTC: { latestDate: '2026-11-06', latestNetUsd: 1e8, recent: [], streak: 1, recent3: 1e8, bias: 0.3, stale: true }, ETH: null } }), NOW);
  assert.equal(old.liquidity.find((x) => x.obs.id === 'liq-etf')!.stale, true);
});
ok('데이터 상태: 실패한 공급자는 ok=false 와 사유', () => {
  const b = buildMarketBoard(ctx({ health: { stable: { ok: false, note: 'DefiLlama 받기 실패' }, etf: { ok: true }, fed: { ok: true }, news: { ok: true }, calendar: { ok: true } }, stable: null }), NOW);
  const s = b.providers.find((p) => p.id === 'stable')!;
  assert.equal(s.ok, false); assert.equal(s.note, 'DefiLlama 받기 실패');
  assert.ok(!b.liquidity.some((x) => x.obs.id === 'liq-stable'));
});
ok('코인별 마지막 엔진 기록 — 최신순', () => {
  const e = (symbol: string, at: string, status: EngineLogEntry['status']) => ({ symbol, recordedAt: at, status } as EngineLogEntry);
  const r = lastBySymbol([e('BTCUSDT', iso(-300), 'WATCH'), e('ETHUSDT', iso(-200), 'NO_SETUP'), e('BTCUSDT', iso(-100), 'BLOCKED')]);
  assert.deepEqual(r.map((x) => [x.symbol, x.status]), [['BTCUSDT', 'BLOCKED'], ['ETHUSDT', 'NO_SETUP']]);
});

console.log(`\nmarketBoard: ${passed}건 통과`);
