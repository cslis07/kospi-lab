/**
 * KL-014 글자 크기 부채 회귀 테스트 — 화면 코드(app·components)에 11px 미만 하드코딩(text-[8~10.5px])이 다시 생기지 않게.
 * 대신 의미 토큰 text-cap(11px) · text-cap-pc(폰 11 / PC 12px, app/globals.css @utility)을 쓴다.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
const ROOT = join(__dirname, '..');
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.(tsx|ts)$/.test(f) ? [p] : [];
});
const SMALL = /text-\[(?:[0-9]|10)(?:\.\d+)?px\]/g;

console.log('typography — 11px 미만 하드코딩 금지');
ok('app·components 에 text-[<11px] 0개', () => {
  const bad: string[] = [];
  for (const f of [...files(join(ROOT, 'app')), ...files(join(ROOT, 'components'))]) {
    const m = readFileSync(f, 'utf8').match(SMALL);
    if (m) bad.push(`${relative(ROOT, f)} (${m.length})`);
  }
  assert.deepEqual(bad, [], `11px 미만 하드코딩: ${bad.join(', ')} — text-cap / text-cap-pc 를 쓰세요`);
});
ok('토큰 정의가 globals.css 에 있음(text-cap 11px · text-cap-pc 11→12px)', () => {
  const css = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');
  assert.match(css, /@utility text-cap \{ font-size: 11px; \}/);
  assert.match(css, /@utility text-cap-pc \{[\s\S]*?font-size: 11px;[\s\S]*?min-width: 1024px\) \{ font-size: 12px; \}/);
});
console.log(`typography: ${passed}건 통과`);
