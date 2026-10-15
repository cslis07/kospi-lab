import assert from 'node:assert/strict';
import { nfAllowed, nfUpstreamUrl, NF_BASE } from '../lib/nf';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

console.log('nf (Nowflation 중계 허용/URL)');

ok('최상위 data json 허용', () => {
  assert.equal(nfAllowed('realtime.json'), true);
  assert.equal(nfAllowed('nowcast_latest.json'), true);
  assert.equal(nfAllowed('grocery_basket.json'), true);
  assert.equal(nfAllowed('series_bls_ap_eggs.json'), true);
});

ok('허용 접두(forecasts/geo/og) 하위 허용', () => {
  assert.equal(nfAllowed('forecasts/2026-09.json'), true);
  assert.equal(nfAllowed('forecasts/index.json'), true);
  assert.equal(nfAllowed('geo/states.json'), true);
  assert.equal(nfAllowed('og/card.json'), true);
});

ok('확장자·파일명 규칙', () => {
  assert.equal(nfAllowed('realtime.txt'), false);     // .json 아님
  assert.equal(nfAllowed('realtime'), false);         // 확장자 없음
  assert.equal(nfAllowed('.json'), false);            // 베이스 빈 문자열
  assert.equal(nfAllowed('bad name.json'), false);    // 공백
  assert.equal(nfAllowed('a/b.json'), false);         // 허용 안 된 접두
});

ok('경로 조작 차단', () => {
  assert.equal(nfAllowed('../secret.json'), false);           // .. 포함
  assert.equal(nfAllowed('forecasts/../x.json'), false);      // .. 포함
  assert.equal(nfAllowed('a/b/c.json'), false);               // 슬래시 2개
  assert.equal(nfAllowed('forecasts/sub/x.json'), false);     // 슬래시 2개
});

ok('URL 매핑 — 최상위는 /data/, 접두는 그대로', () => {
  assert.equal(nfUpstreamUrl('realtime.json'), `${NF_BASE}/data/realtime.json`);
  assert.equal(nfUpstreamUrl('forecasts/index.json'), `${NF_BASE}/forecasts/index.json`);
  assert.equal(nfUpstreamUrl('geo/states.json'), `${NF_BASE}/geo/states.json`);
});

console.log(`nf: ${passed} passed\n`);
