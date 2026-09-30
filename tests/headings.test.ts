/**
 * 화면당 h1 1개 규칙 회귀 테스트 — 헤더(sr-only h1)와 본문 h1이 겹치거나 둘 다 빠지지 않게.
 * lib/menu.ts OWN_H1_ROUTES 목록을 app/ 의 실제 page.tsx 와 대조한다.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { OWN_H1_ROUTES, pageOwnsH1 } from '../lib/menu';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

const APP = join(__dirname, '..', 'app');
function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'api' ? [] : pages(p);
    return f === 'page.tsx' ? [p] : [];
  });
}
/** app/stock/[ticker]/page.tsx → /stock/x (동적 세그먼트는 임의 값) */
const routeOf = (file: string) =>
  '/' + relative(APP, file).split(sep).slice(0, -1).map((s) => (s.startsWith('[') ? 'x' : s)).join('/');

const all = pages(APP).map((f) => ({ route: routeOf(f), hasH1: /<h1[\s>]/.test(readFileSync(f, 'utf8')) }));

ok('본문에 h1이 있는 페이지는 전부 OWN_H1_ROUTES에 등록돼 있다(헤더와 중복 방지)', () => {
  const missing = all.filter((p) => p.hasH1 && !pageOwnsH1(p.route)).map((p) => p.route);
  assert.deepEqual(missing, []);
});

ok('OWN_H1_ROUTES에 등록된 페이지는 실제로 본문 h1이 있다(h1 0개 방지)', () => {
  const stale = all.filter((p) => !p.hasH1 && pageOwnsH1(p.route)).map((p) => p.route);
  assert.deepEqual(stale, []);
});

ok('목록 페이지와 상세 접두사를 구분한다', () => {
  assert.equal(pageOwnsH1('/overseas'), false);
  assert.equal(pageOwnsH1('/overseas/AAPL'), true);
  assert.equal(pageOwnsH1('/overseas-analysis'), true);
  assert.equal(pageOwnsH1('/stock/005930'), true);
  assert.equal(pageOwnsH1('/'), false);
  assert.ok(OWN_H1_ROUTES.length > 0);
});

console.log(`\n${passed} passed`);
