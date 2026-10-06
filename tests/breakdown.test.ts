/**
 * 요일×시간대 히트맵(lib/tradeBreakdown.weekdayHourHeatmap) 회귀 테스트 — 실행: npm test
 * "어느 요일 어느 시간이 좋았나" 교차표의 칸별 건수·순손익·승률과 best/worst 가 틀리면 복기가 거짓이 된다.
 */
import assert from 'node:assert/strict';
import { weekdayHourHeatmap, HOUR_BANDS, type BreakItem } from '../lib/tradeBreakdown';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

// KST 기준 특정 요일/시 만들기: UTC 로 역산(KST = UTC+9)
const at = (wd: number, kstHour: number, value: number, win: boolean | null = value > 0): BreakItem => {
  // 2026-10-05 은 월요일. 요일 맞추려고 일수 더하고, KST시 = UTC시+9 → UTC = kstHour-9
  const base = Date.UTC(2026, 9, 5); // 월요일 00:00 KST? Date.UTC 는 UTC 00:00 → KST 09:00
  const dayOffset = (wd === 0 ? 7 : wd) - 1; // 월=0
  const ts = base + dayOffset * 86_400_000 + (kstHour - 9) * 3600_000;
  return { ts, symbol: 'BTCUSDT', label: 'BTC', value, win };
};

ok('칸별 순손익·건수·승률 + 요일/시간대 정렬', () => {
  // 월 10시(band: 09~13), 월 10시, 화 23시(band: 21~01)
  const h = weekdayHourHeatmap([at(1, 10, 10), at(1, 10, -4), at(2, 23, 6)], 1);
  const band09 = HOUR_BANDS.findIndex((b) => 10 >= b.from && 10 < b.to);
  const monCell = h.cells.find((c) => c.wd === 1 && c.band === band09)!;
  assert.equal(monCell.n, 2); assert.equal(monCell.net, 6); assert.equal(monCell.wins, 1); assert.equal(monCell.winRate, 50);
  assert.deepEqual(h.weekdays, [1, 2]); // 월→화
  assert.equal(h.maxAbsNet, 6);
});

ok('best/worst 는 표본(thinAt) 이상 칸에서만', () => {
  // 화요일 10시 3건 합 +30(표본3), 수요일 10시 1건 −100(표본1)
  const items = [at(2, 10, 10), at(2, 10, 10), at(2, 10, 10), at(3, 10, -100)];
  const h = weekdayHourHeatmap(items, 3);
  assert.ok(h.best && h.best.wd === 2 && h.best.net === 30);
  assert.ok(h.worst && h.worst.wd === 2); // 수요일(-100)은 표본 1이라 제외 → best=worst=화
});

ok('value 없는 매매는 순손익에서 빠지되 건수·승률엔 포함', () => {
  const h = weekdayHourHeatmap([at(1, 10, 10), { ...at(1, 10, 0), value: NaN, win: null }], 1);
  const c = h.cells[0];
  assert.equal(c.n, 2); assert.equal(c.net, 10); assert.equal(c.winRate, 100); // 판정된 1건 중 1승
});

console.log(`\n${passed} passed`);
