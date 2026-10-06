import assert from 'node:assert/strict';
import { readMacroBias, macroPromptBlock } from '../lib/coinMacroContext';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

console.log('coinMacroContext.ts');

/* ── 같은 방향 = 뚜렷한 바람 ── */
ok('10Y↑·DXY↑·실질금리↑ → 숏 우호(맞바람), 강도 강', () => {
  const c = readMacroBias({ us10ChangePp: 0.05, dxyChangePct: 0.4, realYieldChangePp: 0.04 });
  assert.equal(c.bias, 'short');
  assert.equal(c.strength, '강');
  assert.equal(c.votes.riskOff, 3);
  assert.ok(c.headline.includes('맞바람'));
});
ok('10Y↓·DXY↓·실질금리↓ → 롱 우호(순풍), 강도 강', () => {
  const c = readMacroBias({ us10ChangePp: -0.06, dxyChangePct: -0.3, realYieldChangePp: -0.05 });
  assert.equal(c.bias, 'long');
  assert.equal(c.strength, '강');
  assert.equal(c.votes.riskOn, 3);
  assert.ok(c.headline.includes('순풍'));
});

/* ── 둘만 일치(실질금리 없음)도 방향 ── */
ok('실질금리 null·10Y↑·DXY↑ → 숏 우호, 강도 보통', () => {
  const c = readMacroBias({ us10ChangePp: 0.03, dxyChangePct: 0.2, realYieldChangePp: null });
  assert.equal(c.bias, 'short');
  assert.equal(c.strength, '보통');
  assert.equal(c.dirs.realYield, 'flat');
});

/* ── 엇갈림 ── */
ok('10Y↑·DXY↓ → 엇갈림(mixed)', () => {
  const c = readMacroBias({ us10ChangePp: 0.05, dxyChangePct: -0.3, realYieldChangePp: null });
  assert.equal(c.bias, 'mixed');
  assert.ok(c.headline.includes('엇갈림') || c.headline.includes('확인'));
});
ok('riskOff·riskOn 공존이면 mixed (한 쪽만 강해도 반대표 있으면 중립)', () => {
  const c = readMacroBias({ us10ChangePp: 0.05, dxyChangePct: 0.3, realYieldChangePp: -0.05 });
  assert.equal(c.bias, 'mixed');
});

/* ── 문턱 이하 = flat ── */
ok('작은 변화는 flat → 변화 없음', () => {
  const c = readMacroBias({ us10ChangePp: 0.005, dxyChangePct: 0.05, realYieldChangePp: 0.001 });
  assert.equal(c.dirs.us10, 'flat');
  assert.equal(c.dirs.dxy, 'flat');
  assert.equal(c.bias, 'mixed');
  assert.equal(c.votes.known, 0);
  assert.ok(c.headline.includes('변화 없음'));
});

/* ── 전부 null ── */
ok('전부 null → 변화 없음, 신호 없음', () => {
  const c = readMacroBias({ us10ChangePp: null, dxyChangePct: null, realYieldChangePp: null });
  assert.equal(c.bias, 'mixed');
  assert.equal(c.votes.known, 0);
});

/* ── 프롬프트 블록 ── */
ok('macroPromptBlock: 수치 라인 + 판정 + "신호 아님" 포함', () => {
  const c = readMacroBias({ us10ChangePp: 0.05, dxyChangePct: 0.4, realYieldChangePp: 0.04 });
  const block = macroPromptBlock(c, ['美 10년물 국채금리: 4.20% (+0.05%p)', '달러인덱스(DXY): 104.5 (+0.40%)']);
  assert.ok(block.includes('4.20%'));
  assert.ok(block.includes('판정:'));
  assert.ok(block.includes('신호'));
});
ok('macroPromptBlock: 수치 비면 안내', () => {
  const c = readMacroBias({ us10ChangePp: null, dxyChangePct: null, realYieldChangePp: null });
  assert.ok(macroPromptBlock(c, []).includes('수집 실패'));
});

console.log(`\n${passed} passed`);
