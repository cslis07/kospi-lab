/**
 * 요일×시간대 히트맵(lib/tradeBreakdown.weekdayHourHeatmap) 회귀 테스트 — 실행: npm test
 * "어느 요일 어느 시간이 좋았나" 교차표의 칸별 건수·순손익·승률과 best/worst 가 틀리면 복기가 거짓이 된다.
 */
import assert from 'node:assert/strict';
import { weekdayHourHeatmap, HOUR_BANDS, bandOf, kstParts, rowKeyOf, notionalQuartileEdges, byWeekday, bySide, byNotionalQuartile, type BreakItem } from '../lib/tradeBreakdown';

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

ok('bandOf: 시(KST)를 4시간 밴드 인덱스로', () => {
  assert.equal(bandOf(0), 0); assert.equal(bandOf(3), 0);
  assert.equal(bandOf(9), 2); assert.equal(bandOf(23), 5);
});
ok('bandOf + kstParts: 칸 드릴다운이 히트맵과 같은 칸을 가리킨다', () => {
  // 히트맵 집계와 동일 ts 가 같은 (wd,band) 로 떨어져야 칸 클릭 목록이 어긋나지 않는다
  const ts = Date.UTC(2026, 0, 5, 1, 0) - 9 * 3600_000; // KST 2026-01-05(월) 10:00 → band 2
  const items: BreakItem[] = [{ ts, symbol: 'BTCUSDT', value: 10, win: true }];
  const h = weekdayHourHeatmap(items);
  const { wd, hour } = kstParts(ts);
  assert.equal(h.cells[0].wd, wd);
  assert.equal(h.cells[0].band, bandOf(hour));
});

/* ── rowKeyOf: 분해 표 행 key 와 일치해야 행 클릭 드릴다운이 맞는 매매를 모은다 ── */
const mkItem = (over: Partial<BreakItem> = {}): BreakItem =>
  ({ ts: Date.UTC(2026, 0, 5, 1, 0) - 9 * 3600_000, symbol: 'BTCUSDT', value: 1, win: true, ...over }); // KST 월 10시

ok('rowKeyOf: 요일·시간대 key 가 byWeekday/weekdayHourHeatmap 과 일치', () => {
  const it = mkItem();
  assert.equal(rowKeyOf('wd', it), `wd${kstParts(it.ts).wd}`);
  assert.equal(rowKeyOf('hour', it), `h${bandOf(kstParts(it.ts).hour)}`);
  // byWeekday 가 만드는 key 와 같은지(월요일 = wd1)
  assert.ok(byWeekday([it]).some((r) => r.key === rowKeyOf('wd', it)));
});
ok('rowKeyOf: 방향·손절·종목', () => {
  assert.equal(rowKeyOf('side', mkItem({ side: 'short' })), 'short');
  assert.equal(rowKeyOf('side', mkItem({ side: null })), null);        // 방향 모르면 제외
  assert.equal(rowKeyOf('stop', mkItem({ hasStop: false })), 'nostop');
  assert.equal(rowKeyOf('stop', mkItem({ hasStop: null })), null);
  assert.equal(rowKeyOf('sym', mkItem({ symbol: 'ETHUSDT' })), 'ETHUSDT');
  assert.ok(bySide([mkItem({ side: 'short' })]).some((r) => r.key === 'short'));
});
ok('rowKeyOf size: 분위수 경계로 byNotionalQuartile 과 같은 nq 버킷', () => {
  const items = [10, 20, 30, 40, 50, 60, 70, 80].map((n) => mkItem({ notional: n }));
  const edges = notionalQuartileEdges(items);
  assert.ok(edges);
  const rows = byNotionalQuartile(items);
  // 각 매매의 rowKeyOf 가 실제 byNotionalQuartile 행 key 집합 안에 있어야 한다
  const keys = new Set(rows.map((r) => r.key));
  for (const it of items) assert.ok(keys.has(rowKeyOf('size', it, edges) as string));
  assert.equal(notionalQuartileEdges(items.slice(0, 3)), null); // 4건 미만이면 null
});

console.log(`\n${passed} passed`);
