/**
 * 공용 fetcher(lib/fetcher) — 실패가 데이터로 새지 않는지(KL-012 후속).
 * jsonFetcher: 2xx 만 데이터, 나머지 예외(ApiError.message = 본문 error) · gatedJsonFetcher: 401 은 {locked:true} 데이터, 그 밖 실패는 예외.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import { jsonFetcher, gatedJsonFetcher, ApiError } from '../lib/fetcher';

let passed = 0;
async function ok(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
const realFetch = globalThis.fetch;
function mock(status: number, body: unknown, html = false) {
  globalThis.fetch = (async () => new Response(html ? '<html>err</html>' : JSON.stringify(body), { status, headers: { 'content-type': html ? 'text/html' : 'application/json' } })) as typeof fetch;
}

(async () => {
  console.log('fetcher — 실패를 데이터로 받지 않기');
  await ok('jsonFetcher 200 → 데이터', async () => { mock(200, { cards: [1] }); assert.deepEqual(await jsonFetcher('/x'), { cards: [1] }); });
  await ok('jsonFetcher 503 {error} → ApiError(메시지 = 본문 error)', async () => {
    mock(503, { error: 'down' });
    await assert.rejects(() => jsonFetcher('/x'), (e: unknown) => e instanceof ApiError && e.status === 503 && e.message === 'down');
  });
  await ok('jsonFetcher 502 HTML → ApiError(서버 오류)', async () => {
    mock(502, null, true);
    await assert.rejects(() => jsonFetcher('/x'), (e: unknown) => e instanceof ApiError && /서버 오류/.test(e.message));
  });
  await ok('gatedJsonFetcher 401 → { locked: true, …본문 } 데이터(잠금 안내 경로 유지)', async () => {
    mock(401, { locked: true, error: '인증이 필요합니다.' });
    const d = await gatedJsonFetcher('/api/nf/x.json') as { locked: boolean; error: string };
    assert.equal(d.locked, true); assert.equal(d.error, '인증이 필요합니다.');
  });
  await ok('gatedJsonFetcher 401 본문 없음도 locked', async () => { mock(401, null, true); assert.equal((await gatedJsonFetcher('/x') as { locked: boolean }).locked, true); });
  await ok('gatedJsonFetcher 500 → 예외(직전 값 유지되게)', async () => {
    mock(500, { error: 'boom' });
    await assert.rejects(() => gatedJsonFetcher('/x'), (e: unknown) => e instanceof ApiError && e.message === 'boom');
  });
  await ok('gatedJsonFetcher 200 {configured:false} → 데이터 그대로', async () => { mock(200, { configured: false }); assert.deepEqual(await gatedJsonFetcher('/x'), { configured: false }); });
  globalThis.fetch = realFetch;
  console.log(`fetcher: ${passed}건 통과`);
})().catch((e) => { globalThis.fetch = realFetch; console.error(e); process.exit(1); });
