/**
 * KL-015 선행 테스트 보조 통계(lib/paperStats) — 신뢰구간·비용 차감 R. 판정 규칙(paperJudge)과 무관한 표시용.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import { costR, netRs, meanCI, ciText } from '../lib/paperStats';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

console.log('paperStats — 신뢰구간·비용 차감');
ok('비용 R — 시장가 진입 + 손절(테이커+슬리피지 양쪽)', () => {
  // 위험 1000, 진입 100000·청산 99000: (100000×0.0011 + 99000×0.0011)/1000 = 0.2189
  near(costR({ type: 'market', entry: 100000, stop: 99000 }, 'loss', 99000), 0.2189);
});
ok('비용 R — 지정가 진입 + 목표 지정가(메이커 양쪽)', () => {
  near(costR({ type: 'limit', entry: 100000, stop: 99000 }, 'win', 102000), (100000 * 0.0002 + 102000 * 0.0002) / 1000);
});
ok('비용 차감 R 은 항상 채점 R 이하, 미결·무효는 제외', () => {
  const js = [
    { trade: { type: 'market' as const, entry: 100, stop: 98 }, status: 'win', r: 1.5, exitPrice: 103 },
    { trade: { type: 'limit' as const, entry: 100, stop: 98 }, status: 'loss', r: -1, exitPrice: 98 },
    { trade: { type: 'limit' as const, entry: 100, stop: 98 }, status: 'open', r: 0.3 },
    { trade: { type: 'limit' as const, entry: 100, stop: 98 }, status: 'void', r: null },
  ];
  const n = netRs(js);
  assert.equal(n.length, 2);
  assert.ok(n[0] < 1.5 && n[1] < -1);
});
ok('평균·95% 구간 — 0을 포함하면 우위 불명', () => {
  const c = meanCI([1.5, -1, 1.5, -1, -1, 1.5]);
  near(c.mean, 0.25);
  assert.ok(c.lo! < 0 && c.hi! > 0);
  assert.match(ciText(c), /0을 포함 — 우위 불명/);
});
ok('구간이 0보다 크면 0보다 큼, 표본 1건은 구간 없음', () => {
  assert.match(ciText(meanCI([1, 1.1, 0.9, 1.05, 0.95])), /0보다 큼/);
  assert.match(ciText(meanCI([1])), /구간 계산 불가/);
  assert.equal(ciText(meanCI([])), '확정 거래 없음');
});
ok('30건이어도 구간이 넓으면 결론 아님 — 승패 반반·손익비 1.5 가상 30건', () => {
  const rs = Array.from({ length: 30 }, (_, i) => (i % 2 ? 1.5 : -1));
  const c = meanCI(rs);
  assert.ok(c.lo! < 0, `하한 ${c.lo} — 0을 포함해야(30건으로 유의성 확정 불가 예시)`);
});

console.log(`paperStats: ${passed}건 통과`);
