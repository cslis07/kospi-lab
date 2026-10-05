import assert from 'node:assert/strict';
import {
  tagOf, pickNews, warNews, todayEvents, buildBriefPrompt, fmtPct, fmtPp, kstTodayStr,
} from '../lib/brief';
import type { NewsItem, CalendarEvent } from '../lib/types';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

const news = (title: string, source = 'X', link = 'https://e/' + encodeURIComponent(title)): NewsItem =>
  ({ title, link, source, category: 'international' });

console.log('brief.ts');

/* ── tagOf ── */
ok('tagOf: 전쟁 키워드 → war', () => {
  assert.equal(tagOf('이스라엘-하마스 분쟁 격화'), 'war');
  assert.equal(tagOf('Russia missile strike on Ukraine'), 'war');
});
ok('tagOf: 유가 → oil', () => assert.equal(tagOf('WTI 유가 배럴당 3% 급등'), 'oil'));
ok('tagOf: 금리 → rate', () => assert.equal(tagOf('美 10년물 국채금리 상승, 연준 발언 주목'), 'rate'));
ok('tagOf: 무관 → null', () => assert.equal(tagOf('삼성전자 신제품 공개'), null));
ok('tagOf: 국가명만 있는 비분쟁 기사는 war 아님', () => {
  assert.notEqual(tagOf('Russia plague: what we know about the suspected lab case'), 'war');
  assert.notEqual(tagOf('러시아, 신규 가스전 개발 발표'), 'war');
});
ok('tagOf: 전쟁+유가 동시면 war 우선', () => assert.equal(tagOf('중동 전쟁으로 유가 급등'), 'war'));

/* ── pickNews ── */
ok('pickNews(coin): 코인·거시 관련만 추리고 무관은 제외', () => {
  const items = [
    news('비트코인 7만 달러 돌파'),
    news('연준 금리 동결 시사'),
    news('유명 배우 결혼 발표'),
    news('WTI 유가 급등'),
  ];
  const r = pickNews(items, 'coin', 8);
  const titles = r.map((n) => n.title);
  assert.ok(titles.includes('비트코인 7만 달러 돌파'));
  assert.ok(titles.includes('연준 금리 동결 시사'));
  assert.ok(titles.includes('WTI 유가 급등'));
  assert.ok(!titles.includes('유명 배우 결혼 발표'));
});
ok('pickNews: 제목 중복 제거', () => {
  const r = pickNews([news('비트코인 급등'), news('비트코인 급등', 'Y')], 'coin');
  assert.equal(r.length, 1);
});
ok('pickNews: limit 적용', () => {
  const items = Array.from({ length: 12 }, (_, i) => news(`비트코인 소식 ${i}`));
  assert.equal(pickNews(items, 'coin', 5).length, 5);
});
ok('pickNews: 태그가 각 항목에 매겨진다', () => {
  const r = pickNews([news('연준 금리 인상 경계')], 'us');
  assert.equal(r[0].tag, 'rate');
});
ok('pickNews(coin): 해외 코인 전문 매체 영어 제목도 잡고, 무관 영어는 제외', () => {
  const items = [
    news('Bitcoin dips below $60K as ETF outflows mount'),
    news('Coinbase lists new token amid DeFi surge'),
    news('Ethereum staking yields climb'),
    news('Apple earnings beat expectations'),       // 코인 무관 → 제외
  ];
  const t = pickNews(items, 'coin', 8).map((n) => n.title);
  assert.ok(t.includes('Bitcoin dips below $60K as ETF outflows mount'));
  assert.ok(t.includes('Coinbase lists new token amid DeFi surge'));
  assert.ok(t.includes('Ethereum staking yields climb'));
  assert.ok(!t.includes('Apple earnings beat expectations'));
});
ok('pickNews(kr): 코스피·환율 관련', () => {
  const r = pickNews([news('코스피 외국인 순매수 전환'), news('비트코인 급등')], 'kr');
  assert.deepEqual(r.map((n) => n.title), ['코스피 외국인 순매수 전환']);
});

/* ── warNews ── */
ok('warNews: 지정학만, limit', () => {
  const items = [news('이란 호르무즈 봉쇄 위협'), news('우크라이나 공습'), news('삼성 실적'), news('중동 긴장 고조')];
  const r = warNews(items, 2);
  assert.equal(r.length, 2);
  assert.ok(r.every((n) => n.tag === 'war'));
});

/* ── todayEvents ── */
const EV: CalendarEvent[] = [
  { date: '2026-10-04', title: '지난 이벤트', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-10-05', title: 'FOMC', category: 'fomc', country: 'US', importance: 'high' },
  { date: '2026-10-06', title: '한국 금통위', category: 'bok', country: 'KR', importance: 'mid' },
  { date: '2026-10-07', title: '글로벌 지표', category: 'indicator', country: 'global', importance: 'mid' },
  { date: '2026-10-20', title: '먼 이벤트', category: 'indicator', country: 'US', importance: 'high' },
];
const NOW = Date.UTC(2026, 9, 5, 0, 0, 0); // 2026-10-05 09:00 KST

ok('kstTodayStr: KST 날짜', () => assert.equal(kstTodayStr(NOW), '2026-10-05'));
ok('todayEvents(us): 오늘~+3일 US·global, 과거·범위밖 제외', () => {
  const r = todayEvents(EV, 'us', 3, NOW).map((e) => e.title);
  assert.deepEqual(r, ['FOMC', '글로벌 지표']);
});
ok('todayEvents(kr): KR·global + high 는 국가 무관 포함', () => {
  const r = todayEvents(EV, 'kr', 3, NOW).map((e) => e.title);
  // FOMC(US high) 는 high 라 포함, 한국 금통위(KR), 글로벌 지표(global)
  assert.ok(r.includes('한국 금통위'));
  assert.ok(r.includes('글로벌 지표'));
  assert.ok(r.includes('FOMC'));
});
ok('todayEvents: 날짜 오름차순', () => {
  const r = todayEvents(EV, 'kr', 3, NOW).map((e) => e.date);
  assert.deepEqual(r, [...r].sort());
});

/* ── buildBriefPrompt ── */
ok('buildBriefPrompt: 시장명·수치·헤드라인·JSON·신호금지 포함', () => {
  const p = buildBriefPrompt(
    'coin',
    [{ key: 'us10y', label: '美 10년물', value: '4.10%', change: 0.03, changeText: '+0.03%p', source: 'FRED' }],
    [{ title: '비트코인 급등', link: 'x', source: 'X', tag: null }],
    [{ title: '중동 전쟁', link: 'y', source: 'Y', tag: 'war' }],
    [{ date: '2026-10-05', title: 'FOMC', importance: 'high', country: 'US' }],
  );
  assert.ok(p.includes('가상자산'));
  assert.ok(p.includes('美 10년물 4.10%'));
  assert.ok(p.includes('비트코인 급등'));
  assert.ok(p.includes('중동 전쟁'));
  assert.ok(p.includes('FOMC'));
  assert.ok(/매수·매도|방향 예측 금지/.test(p));
  assert.ok(p.includes('"headline"') && p.includes('"bullets"'));
});

/* ── 포맷 ── */
ok('fmtPct/fmtPp: 부호·소수', () => {
  assert.equal(fmtPct(1.234), '+1.23%');
  assert.equal(fmtPct(-0.5, 1), '-0.5%');
  assert.equal(fmtPp(0.03), '+0.03%p');
});

console.log(`\n${passed} passed`);
