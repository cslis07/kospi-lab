/** 새 배포 감지(lib/appVersion) — 확인 간격·버전 비교·무한 새로고침 방지·전체 이동으로 바꿀 클릭 판별 */
import assert from 'node:assert/strict';
import { shouldCheck, parseVersion, decide, isPlainInternalNav, CHECK_GAP_MS } from '../lib/appVersion';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

ok('확인 간격 5분', () => {
  assert.equal(shouldCheck(0, CHECK_GAP_MS), true);
  assert.equal(shouldCheck(1000, 1000 + CHECK_GAP_MS - 1), false);
});
ok('응답 모양 검사', () => {
  assert.equal(parseVersion({ v: 'abc1234' }), 'abc1234');
  assert.equal(parseVersion({ v: '' }), null);
  assert.equal(parseVersion({ v: 123 }), null);
  assert.equal(parseVersion(null), null);
  assert.equal(parseVersion({ v: 'x'.repeat(81) }), null);
});
ok('같음 / 새 버전 / 같은 새 버전으로 이미 새로고침함(더 안 함) / 버전 없음(감시 끔)', () => {
  assert.equal(decide('aaaa1111', 'aaaa1111', null), 'same');
  assert.equal(decide('aaaa1111', 'bbbb2222', null), 'stale');
  assert.equal(decide('aaaa1111', 'bbbb2222', 'bbbb2222'), 'blocked');
  assert.equal(decide('aaaa1111', 'cccc3333', 'bbbb2222'), 'stale');   // 그 뒤 또 배포 → 다시 한 번
  assert.equal(decide('', 'bbbb2222', null), 'off');
  assert.equal(decide('aaaa1111', null, null), 'off');
});

const loc = { origin: 'https://kospi-lab.vercel.app', pathname: '/coins', search: '' };
const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
const a = (href: string, over: Partial<{ target: string; hasDownload: boolean }> = {}) => ({ href, target: '', hasDownload: false, ...over });
ok('평범한 왼쪽 클릭으로 다른 화면 → 전체 이동으로 바꿈', () => {
  assert.equal(isPlainInternalNav(click, a('https://kospi-lab.vercel.app/coin-analysis?symbol=BTCUSDT'), loc), true);
  assert.equal(isPlainInternalNav(click, a('/review'), loc), true);
});
ok('새 탭·수정키·가운데 클릭·다운로드·외부·API·같은 화면 #앵커·이미 처리된 클릭은 그대로', () => {
  assert.equal(isPlainInternalNav({ ...click, ctrlKey: true }, a('/review'), loc), false);
  assert.equal(isPlainInternalNav({ ...click, metaKey: true }, a('/review'), loc), false);
  assert.equal(isPlainInternalNav({ ...click, button: 1 }, a('/review'), loc), false);
  assert.equal(isPlainInternalNav({ ...click, defaultPrevented: true }, a('/review'), loc), false);
  assert.equal(isPlainInternalNav(click, a('/review', { target: '_blank' }), loc), false);
  assert.equal(isPlainInternalNav(click, a('/review', { hasDownload: true }), loc), false);
  assert.equal(isPlainInternalNav(click, a('https://m.blog.naver.com/x'), loc), false);
  assert.equal(isPlainInternalNav(click, a('/api/version'), loc), false);
  assert.equal(isPlainInternalNav(click, a('/coins#etf'), loc), false);
  assert.equal(isPlainInternalNav(click, a('/coins?tab=2'), loc), true); // 같은 경로라도 쿼리가 다르면 다른 화면
});

console.log(`\nappVersion: ${passed}건 통과`);
