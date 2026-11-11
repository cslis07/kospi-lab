import assert from 'node:assert/strict';
import { computeHeadline, formatAlert, isFresh, consensusFor, withConsensus, type Obs, type EconCfg, type CalEst } from '../lib/econAlert';

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

const cal: CalEst[] = [
  { date: '2026-11-10 13:30:00', country: 'US', event: 'Inflation Rate MoM (Oct)', estimate: 0.3 },
  { date: '2026-11-10 13:30:00', country: 'US', event: 'Core Inflation Rate MoM (Oct)', estimate: 0.2 },
  { date: '2026-11-10 07:00:00', country: 'DE', event: 'Inflation Rate MoM (Oct)', estimate: 0.1 },
  { date: '2026-11-12 13:30:00', country: 'US', event: 'Initial Jobless Claims (Nov/07)', estimate: 195 },
  { date: '2026-11-19 13:30:00', country: 'US', event: 'Initial Jobless Claims (Nov/14)', estimate: null },
];
const cpiCfg: EconCfg = { id: 'cpi', name: '미국 소비자물가 (CPI)', fred: 'CPIAUCSL', kind: 'index', show: ['mom'], releasesId: 'cpi-69' };
const icsaCfg: EconCfg = { id: 'initial', name: '미국 신규 실업수당청구', fred: 'ICSA', kind: 'level', show: [], releasesId: 'x' };

ok('예상치 찾기: 지표·월(주)·국가가 맞는 것만', () => {
  assert.equal(consensusFor(cal, cpiCfg, '2026-10-01'), 0.3);
  assert.equal(consensusFor(cal, cpiCfg, '2026-09-01'), null);          // 다른 달
  assert.equal(consensusFor(cal, icsaCfg, '2026-11-07'), 195);
  assert.equal(consensusFor(cal, icsaCfg, '2026-11-14'), null);         // 예상치 비어 있음
  assert.equal(consensusFor(cal, { ...cpiCfg, id: 'unknown' }, '2026-10-01'), null);
  assert.equal(consensusFor(undefined, cpiCfg, '2026-10-01'), null);
});

ok('예상 대비: 전월대비는 %p, 건수는 K — 메시지에 표시', () => {
  const h = computeHeadline([{ date: '2026-09-01', value: 100 }, { date: '2026-10-01', value: 100.4 }], cpiCfg)!;   // +0.4%
  const w = withConsensus(h, cpiCfg, cal);
  assert.equal(w.lines[0].est, '0.3%'); assert.equal(w.lines[0].vsEst, '+0.1%p');
  const k = withConsensus(computeHeadline([{ date: '2026-10-31', value: 189000 }, { date: '2026-11-07', value: 191000 }], icsaCfg)!, icsaCfg, cal);
  assert.equal(k.lines[0].est, '195K'); assert.equal(k.lines[0].vsEst, '-4K');
  const msg = formatAlert([{ cfg: cpiCfg, h: w }], 'https://x');
  assert.ok(msg.includes('예상 0.3%') && msg.includes('예상 대비 +0.1%p') && msg.includes('예상치 Nowflation'));
});

ok('예상치가 없으면 메시지는 예전 그대로', () => {
  const h = computeHeadline([{ date: '2026-08-01', value: 100 }, { date: '2026-09-01', value: 100.4 }], cpiCfg)!;
  const w = withConsensus(h, cpiCfg, cal);
  assert.equal(w.lines[0].est, undefined);
  const msg = formatAlert([{ cfg: cpiCfg, h: w }], 'https://x');
  assert.ok(!msg.includes('예상') && msg.includes('출처 FRED · 발표 직후 자동'));
});

console.log(`\n${passed} passed`);
