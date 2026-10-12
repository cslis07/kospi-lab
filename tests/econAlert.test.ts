import assert from 'node:assert/strict';
import { computeHeadline, formatAlert, isFresh, type Obs, type EconCfg } from '../lib/econAlert';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

console.log('econAlert.ts');

// 지수 25개월: 전월·전년대비 모두(이전값 포함) 계산 가능하게
const idxObs: Obs[] = Array.from({ length: 25 }, (_, i) => ({ date: `20${24 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`, value: 100 + i })); // 100..124

ok('index: 전월대비·전년대비 계산(이전값 포함)', () => {
  const cfg: EconCfg = { id: 'cpi', name: 'CPI', fred: 'X', kind: 'index', show: ['yoy', 'mom'], releasesId: 'cpi-733' };
  const h = computeHeadline(idxObs, cfg)!;
  assert.equal(h.refDate, idxObs[idxObs.length - 1].date);
  const yoy = h.lines.find((l) => l.label === '전년대비')!;
  const mom = h.lines.find((l) => l.label === '전월대비')!;
  // 최신 124 vs 12개월전 112 → +10.7% / 전월 123 → +0.8%
  assert.equal(yoy.cur, '10.7%');
  assert.equal(mom.cur, '0.8%');
  assert.ok(yoy.prev && mom.prev); // 이전값도 존재
  assert.ok(yoy.chg && yoy.chg.endsWith('%p'));
});

ok('level(건수): 결과 K·이전·변화', () => {
  const cfg: EconCfg = { id: 'initial', name: '신규실업청구', fred: 'ICSA', kind: 'level', show: [], releasesId: 'x' };
  const h = computeHeadline([{ date: '2026-10-01', value: 220000 }, { date: '2026-10-08', value: 216000 }], cfg)!;
  assert.equal(h.lines[0].cur, '216K');
  assert.equal(h.lines[0].prev, '220K');
  assert.equal(h.lines[0].chg, '-4K');
});

ok('관측치 2개 미만이면 null', () => {
  assert.equal(computeHeadline([{ date: '2026-10-08', value: 1 }], { id: 'x', name: 'x', fred: 'x', kind: 'level', show: [], releasesId: 'x' }), null);
});

ok('isFresh: window 이내만 true', () => {
  const now = Date.parse('2026-10-14T20:00:00Z');
  assert.equal(isFresh('2026-10-14 08:37:49-05', 26, now), true);   // ~6h 전
  assert.equal(isFresh('2026-10-11 08:37:49-05', 26, now), false);  // 3일 전
});

ok('formatAlert: 지표명·결과·딥링크 포함', () => {
  const cfg: EconCfg = { id: 'cpi', name: '미국 소비자물가 (CPI)', fred: 'X', kind: 'index', show: ['yoy'], releasesId: 'cpi-733' };
  const h = computeHeadline(idxObs, cfg)!;
  const msg = formatAlert([{ cfg, h }], 'https://kospi-lab.vercel.app');
  assert.ok(msg.includes('미국 소비자물가 (CPI)'));
  assert.ok(msg.includes('전년대비'));
  assert.ok(msg.includes('/releases?id=cpi-733'));
  assert.ok(msg.includes('매매 신호 아님'));
});

console.log(`\n${passed} passed`);
