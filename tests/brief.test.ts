import assert from 'node:assert/strict';
import {
  tagOf, pickNews, rankNews, newsScore, titleSimilarity, verifyAi, warNews, todayEvents, buildBriefPrompt, fmtPct, fmtPp, kstTodayStr,
} from '../lib/brief';
import { changes, quantile, nextReturns, edgeRows, bucketOf, type Obs } from '../lib/briefEdge';
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
  const topics = ['반감기 일정', '현물 ETF 자금', '채굴 난이도', '거래소 상장', '고래 지갑 이동', '규제 법안 통과', '기관 매수 확대', '해시레이트 기록', '선물 미결제 급증', '스테이블코인 발행'];
  const items = topics.map((t, i) => news(`비트코인 ${t}`, `S${i}`));
  assert.equal(pickNews(items, 'coin', 5).length, 5);
});
ok('rankNews: 한 매체는 최대 3건', () => {
  const topics = ['반감기 일정', '현물 ETF 자금', '채굴 난이도', '거래소 상장', '고래 지갑 이동'];
  const r = rankNews(topics.map((t) => news(`비트코인 ${t}`, 'OneSource')), 'coin', 8);
  assert.equal(r.length, 3);
});
ok('rankNews: 같은 사건을 다룬 비슷한 제목은 하나만', () => {
  const r = rankNews([
    news('SEC approves spot bitcoin ETF options trading', 'CoinDesk'),
    news('SEC approves spot bitcoin ETF options trading today', 'Decrypt'),
    news('Ethereum staking yields climb to record', 'The Block'),
  ], 'coin', 8);
  assert.equal(r.length, 2);
});
ok('rankNews: 신선한 기사·전문 매체가 위로', () => {
  const NOW = Date.UTC(2026, 9, 5, 12);
  const at = (h: number) => new Date(NOW - h * 3600_000).toISOString();
  const r = rankNews([
    { title: 'Bitcoin miners expand capacity', link: 'a', source: 'Unknown', category: 'international', pubDate: at(60) },
    { title: 'Bitcoin ETF inflows hit monthly high', link: 'b', source: 'CoinDesk', category: 'international', pubDate: at(2) },
  ], 'coin', 8, NOW);
  assert.equal(r[0].source, 'CoinDesk');
  assert.ok(r[0].ts != null);
});
ok('newsScore: 생활금융·부동산·보도자료는 노이즈로 제외', () => {
  assert.equal(newsScore(news("주담대 금리 '4.66%' 3년 9개월 만에 최고"), 'kr'), null);
  assert.equal(newsScore(news("'잠실역 초역세권' 빌딩 매각 초읽기...금리상승기 뚫나"), 'kr'), null);
  assert.equal(newsScore(news('Federal Reserve Board announces approval of application by Fleur Capital'), 'us'), null);
  assert.equal(newsScore(news('Here’s what happened in crypto today'), 'coin'), null);
});
ok('newsScore(coin): 코인 언급 없는 국내 거시 기사는 제외, 해외 거시는 포함', () => {
  const kr: NewsItem = { title: '연준 금리 인하 기대에 코스피 반등', link: 'x', source: '머니투데이', category: 'domestic' };
  assert.equal(newsScore(kr, 'coin'), null);
  assert.ok(newsScore(news('Fed signals rate cut as Treasury yields slide', 'CNBC'), 'coin') != null);
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
  { date: '2026-10-06', title: '한국 금통위', category: 'bok', country: 'KR', importance: 'medium' },
  { date: '2026-10-07', title: '글로벌 지표', category: 'indicator', country: 'global', importance: 'medium' },
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
    [{ title: '비트코인 급등', link: 'x', source: 'X', tag: null, ts: null }],
    [{ title: '중동 전쟁', link: 'y', source: 'Y', tag: 'war', ts: null }],
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

ok('tagOf: 기업 재무(treasury SPAC)는 금리 태그 아님, 국채(Treasury yields)는 금리', () => {
  assert.equal(tagOf('An XRP treasury SPAC surges nearly 300%'), null);
  assert.equal(tagOf('Treasury yields climb after jobs data'), 'rate');
});
ok('newsScore(us): 국내 매체 기사는 미국 시장을 다룰 때만', () => {
  const kr = (title: string): NewsItem => ({ title, link: 'x', source: '한국경제', category: 'domestic' });
  assert.equal(newsScore(kr('"삼전닉스만 믿고 있었는데"…실적 전망에 개미들 술렁'), 'us'), null);
  assert.ok(newsScore(kr('뉴욕증시, 금리 부담에 혼조…나스닥 상승'), 'us') != null);
});
ok('rankNews(kr): 시장 고유어 없는 거시 기사는 같은 주제 2건까지', () => {
  const oil = ['Oil swings on Saudi price cut', 'Crude oil tanker rates jump', 'OPEC weighs oil output hike', 'Oil majors boost crude buybacks'];
  const r = rankNews([...oil.map((t, i) => news(t, `B${i}`)), news('코스피 외국인 순매수 전환', '연합뉴스')], 'kr', 8);
  assert.equal(r.filter((n) => n.tag === 'oil').length, 2);
  assert.ok(r.some((n) => n.title.startsWith('코스피')));
});

/* ── AI 수치 대조 ── */
ok('verifyAi: 단위 환산·부분 일치는 불인정, 소수 자름은 인정', () => {
  const ev = '나스닥100 선물 31,228.75 (+0.54%)\nBTC 현물 ETF 순유입 +$190M\nVIX 15.52 (+1.37%)';
  const v = verifyAi('요약', [
    '나스닥100 선물은 31,228(+0.54%)입니다.',          // 소수 자름 → 통과
    'ETF에 $190M이 들어왔습니다.',                       // 표기 그대로 → 통과
    'ETF에 1억 9천만 달러가 들어왔습니다.',              // 환산 → 제외
    '다우가 0.37% 내렸습니다.',                           // 1.37 의 부분 문자열일 뿐 → 제외
  ], ev);
  assert.equal(v.bullets.length, 2);
  assert.equal(v.dropped, 2);
});
ok('verifyAi: 근거에 있는 숫자는 통과, 없는 숫자를 쓴 문장은 제외', () => {
  const ev = '美 10년물 국채금리 5.32% +0.04%p\nWTI 유가(선물) $90.46 -0.71%\nStrategy Posts $21B Q3 Gain';
  const v = verifyAi('금리 5.32%로 상승', ['WTI는 $90.46로 0.71% 내렸습니다.', '비트코인이 12.5% 급등했습니다.', '10년물과 2년물 금리가 함께 올랐습니다.'], ev);
  assert.equal(v.dropped, 1);
  assert.equal(v.bullets.length, 2);
  assert.ok(!v.bullets.some((b) => b.includes('12.5%')));
  assert.equal(v.headline, '금리 5.32%로 상승');
});
ok('verifyAi: 이름 속 숫자(10년물·S&P 500·3일)는 검사하지 않는다', () => {
  const v = verifyAi('S&P 500 선물 강세', ['10년물 금리가 3일 연속 올랐습니다.'], '(수치 없음)');
  assert.equal(v.dropped, 0);
});
ok('verifyAi: 헤드라인 숫자가 근거에 없으면 통과한 첫 문장으로 대체', () => {
  const v = verifyAi('유가 7.7% 폭등', ['유가가 내렸습니다.'], 'WTI $90.46 -0.71%');
  assert.equal(v.headline, '유가가 내렸습니다.');
});
ok('titleSimilarity: 같은 제목 1, 무관 0', () => {
  assert.equal(titleSimilarity('Bitcoin ETF inflows surge', 'Bitcoin ETF inflows surge'), 1);
  assert.equal(titleSimilarity('Bitcoin ETF inflows surge', '삼성전자 실적 발표'), 0);
});

/* ── 과거 통계(briefEdge) ── */
const series = (vals: number[], start = Date.UTC(2025, 0, 1)): Obs[] =>
  vals.map((v, i) => ({ date: new Date(start + i * 86_400_000).toISOString().slice(0, 10), value: v }));

ok('changes: diff 는 값 차이, pct 는 변화율', () => {
  assert.deepEqual(changes(series([4, 4.1, 4.05]), 'diff').map((c) => Math.round(c.ch * 100) / 100), [0.1, -0.05]);
  assert.deepEqual(changes(series([100, 110]), 'pct').map((c) => Math.round(c.ch)), [10]);
});
ok('quantile: 선형 보간', () => {
  assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(quantile([0, 10], 0.2), 2);
});
ok('nextReturns: 요인 날짜보다 뒤인 첫 결과 거래일 수익률(미래 누설 없음) + 장중 수익률', () => {
  const factor = [{ date: '2025-01-02', ch: 1 }, { date: '2025-01-03', ch: -1 }];
  const target: Obs[] = [
    { date: '2025-01-02', value: 100, open: 100 },
    { date: '2025-01-03', value: 110, open: 108 },   // 01-02 요인의 결과
    { date: '2025-01-06', value: 99, open: 110 },    // 01-03 요인의 결과(주말 건너뜀)
  ];
  const r = nextReturns(factor, target);
  assert.equal(r.length, 2);
  assert.ok(Math.abs(r[0].ret - 10) < 1e-9);
  assert.ok(Math.abs((r[0].intra as number) - (110 / 108 - 1) * 100) < 1e-9);
  assert.ok(Math.abs(r[1].ret - (99 / 110 - 1) * 100) < 1e-9);
});
ok('nextReturns: 결과 데이터가 끝나면 그 요인은 버린다', () => {
  const r = nextReturns([{ date: '2025-01-03', ch: 1 }], series([1, 2, 3])); // 결과 마지막 날 = 01-03
  assert.equal(r.length, 0);
});
ok('edgeRows: 요인과 무관한 결과 → 우연 범위', () => {
  // 결정적 의사난수(시드 고정)
  let s = 42; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const pairs = Array.from({ length: 600 }, (_, i) => ({ date: String(i), ch: rnd() - 0.5, ret: rnd() - 0.48 }));
  const rows = edgeRows({ key: 'f', label: 'F', unit: '%' }, pairs);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.verdict === 'noise'), JSON.stringify(rows.map((r) => r.z)));
  assert.ok(rows.every((r) => r.n >= 100 && r.n <= 140)); // 상·하위 20%
});
ok('edgeRows: 요인이 결과를 실제로 끌면 → 유의, 급등/급락 방향 반대', () => {
  let s = 7; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const pairs = Array.from({ length: 600 }, (_, i) => { const ch = rnd() - 0.5; return { date: String(i), ch, ret: ch * 2 + (rnd() - 0.5) * 0.6 }; });
  const [surge, drop] = edgeRows({ key: 'f', label: 'F', unit: '%' }, pairs);
  assert.equal(surge.verdict, 'significant'); assert.equal(drop.verdict, 'significant');
  assert.ok(surge.diff > 0 && drop.diff < 0);
  assert.equal(bucketOf(surge.threshold + 0.01, [surge, drop]), 'surge');
  assert.equal(bucketOf(drop.threshold - 0.01, [surge, drop]), 'drop');
  assert.equal(bucketOf(0, [surge, drop]), 'normal');
});
ok('edgeRows: 종가 기준은 유의해도 장중(시가→종가)은 우연이면 intra=noise (갭에 반영)', () => {
  let s = 99; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const pairs = Array.from({ length: 600 }, (_, i) => { const ch = rnd() - 0.5; return { date: String(i), ch, ret: ch * 2 + (rnd() - 0.5) * 0.6, intra: rnd() - 0.5 }; });
  const [surge] = edgeRows({ key: 'f', label: 'F', unit: '%' }, pairs);
  assert.equal(surge.verdict, 'significant');
  assert.equal(surge.intra?.verdict, 'noise');
});
ok('edgeRows: 표본 50 미만이면 통계 없음', () => {
  assert.equal(edgeRows({ key: 'f', label: 'F', unit: '%' }, Array.from({ length: 30 }, (_, i) => ({ date: String(i), ch: i, ret: 1 }))).length, 0);
});

console.log(`\n${passed} passed`);
