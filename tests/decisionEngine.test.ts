/**
 * 의사결정 엔진(lib/intel/decisionEngine) — 첨부 프로토타입 테스트 11건 이식 + 결측·오류 케이스 추가. 합성 입력.
 */
import assert from 'node:assert/strict';
import { evaluateDecision, activeBlock, type EngineInput, type SignalObservation, type ProposedSetup, type Group, type Direction } from '../lib/intel/decisionEngine';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

const t = '2026-11-13T12:00:00Z';
const mk = (group: Group, id: string, direction: Direction = 1, family = id, at = t): SignalObservation =>
  ({ id, group, family, direction, strength: 0.8, reliability: 0.9, availableAt: at, maxAgeMinutes: 180, source: 'fixture', sourceUrl: 'https://example.org/data', explanation: '합성 테스트 입력' });
const long: ProposedSetup = { side: 'long', strategy: 'pullback', entry: 100, zoneLow: 99.8, zoneHigh: 100.2, stop: 98, target1: 105, target2: 108, triggerConfirmed: true, triggerDescription: '15분봉 마감 재확인', basis: ['지지·거래량'] };
const short: ProposedSetup = { side: 'short', strategy: 'pullback', entry: 110, zoneLow: 109.8, zoneHigh: 110.2, stop: 113, target1: 103, target2: 100, triggerConfirmed: true, triggerDescription: '저항 확인', basis: ['저항·거래량'] };
const base = (): EngineInput => ({
  asOf: t, symbol: 'ETHUSDT', price: 102,
  observations: [mk('macro', 'm'), mk('liquidity', 'l'), mk('derivatives', 'd'), mk('technical', 't'), mk('news', 'n')],
  events: [], setups: [long, short], equityUsd: 5000, riskPerTradePct: 0.5, maxLeverage: 3, feeBpsRoundTrip: 12, slippageBpsRoundTrip: 8, minNetRR: 1.6,
});

console.log('원본 테스트(이식)');
ok('충분한 실험용 데이터와 트리거에서 READY', () => {
  const r = evaluateDecision(base());
  assert.equal(r.status, 'READY'); assert.equal(r.bias, 'LONG_CONTEXT'); assert.equal(r.selected!.side, 'long');
  assert.ok(r.selected!.rr1Net! > 1.6); assert.ok(r.selected!.modeledMaxLossUsd! <= 25.01);
});
ok('트리거 미확인시 WATCH', () => {
  const x = base(); x.setups = [{ ...long, triggerConfirmed: false }];
  const r = evaluateDecision(x); assert.equal(r.status, 'WATCH'); assert.equal(r.selected!.valid, false);
});
ok('CPI 30분 전 안전모드', () => {
  const x = base(); x.events = [{ id: 'CPI', name: '미국 CPI', type: 'macro_release', severity: 'critical', scheduledAt: '2026-11-13T12:30:00Z', verified: true }];
  assert.equal(evaluateDecision(x).status, 'BLOCKED');
});
ok('전쟁 속보 안전모드', () => {
  const x = base(); x.events = [{ id: 'geo', name: '지정학 속보', type: 'geopolitical', severity: 'critical', blockUntil: '2026-11-13T13:00:00Z', verified: false }];
  assert.equal(evaluateDecision(x).status, 'BLOCKED');
});
ok('기술적 입력 없으면 거래 보류', () => {
  const x = base(); x.observations = x.observations.filter((s) => s.group !== 'technical');
  assert.equal(evaluateDecision(x).status, 'BLOCKED');
});
ok('발표 전 데이터는 사용하지 않음', () => {
  const x = base(); x.observations = x.observations.map((s) => (s.group === 'macro' ? { ...s, availableAt: '2026-11-13T12:01:00Z' } : s));
  const r = evaluateDecision(x); assert.equal(r.status, 'BLOCKED'); assert.ok(r.staleIds.includes('m'));
});
ok('동일 패밀리 중복 지표는 최신 하나만', () => {
  const x = base(); x.observations = x.observations.map((s) => (s.id === 'm' ? { ...s, availableAt: '2026-11-13T11:58:00Z' } : s));
  x.observations.push(mk('macro', 'm2', -1, 'm', '2026-11-13T11:59:00Z'));
  assert.equal(evaluateDecision(x).groupScores.macro, -1);
});
ok('뉴스 출처 없으면 방향성 계산에서 제외', () => {
  const x = base(); x.observations = x.observations.map((s) => (s.group === 'news' ? { ...s, sourceUrl: undefined } : s));
  const r = evaluateDecision(x); assert.equal(r.groupScores.news, null); assert.ok(r.ignoredIds.includes('n'));
});
ok('손절 순서 오류는 진입 후보로 쓰지 않음', () => {
  const x = base(); x.setups = [{ ...long, stop: 102 }];
  const r = evaluateDecision(x); assert.equal(r.status, 'NO_SETUP'); assert.equal(r.selected, null);
});
ok('부실한 순손익비는 진입 후보 제외', () => {
  const x = base(); x.setups = [{ ...long, target1: 100.4, target2: 101 }];
  assert.equal(evaluateDecision(x).status, 'NO_SETUP');
});
ok('방향 혼조는 관망', () => {
  const x = base(); x.observations = x.observations.map((s, i) => ({ ...s, direction: (i % 2 === 0 ? 1 : -1) as Direction }));
  assert.equal(evaluateDecision(x).status, 'NO_SETUP');
});

console.log('추가 — 결측·오류');
ok('잘못된 시세·시각·위험 한도는 예외', () => {
  for (const patch of [{ price: 0 }, { price: NaN }, { asOf: 'x' }, { riskPerTradePct: 2 }, { riskPerTradePct: 0 }, { maxLeverage: 0.5 }, { equityUsd: -1 }, { feeBpsRoundTrip: NaN }]) {
    assert.throws(() => evaluateDecision({ ...base(), ...patch }));
  }
});
ok('지난 속보 안전모드는 풀린다(원본은 영구 차단)', () => {
  const now = Date.parse(t);
  assert.equal(activeBlock({ id: 'g', name: '속보', type: 'geopolitical', severity: 'critical', blockUntil: '2026-11-13T11:00:00Z', verified: true }, now), null);
  assert.ok(activeBlock({ id: 'g', name: '속보', type: 'geopolitical', severity: 'critical', verified: false }, now)?.includes('종료 시각 미확인'));
  assert.ok(activeBlock({ id: 'g', name: 'CPI', type: 'macro_release', severity: 'critical', scheduledAt: 'nope', verified: true }, now)?.includes('종료 시각 미확인'));
});
ok('high 등급 이벤트는 막지 않고, 발표 30분 뒤까지는 막는다', () => {
  const now = Date.parse(t);
  assert.equal(activeBlock({ id: 'h', name: '소매판매', type: 'macro_release', severity: 'high', scheduledAt: t, verified: true }, now), null);
  assert.ok(activeBlock({ id: 'c', name: 'FOMC', type: 'fed_statement', severity: 'critical', scheduledAt: '2026-11-13T11:31:00Z', verified: true }, now));
  assert.equal(activeBlock({ id: 'c', name: 'FOMC', type: 'fed_statement', severity: 'critical', scheduledAt: '2026-11-13T11:29:00Z', verified: true }, now), null);
});
ok('오래된 관측값은 버리고 그 그룹이 거시면 보류', () => {
  const x = base(); x.observations = x.observations.map((s) => (s.group === 'macro' ? { ...s, availableAt: '2026-11-13T08:00:00Z' } : s));
  const r = evaluateDecision(x); assert.ok(r.staleIds.includes('m')); assert.equal(r.status, 'BLOCKED');
});
ok('형식이 틀린 관측값은 무시(방향 2, 강도 1 초과, 출처 없음)', () => {
  const x = base();
  x.observations.push({ ...mk('derivatives', 'bad1'), direction: 2 as unknown as Direction });
  x.observations.push({ ...mk('derivatives', 'bad2'), strength: 1.5 });
  x.observations.push({ ...mk('derivatives', 'bad3'), source: '' });
  const r = evaluateDecision(x); assert.deepEqual(r.ignoredIds.sort(), ['bad1', 'bad2', 'bad3']);
});
ok('커버리지 부족(기술+거시만 0.53)이면 보류', () => {
  const x = base(); x.observations = [mk('macro', 'm'), mk('technical', 't')];
  const r = evaluateDecision(x); assert.equal(r.coverage, 0.53); assert.equal(r.status, 'BLOCKED');
});
ok('비용이 음수면 후보 무효', () => {
  const x = base(); x.feeBpsRoundTrip = -5;
  const r = evaluateDecision(x); assert.equal(r.status, 'NO_SETUP'); assert.ok(r.evaluated[0].issues.includes('거래 비용이 유효하지 않음'));
});
ok('비용이 커지면 순손익비가 줄어 탈락', () => {
  // 진입 100·손절 98: 비용 20bp → (4−0.2)/(2+0.2)=1.73 통과, 비용 100bp → (4−1)/(2+1)=1.0 탈락
  const x = base(); x.setups = [{ ...long, target1: 104, target2: 105 }];
  assert.equal(evaluateDecision(x).status, 'READY');
  x.feeBpsRoundTrip = 60; x.slippageBpsRoundTrip = 40;
  assert.equal(evaluateDecision(x).status, 'NO_SETUP');
});
ok('명목 상한은 자본×레버리지를 넘지 않는다', () => {
  const x = base(); x.setups = [{ ...long, stop: 99.79, zoneLow: 99.8 }]; x.maxLeverage = 2;
  const r = evaluateDecision(x); assert.ok(r.selected!.maxNotionalUsd! <= 10000);
});
ok('숏 배경이면 숏 후보 선택', () => {
  const x = base(); x.observations = x.observations.map((s) => ({ ...s, direction: -1 as Direction }));
  const r = evaluateDecision(x); assert.equal(r.bias, 'SHORT_CONTEXT'); assert.equal(r.selected!.side, 'short');
});
ok('관측값이 하나도 없으면 UNAVAILABLE + 보류', () => {
  const x = base(); x.observations = [];
  const r = evaluateDecision(x); assert.equal(r.bias, 'UNAVAILABLE'); assert.equal(r.alignment, null); assert.equal(r.status, 'BLOCKED');
});

console.log(`\ndecisionEngine: ${passed} passed`);
