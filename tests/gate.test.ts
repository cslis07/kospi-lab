/**
 * KL-003 게이트 회귀 테스트 — 개인 데이터·과금·발송 기능을 쓰는 API 라우트가 반드시 보호되는지 정적으로 확인한다.
 * 보호 = middleware matcher 에 포함 · 또는 라우트 안에서 CRON_SECRET / isAuthorizedRequest 로 직접 확인.
 * 새 라우트를 만들고 matcher 에 넣는 것을 잊으면 여기서 실패한다. 공개로 두는 예외는 아래 PUBLIC_OK 에 이유와 함께 적는다.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

const ROOT = join(__dirname, '..');
const API = join(ROOT, 'app', 'api');

/** 개인 데이터(거래소 서명·동기화 DB)·실과금 AI·텔레그램 발송을 쓰는 표시 */
const SENSITIVE = [
  /bitgetSignedGet/, /SUPABASE_SERVICE_ROLE_KEY/,
  // 이 lib 들은 안에서 거래소 서명·실과금 AI·텔레그램을 쓴다(lib/bitget 은 공개 시세도 있어 bitgetSignedGet 으로만 본다)
  /from '@\/lib\/(anthropic|guard|bitgetFills|bitgetPositions|bitgetJournal|econAlert)'/,
  /ANTHROPIC_API_KEY|@anthropic-ai\/sdk|api\.anthropic\.com/, /runGuard|sendTelegram/,
];
/** 공개로 두는 예외 — 개인 데이터 없음 + 무료 한도·캐시로 보호 */
const PUBLIC_OK: Record<string, string> = {};

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return routes(p);
    return f === 'route.ts' ? [p] : [];
  });
}
const urlOf = (file: string) => '/api/' + relative(API, file).split(sep).slice(0, -1).join('/');

// middleware matcher — 문자열로 읽는다(테스트에서 Next 런타임을 띄우지 않게)
const mw = readFileSync(join(ROOT, 'middleware.ts'), 'utf8');
const matcherBlock = mw.slice(mw.indexOf('matcher:'));
const matchers = [...matcherBlock.matchAll(/'(\/api\/[^']+)'/g)].map((m) => m[1]);
const gated = (url: string) => matchers.some((m) => (m.endsWith('/:path*') ? url === m.slice(0, -7) || url.startsWith(m.slice(0, -6)) : url === m));

console.log('gate — 개인·과금 라우트 보호');
ok(`matcher 읽기(${matchers.length}개)`, () => assert.ok(matchers.length >= 8 && matchers.includes('/api/sync') && matchers.includes('/api/bitget/:path*')));
ok('matcher 해석 — 하위 경로 포함·다른 경로 제외', () => { assert.ok(gated('/api/bitget/positions') && gated('/api/nf/bundle') && !gated('/api/brief') && !gated('/api/bitgetx')); });

const files = routes(API);
const unprotected: string[] = [];
const sensitive: string[] = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const url = urlOf(f);
  if (!SENSITIVE.some((re) => re.test(src))) continue;
  sensitive.push(url);
  const selfChecked = /CRON_SECRET/.test(src) || /isAuthorizedRequest\(/.test(src);
  if (gated(url) || selfChecked || PUBLIC_OK[url]) continue;
  unprotected.push(url);
}
ok(`전체 ${files.length}개 중 민감 라우트 ${sensitive.length}개 — 보호 안 된 것 0개`, () => {
  assert.ok(sensitive.length >= 15, `민감 표시 탐지가 너무 적음(${sensitive.length}) — 정규식 점검`);
  assert.ok(sensitive.includes('/api/sync') && sensitive.includes('/api/guard'));
  assert.deepEqual(unprotected, [], `보호 없음: ${unprotected.join(', ')}`);
});

ok('/api/sync 는 게이트 + 라우트 자체 확인 둘 다', () => {
  const src = readFileSync(join(API, 'sync', 'route.ts'), 'utf8');
  assert.ok(gated('/api/sync'));
  assert.equal((src.match(/isAuthorizedRequest\(req\)/g) ?? []).length, 2, 'GET·POST 모두 확인');
  assert.ok(/private, no-store|NO_STORE/.test(src));
});

ok('Bitget 서명 요청은 GET 만 — 주문·출금 등 쓰기 호출 코드 없음(KL-004)', () => {
  const lib = readFileSync(join(ROOT, 'lib', 'bitget.ts'), 'utf8');
  assert.ok(/sign\(timestamp, 'GET'/.test(lib));
  assert.ok(!/sign\(timestamp, 'POST'|method:\s*'POST'/.test(lib), 'bitget.ts 에 POST 서명 없음');
  const all = files.map((f) => readFileSync(f, 'utf8')).join('\n') + readdirSync(join(ROOT, 'lib')).filter((f) => f.endsWith('.ts')).map((f) => readFileSync(join(ROOT, 'lib', f), 'utf8')).join('\n');
  for (const bad of ['/order/place-order', '/order/batch-place-order', '/order/cancel-order', '/order/close-positions', '/account/set-leverage', '/wallet/withdrawal', '/wallet/transfer']) {
    assert.ok(!all.includes(bad), `쓰기 엔드포인트 발견: ${bad}`);
  }
});

ok('브라우저 번들 공개 환경변수(NEXT_PUBLIC_*)에 비밀 이름 없음(KL-004)', () => {
  const names = new Set<string>();
  const scan = (dir: string) => readdirSync(dir).forEach((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (!['node_modules', '.next', '.git'].includes(f)) scan(p); return; }
    if (/\.(ts|tsx|js|mjs)$/.test(f)) for (const m of readFileSync(p, 'utf8').matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) names.add(m[0]);
  });
  ['app', 'components', 'lib', 'hooks'].forEach((d) => scan(join(ROOT, d)));
  const bad = [...names].filter((n) => /KEY|SECRET|TOKEN|PASS|PRIVATE/.test(n));
  assert.deepEqual(bad, [], `비밀처럼 보이는 공개 변수: ${bad.join(', ')}`);
});

console.log(`gate: ${passed}건 통과`);
