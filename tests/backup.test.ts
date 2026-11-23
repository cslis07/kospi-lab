/**
 * KL-005 백업·복원 회귀 테스트(lib/backup) — 같은 백업 2회 복원 시 불변(T11), 잘못된 파일은 아무것도 쓰지 않음,
 * 새 형식 거부, 기기 고유 키 제외, v1 하위호환, 미리보기 수치.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import { parseBackup, applyBackup, collectBackup, buildBackupPayload, previewBackup, type KV } from '../lib/backup';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

/** localStorage 흉내 — 넣은 순서 유지 */
function store(init: Record<string, string> = {}): KV & { dump(): Record<string, string> } {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    dump: () => Object.fromEntries(m),
  };
}

const journal = JSON.stringify([{ id: 't1', pnl: -3.2 }, { id: 't2', pnl: 5.1 }]);

console.log('backup — 백업·복원');
ok('내보내기 → 다른 기기로 복원 → 같은 내용(기기 고유 키·다른 앱 키는 제외)', () => {
  const a = store({ 'kospi-lab-journal': journal, 'kospi-lab-watchlist': '["005930"]', 'kospi-lab-sync-meta': '{"x":1}', 'kospi-lab-device-id': 'dev-a', 'other-app': 'keep' });
  const payload = buildBackupPayload(collectBackup(a), new Date('2026-11-23T00:00:00Z'));
  assert.equal(payload.keyCount, 2);
  assert.ok(!('kospi-lab-sync-meta' in payload.keys) && !('kospi-lab-device-id' in payload.keys) && !('other-app' in payload.keys));
  const b = store({ 'kospi-lab-device-id': 'dev-b' });
  applyBackup(parseBackup(JSON.stringify(payload)), b);
  assert.equal(b.getItem('kospi-lab-journal'), journal);
  assert.equal(b.getItem('kospi-lab-device-id'), 'dev-b', '기기 ID 는 복제되지 않음');
});

ok('같은 백업을 2번 복원해도 항목 수·내용 불변(T11)', () => {
  const file = JSON.stringify(buildBackupPayload({ 'kospi-lab-journal': journal, 'kospi-lab-alerts': '[]' }));
  const s = store({ 'kospi-lab-journal': '[]', 'kospi-lab-extra': 'x' });
  applyBackup(parseBackup(file), s);
  const once = s.dump();
  applyBackup(parseBackup(file), s);
  assert.deepEqual(s.dump(), once);
  assert.equal(s.length, 3, '백업에 없는 현재 항목(extra)은 그대로, 중복 없음');
  assert.equal(JSON.parse(s.getItem('kospi-lab-journal')!).length, 2, '매매 기록이 늘지 않음(덮어쓰기)');
});

ok('잘못된 파일은 아무것도 쓰지 않고 거부', () => {
  const s = store({ 'kospi-lab-journal': journal });
  const before = s.dump();
  for (const bad of ['not json', '{}', '{"version":2}', '{"version":2,"keys":[]}', '{"version":2,"keys":{"other":"x"}}', 'null', '{"version":0,"keys":{}}']) {
    assert.throws(() => applyBackup(parseBackup(bad), s), `거부해야 함: ${bad}`);
  }
  assert.deepEqual(s.dump(), before);
});

ok('이 앱보다 새 형식(v3) 백업은 거부', () => {
  assert.throws(() => parseBackup(JSON.stringify({ version: 3, keys: { 'kospi-lab-journal': journal } })), /새 형식/);
});

ok('문자열이 아닌 값·다른 접두사 키는 건너뛰고 개수를 알려 줌', () => {
  const plan = parseBackup(JSON.stringify({ version: 2, keys: { 'kospi-lab-a': '1', 'kospi-lab-b': 2, 'x-c': '3', 'kospi-lab-sync-meta': '{}' } }));
  assert.equal(plan.entries.length, 1);
  assert.equal(plan.skipped, 3);
});

ok('v1 백업(관심종목·가상투자·코인관심) 하위호환', () => {
  const plan = parseBackup(JSON.stringify({ version: 1, watchlist: ['005930'], cryptoWatchlist: ['BTC'] }));
  const s = store();
  applyBackup(plan, s);
  assert.equal(s.getItem('kospi-lab-watchlist'), '["005930"]');
  assert.equal(s.getItem('kospi-lab-crypto-watchlist'), '["BTC"]');
  assert.equal(s.getItem('kospi-lab-virtual'), null);
});

ok('미리보기 — 바뀌는 항목·새 항목 수', () => {
  const plan = parseBackup(JSON.stringify({ version: 2, keys: { 'kospi-lab-a': '1', 'kospi-lab-b': '2', 'kospi-lab-c': '3' } }));
  const pv = previewBackup(plan, store({ 'kospi-lab-a': '1', 'kospi-lab-b': 'old' }));
  assert.deepEqual(pv, { total: 3, changed: 1, added: 1 });
});

console.log(`backup: ${passed}건 통과`);
