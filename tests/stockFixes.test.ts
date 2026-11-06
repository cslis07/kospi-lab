/**
 * 주식 영역 점검 수정 회귀(2026-11-06) — 국내 종목코드 정규식·시세 일괄 20개 분할 fetcher. 실행: npm test
 */
import assert from 'node:assert/strict';
import { KR_CODE_RE } from '../lib/krCode';
import { chunkList, batchFetcher } from '../lib/stockBatch';

let passed = 0;
async function ok(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

(async () => {
  await ok('KR_CODE_RE — 숫자 6자리·영문 섞인 신규 코드 허용, 미국 티커·5/7자리 거부', () => {
    for (const c of ['005930', '0013Y0', '0147B0', '069500']) assert.ok(KR_CODE_RE.test(c), c);
    for (const c of ['AAPL', 'GOOGLE', '00593', '0059300', '005930.KS', '0013y0']) assert.ok(!KR_CODE_RE.test(c), c);
  });

  await ok('chunkList — 20개씩, 나머지 마지막 묶음', () => {
    const xs = Array.from({ length: 45 }, (_, i) => String(i));
    const c = chunkList(xs);
    assert.deepEqual(c.map((x) => x.length), [20, 20, 5]);
    assert.deepEqual(c.flat(), xs);
  });

  await ok('batchFetcher — 45종목 키를 20개씩 3번 요청해 합침(중복 제거, 다른 파라미터 유지)', async () => {
    const calls: string[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      calls.push(url);
      const q = new URLSearchParams(url.split('?')[1]);
      const ts = (q.get('tickers') ?? '').split(',');
      assert.ok(ts.length <= 20, `chunk ${ts.length}`);
      return new Response(JSON.stringify(Object.fromEntries(ts.map((t) => [t, { price: Number(t) }]))));
    }) as typeof fetch;
    try {
      const codes = Array.from({ length: 45 }, (_, i) => String(100000 + i));
      const out = await batchFetcher<{ price: number }>(`/api/stock/batch?tickers=${[...codes, codes[0]].join(',')}`);
      assert.equal(calls.length, 3);
      assert.equal(Object.keys(out).length, 45);
      assert.equal(out['100044'].price, 100044);
      assert.ok(calls.every((u) => u.startsWith('/api/stock/batch?tickers=') && !u.includes('%2C')));
      calls.length = 0;
      await batchFetcher('/api/overseas/batch?symbols=AAPL,MSFT&x=1');
      assert.equal(calls.length, 1);
      assert.ok(calls[0].includes('symbols=AAPL,MSFT') && calls[0].includes('x=1'));
    } finally { globalThis.fetch = orig; }
  });

  await ok('batchFetcher — 한 묶음이라도 실패하면 throw(SWR 이 직전 값 유지)', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response('x', { status: 502 })) as typeof fetch;
    try { await assert.rejects(batchFetcher('/api/stock/batch?tickers=005930')); }
    finally { globalThis.fetch = orig; }
  });

  console.log(`stockFixes: ${passed} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
