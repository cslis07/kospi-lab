/**
 * 의사결정 엔진 Phase 2 — 유동성(스테이블코인·ETF)·뉴스 사건 묶기·확인 수준·위기 속보 안전모드·연준 공식 RSS·공급자 상태.
 * 모두 합성 입력(네트워크 없음).
 */
import assert from 'node:assert/strict';
import { recommendEntry, type RecInput } from '../lib/entryRec';
import { buildDecision, type AnalysisSnapshot, type DecisionSettings } from '../lib/intel/fromAnalysis';
import { activeBlock } from '../lib/intel/decisionEngine';
import { classifyTopic, titleTokens, sameStory, clusterNews, newsRiskEvents, parseFedRss, fedRiskEvents, type RawNews, type FedItem } from '../lib/intel/newsEvents';
import { stableChange, liquidityObservations, type IntelContext, type EtfLite } from '../lib/intel/liquidity';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

const NOW = Date.parse('2026-11-13T03:07:00Z');
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const ST: DecisionSettings = { equityUsd: 1000, riskPerTradePct: 0.5, maxLeverage: 10, makerFeePct: 0.02, takerFeePct: 0.06, slippagePct: 0.05, holdHours: 8, minNetRR: 1.5, eventPreMin: 60, eventPostMin: 30 };

function recInput(k: number): RecInput {
  const p = (x: number) => x * k;
  return {
    price: p(2052.5), atr15: p(6), atr1h: p(14),
    zones: [
      { price: p(2087.1), touches: 4, kind: 'resistance' }, { price: p(2068.1), touches: 10, kind: 'resistance' },
      { price: p(2046.0), touches: 6, kind: 'support' }, { price: p(2040.5), touches: 3, kind: 'support' },
    ],
    high24h: p(2103), low24h: p(2033.9),
    fib: { direction: 'down', r382: p(2053.4), r50: p(2055.6), r618: p(2057.8), e1272: p(2041.1), e1618: p(2034.6) },
    smc: null,
    ma: [{ label: '1H EMA20', value: p(2066), weight: 1.5 }],
    bb: [{ label: '1H 볼린저', lower: p(2031), upper: p(2072), weight: 1.5 }],
    walls: { bid: p(2040), ask: p(2069) },
    ctx: { engineDir: 'short', h4: 'down', d1: 'down', newsPos: 0, newsNeg: 0, fundingPct: 0.01, lsRatio: 1.4, fearGreed: 30, macroBias: 'short', takerRatio: 0.95, eventHours: null, eventTitle: null },
  };
}
function snap(symbol: string, k: number, news: RawNews[] = []): AnalysisSnapshot {
  return {
    symbol, price: 2052.5 * k, updatedAt: NOW - 60_000, m15Candles: [], news,
    h1: { structure: '하락', emaAlign: '역배열', priceVsEma20: 'below' },
    m15: { structure: '하락', emaAlign: '역배열', priceVsEma20: 'below' },
    regime: { h4: 'down', d1: 'down' },
    macro: { bias: 'short', strength: '보통', asOf: ['2026-11-12', '2026-11-12'] },
    funding: { ratePct: 0.01, intervalH: 8 }, lsRatio: 1.4, takerRatio: 0.85, event: null,
  };
}
const etf = (over: Partial<EtfLite> = {}): EtfLite => ({ latestDate: '2026-11-12', latestNetUsd: 420e6, recent: [], streak: 3, recent3: 900e6, bias: 0.6, stale: false, ...over });
function ctx(over: Partial<IntelContext> = {}): IntelContext {
  return {
    ingestedAt: NOW - 120_000,
    stable: { latest: 312.4, latestDate: '2026-11-13', chg7dPct: 1.2, chg30dPct: 3.1 },
    etf: { BTC: etf(), ETH: etf({ latestNetUsd: -60e6, streak: -2, recent3: -150e6, bias: -0.3 }) },
    fed: [], news: [], releases: [],
    health: { stable: { ok: true }, etf: { ok: true }, fed: { ok: true }, news: { ok: true }, calendar: { ok: true } },
    ...over,
  };
}

console.log('newsEvents — 주제 분류');
ok('가상자산 해킹·출금 중단 → 거래소 사고', () => {
  assert.equal(classifyTopic('Crypto exchange hacked, $200M drained from hot wallet'), 'exchange_outage');
  assert.equal(classifyTopic('국내 코인 거래소 출금 중단…해킹 의심'), 'exchange_outage');
});
ok('가상자산 맥락 없는 파산·해킹 기사는 거래소 사고가 아님', () => {
  assert.notEqual(classifyTopic('Retailer files for bankruptcy after weak holiday season'), 'exchange_outage');
  assert.notEqual(classifyTopic('통신사 해킹 사고 후속 대책 발표'), 'exchange_outage');
});
ok("'trade war'·미사일 발사는 전쟁 위기로 보지 않음, 침공·선전포고는 위기", () => {
  assert.notEqual(classifyTopic('US-China trade war fears weigh on stocks'), 'war_oil_supply');
  assert.notEqual(classifyTopic('북한 탄도미사일 발사'), 'war_oil_supply');
  assert.equal(classifyTopic('Russia invades neighbouring state, oil jumps'), 'war_oil_supply');
  assert.equal(classifyTopic('이란, 호르무즈 해협 봉쇄 경고'), 'war_oil_supply');
});
ok('연준·물가 제목은 참고 주제(위기 아님)', () => {
  assert.equal(classifyTopic('Waller says more rate cuts may be needed'), 'fed_policy');
  assert.equal(classifyTopic('US CPI rises 0.3% in October'), 'inflation');
});

console.log('newsEvents — 사건 묶기·확인 수준');
ok('제목 꼬리(" - 언론사") 제거·겹침 계수', () => {
  const a = titleTokens('Bitcoin ETF inflows top $1 billion as price rebounds - Reuters');
  assert.ok(!a.has('reuters'));
  assert.ok(sameStory(a, titleTokens('Bitcoin ETF inflows top $1 billion while price rebounds')));
  assert.ok(!sameStory(a, titleTokens('Ether staking queue hits record high')));
});
ok('같은 사건 3개 매체 → 사건 1개·복수 보도, 다른 기사는 단일 보도', () => {
  const ev = clusterNews([
    { title: 'Major crypto exchange halts withdrawals after hack', link: 'https://a.example/1', source: 'CNBC', pubDate: ago(30) },
    { title: 'Crypto exchange halts withdrawals after major hack - Bloomberg', link: 'https://b.example/1', source: 'Bloomberg', pubDate: ago(25) },
    { title: 'Major crypto exchange halts withdrawals following hack', link: 'https://c.example/1', source: 'Yahoo Finance', pubDate: ago(20) },
    { title: 'Oil prices edge higher on supply outlook', link: 'https://d.example/1', source: 'CNBC', pubDate: ago(60) },
  ], NOW);
  assert.equal(ev.length, 2);
  assert.equal(ev[0].crisis, true);
  assert.equal(ev[0].verification, 'multi_source');
  assert.equal(ev[0].sources.length, 3);
  assert.equal(ev[0].articleCount, 3);
  assert.equal(ev[0].firstSeenAt, ago(30));
  assert.equal(ev[0].policyStance, 'unclassified');
  assert.equal(ev[1].verification, 'single_source');
});
ok('연준 출처는 공식 자료, 시각 없음·미래·24시간 넘은 기사는 뺀다', () => {
  const ev = clusterNews([
    { title: 'Federal Reserve issues FOMC statement', link: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20261112a.htm', source: 'Federal Reserve', pubDate: ago(10) },
    { title: 'No date story about bitcoin miners', link: 'https://x.example/1', source: 'X' },
    { title: 'Future dated story about ether upgrade', link: 'https://x.example/2', source: 'X', pubDate: ago(-30) },
    { title: 'Old story about solana outage last week', link: 'https://x.example/3', source: 'X', pubDate: ago(25 * 60) },
  ], NOW);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].verification, 'official');
});

console.log('newsEvents — 위기 속보 안전모드');
ok('위기 사건 30분 전 → critical, 처음 보인 시각 + 2시간까지 보류 · 단일 보도는 미확인 표시', () => {
  const ev = clusterNews([{ title: '코인 거래소 해킹으로 입출금 중단', link: 'https://n.example/1', source: '연합뉴스', pubDate: ago(30) }], NOW);
  const r = newsRiskEvents(ev, NOW);
  assert.equal(r.length, 1);
  assert.equal(r[0].severity, 'critical');
  assert.equal(r[0].type, 'exchange_outage');
  assert.equal(r[0].verified, false);
  assert.equal(r[0].blockUntil, new Date(NOW - 30 * 60_000 + 120 * 60_000).toISOString());
  assert.ok(activeBlock(r[0], NOW));
});
ok('3시간 전 위기 속보는 안전모드 끝 · 위기 아닌 사건은 이벤트 없음', () => {
  const ev = clusterNews([
    { title: 'Bitcoin exchange hacked overnight', link: 'https://n.example/2', source: 'CNBC', pubDate: ago(180) },
    { title: 'Powell says policy is well positioned', link: 'https://n.example/3', source: 'CNBC', pubDate: ago(10) },
  ], NOW);
  assert.equal(newsRiskEvents(ev, NOW).length, 0);
});

console.log('newsEvents — 연준 공식 RSS');
const FED_XML = `<?xml version="1.0"?><rss><channel>
<item><title>Barr, American Inequality and the Future of AI </title><link><![CDATA[https://www.federalreserve.gov/newsevents/speech/barr20261112a.htm]]></link>
<description><![CDATA[Speech At Yale University]]></description><pubDate><![CDATA[Thu, 12 Nov 2026 15:00:00 GMT]]></pubDate></item>
<item><title>Minutes of the Board&#39;s discount rate meetings</title><link><![CDATA[https://www.federalreserve.gov/x.htm]]></link><pubDate>bad date</pubDate></item>
</channel></rss>`;
ok('연설 RSS → 발언자·제목·장소·UTC 시각, 시각 없는 항목 제외', () => {
  const it = parseFedRss(FED_XML, 'speech');
  assert.equal(it.length, 1);
  assert.equal(it[0].speaker, 'Barr');
  assert.equal(it[0].title, 'American Inequality and the Future of AI');
  assert.equal(it[0].venue, 'Speech At Yale University');
  assert.equal(it[0].publishedAt, '2026-11-12T15:00:00.000Z');
});
ok('FOMC 성명 10분 전 → 보류, 40분 전 → 해제, 의사록은 참고만, 연설은 이벤트 없음', () => {
  const f = (title: string, min: number, kind: FedItem['kind'] = 'monetary'): FedItem => ({ kind, speaker: null, title, link: 'https://www.federalreserve.gov/a', venue: '', publishedAt: ago(min) });
  const e1 = fedRiskEvents([f('Federal Reserve issues FOMC statement', 10)], NOW);
  assert.equal(e1.length, 1);
  assert.ok(activeBlock(e1[0], NOW));
  const e2 = fedRiskEvents([f('Federal Reserve issues FOMC statement', 40)], NOW);
  assert.equal(activeBlock(e2[0], NOW), null);
  const e3 = fedRiskEvents([f('Minutes of the Federal Open Market Committee, October 27-28, 2026', 5)], NOW);
  assert.equal(e3[0].severity, 'high');
  assert.equal(activeBlock(e3[0], NOW), null);
  assert.equal(fedRiskEvents([f('Economic Outlook', 5, 'speech')], NOW).length, 0);
});

console.log('liquidity');
ok('스테이블코인 7일·30일 변화, 기준일 이후 점은 쓰지 않음', () => {
  const pts = Array.from({ length: 40 }, (_, i) => ({ date: new Date(Date.parse('2026-10-05T00:00:00Z') + i * 86_400_000).toISOString().slice(0, 10), value: 300 + i * 0.5 }));
  const c = stableChange(pts, NOW)!; // 마지막 점 11-13 = 300+39*0.5 = 319.5 · 11-14 이후 없음
  assert.equal(c.latestDate, '2026-11-13');
  assert.equal(c.latest, 319.5);
  assert.equal(c.chg7dPct, Math.round((319.5 / 316 - 1) * 10000) / 100);
  assert.equal(c.chg30dPct, Math.round((319.5 / 304.5 - 1) * 10000) / 100);
  assert.equal(stableChange(pts, Date.parse('2026-10-05T12:00:00Z')), null); // 점 1개뿐
});
ok('유동성 관측값: 스테이블 +1.2% → 롱 쪽, 30일 반대면 강도 절반, BTC ETF 반영, SOL 은 ETF 없음', () => {
  const btc = liquidityObservations(ctx(), 'BTCUSDT');
  assert.deepEqual(btc.map((o) => [o.id, o.direction]), [['liq-stable', 1], ['liq-etf', 1]]);
  assert.equal(btc[0].strength, 0.6);
  const against = liquidityObservations(ctx({ stable: { latest: 300, latestDate: '2026-11-13', chg7dPct: 1.2, chg30dPct: -2 } }), 'BTCUSDT');
  assert.equal(against[0].strength, 0.3);
  assert.deepEqual(liquidityObservations(ctx(), 'SOLUSDT').map((o) => o.id), ['liq-stable']);
  assert.equal(liquidityObservations(ctx(), 'ETHUSDT')[1].direction, -1);
  assert.deepEqual(liquidityObservations(null, 'BTCUSDT'), []);
});

console.log('buildDecision — Phase 2 연결');
ok('유동성 연결 시 데이터 범위 70% → 89%, 공급자 상태 정상', () => {
  const rec = recommendEntry(recInput(48), String);
  const d0 = buildDecision(snap('BTCUSDT', 48), rec, NOW, ST);
  const d1 = buildDecision(snap('BTCUSDT', 48), rec, NOW, ST, ctx());
  assert.equal(d0.output.coverage, 0.7);
  assert.equal(d1.output.coverage, 0.89);
  assert.notEqual(d1.output.groupScores.liquidity, null);
  assert.equal(d1.output.groupScores.news, null);   // 뉴스 방향 점수는 비움
  const pv = Object.fromEntries(d1.providers.map((p) => [p.id, p.status]));
  assert.equal(pv.stable, 'ok'); assert.equal(pv.etf, 'ok'); assert.equal(pv.fed, 'ok');
});
ok('ETF 집계가 6일 지났으면 유효기간 초과(방향에서 빠짐) → 공급자 지연', () => {
  const rec = recommendEntry(recInput(48), String);
  const d = buildDecision(snap('BTCUSDT', 48), rec, NOW, ST, ctx({ etf: { BTC: etf({ latestDate: '2026-11-07' }), ETH: null } }));
  assert.ok(d.output.staleIds.includes('liq-etf'));
  assert.equal(d.providers.find((p) => p.id === 'etf')!.status, 'stale');
});
ok('코인 뉴스에 20분 전 거래소 해킹 속보 → 거래 보류(BLOCKED)', () => {
  const rec = recommendEntry(recInput(48), String);
  const d = buildDecision(snap('BTCUSDT', 48, [{ title: '비트코인 거래소 해킹…출금 중단', link: 'https://n.example/h', source: '한국경제', pubDate: ago(20) }]), rec, NOW, ST, ctx());
  assert.equal(d.output.status, 'BLOCKED');
  assert.ok(d.output.blocks.some((b) => b.includes('속보')));
  assert.equal(d.newsEvents[0].crisis, true);
});
ok('FOMC 성명 공개 직후(연준 RSS) → 거래 보류', () => {
  const rec = recommendEntry(recInput(48), String);
  const fed: FedItem[] = [{ kind: 'monetary', speaker: null, title: 'Federal Reserve issues FOMC statement', link: 'https://www.federalreserve.gov/b', venue: '', publishedAt: ago(5) }];
  const d = buildDecision(snap('BTCUSDT', 48), rec, NOW, ST, ctx({ fed }));
  assert.equal(d.output.status, 'BLOCKED');
  assert.ok(d.output.blocks.some((b) => b.includes('FOMC')));
  assert.equal(d.fed.length, 1);
});
ok('캘린더 중요도 중간인 PPI(공식 일정) 40분 전 → 발표 전 보류, 분석 응답 이벤트와 같은 발표는 중복 안 함', () => {
  const rec = recommendEntry(recInput(48), String);
  const at = new Date(NOW + 40 * 60_000).toISOString();
  const d = buildDecision(snap('BTCUSDT', 48), rec, NOW, ST, ctx({ releases: [{ title: '미국 PPI (생산자물가)', at, importance: 'medium' }] }));
  assert.equal(d.output.status, 'BLOCKED');
  assert.ok(d.output.blocks.some((b) => b.includes('PPI')));
  assert.match(d.providers.find((p) => p.id === 'calendar')!.note!, /PPI.*0\.7시간 뒤/);
  const s = { ...snap('BTCUSDT', 48), event: { title: '미국 PPI (생산자물가)', hoursUntil: 41 / 60 } };
  const d2 = buildDecision(s, rec, NOW, ST, ctx({ releases: [{ title: '미국 PPI (생산자물가)', at, importance: 'medium' }] }));
  assert.equal(d2.events.filter((e) => e.name.includes('PPI')).length, 1);
  const far = buildDecision(snap('BTCUSDT', 48), rec, NOW, ST, ctx({ releases: [{ title: '미국 PPI (생산자물가)', at: new Date(NOW + 5 * 3_600_000).toISOString(), importance: 'medium' }] }));
  assert.ok(!far.output.blocks.some((b) => b.includes('PPI')));
});
ok('뉴스 정렬: 주제 없는 공식 행정 공지보다 시장 주제 기사가 먼저', () => {
  const ev = clusterNews([
    { title: 'Federal Reserve Board issues enforcement action with former bank employee', link: 'https://www.federalreserve.gov/e', source: 'Federal Reserve', pubDate: ago(30) },
    { title: 'US CPI rises 0.3% in October as shelter costs climb', link: 'https://x.example/cpi', source: 'CNBC', pubDate: ago(40) },
  ], NOW);
  assert.equal(ev[0].topic, 'inflation');
});
ok('SOL: ETF 해당 없음·누락 목록에 표시(BTC ETF 로 대신하지 않음)', () => {
  const rec = recommendEntry(recInput(0.04), String);
  const d = buildDecision(snap('SOLUSDT', 0.04), rec, NOW, ST, ctx());
  assert.equal(d.providers.find((p) => p.id === 'etf')!.status, 'na');
  assert.ok(d.missing.some((m) => m.startsWith('SOL 현물 ETF')));
  assert.ok(!d.observations.some((o) => o.id === 'liq-etf'));
});
ok('컨텍스트 받기 실패 → 유동성 없음·누락 표시(0 으로 메우지 않음)', () => {
  const rec = recommendEntry(recInput(48), String);
  const d = buildDecision(snap('BTCUSDT', 48), rec, NOW, ST, null);
  assert.equal(d.output.groupScores.liquidity, null);
  assert.ok(d.missing.some((m) => m.includes('받는 중이거나 받기 실패')));
  assert.equal(d.providers.find((p) => p.id === 'stable')!.status, 'missing');
});

console.log(`\nintelPhase2: ${passed}건 통과`);
