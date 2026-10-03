/**
 * 손익 분해·CSV·보유 쏠림·가격 알림 회귀 테스트.
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import { kstParts, byWeekday, byHourBand, bySymbol, byHoldBand, holdBandIndex, type BreakItem } from '../lib/tradeBreakdown';
import { csvCell, toCsv, kstDateTime } from '../lib/csv';
import { concentration } from '../lib/concentration';
import { checkAlert, alertDistancePct, isAlertOn } from '../lib/priceAlert';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
const kst = (iso: string) => Date.parse(iso + '+09:00');

// ── 손익 분해 ──
ok('KST 요일·시: UTC 일요일 16시 = KST 월요일 01시', () => {
  assert.deepEqual(kstParts(Date.parse('2026-09-27T16:00:00Z')), { wd: 1, hour: 1 });
});

const items: BreakItem[] = [
  { ts: kst('2026-09-28T09:30:00'), symbol: 'BTCUSDT', value: 30, win: true },   // 월 08~12
  { ts: kst('2026-09-28T23:10:00'), symbol: 'BTCUSDT', value: -10, win: false }, // 월 20~24
  { ts: kst('2026-09-29T10:00:00'), symbol: 'ETHUSDT', value: null, win: true },  // 화 08~12, 값 없음
  { ts: kst('2026-09-27T02:00:00'), symbol: 'ETHUSDT', value: -5, win: false },   // 일 00~04
  { ts: kst('2026-09-29T11:00:00'), symbol: 'XRPUSDT', value: 0, win: null },     // 화 본전
];

ok('요일별: 월→일 순서, 합계·건수·승률', () => {
  const r = byWeekday(items);
  assert.deepEqual(r.map((x) => x.label), ['월요일', '화요일', '일요일']);
  const mon = r[0];
  assert.equal(mon.count, 2); assert.equal(mon.wins, 1); assert.equal(mon.winRate, 50); assert.equal(mon.sum, 20); assert.equal(mon.avg, 10);
});

ok('값 없는 매매는 건수·승률엔 들어가고 합계·평균에선 빠진다', () => {
  const tue = byWeekday(items).find((x) => x.label === '화요일')!;
  assert.equal(tue.count, 2); assert.equal(tue.valued, 1); assert.equal(tue.sum, 0); assert.equal(tue.avg, 0);
  assert.equal(tue.wins, 1);  // 본전(null)은 승리 아님
});

ok('시간대별: KST 4시간 단위, 이른 시간부터', () => {
  const r = byHourBand(items);
  assert.deepEqual(r.map((x) => x.label), ['00~04시', '08~12시', '20~24시']);
  assert.equal(r[1].count, 3);
});

ok('종목별: 건수 많은 순, 표본 5건 미만은 thin', () => {
  const r = bySymbol(items);
  assert.deepEqual(r.map((x) => x.key), ['BTCUSDT', 'ETHUSDT', 'XRPUSDT']);
  assert.ok(r.every((x) => x.thin));
});

// ── CSV ──
ok('CSV: 쉼표·따옴표·줄바꿈 감싸기', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('줄\n바꿈'), '"줄\n바꿈"');
});
ok('CSV: 수식 주입 방지(문자열만), 음수 숫자는 그대로', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('-메모'), "'-메모");
  assert.equal(csvCell(-12.5), '-12.5');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(NaN), '');
});
ok('CSV: BOM + CRLF, 날짜는 KST', () => {
  const out = toCsv(['a', 'b'], [[1, 'x']]);
  assert.ok(out.startsWith('﻿a,b\r\n1,x\r\n'));
  assert.equal(kstDateTime(Date.parse('2026-09-30T15:30:00Z')), '2026-10-01 00:30');
});

// ── 보유 쏠림 ──
ok('쏠림: 한 종목 25%·업종 40% 초과 경고, 비중 큰 순', () => {
  const c = concentration([
    { ticker: '005930', name: '삼성전자', quantity: 10, price: 70000, avgPrice: 60000, sector: '반도체' },   // 700,000
    { ticker: '000660', name: 'SK하이닉스', quantity: 1, price: 200000, avgPrice: 180000, sector: '반도체' }, // 200,000
    { ticker: '035720', name: '카카오', quantity: 2, price: 50000, avgPrice: 50000, sector: '인터넷' },      // 100,000
  ]);
  assert.equal(c.total, 1_000_000);
  assert.deepEqual(c.stocks.map((s) => Math.round(s.pct)), [70, 20, 10]);
  assert.deepEqual(c.warnings.map((w) => `${w.kind}:${w.label}`), ['stock:삼성전자', 'sector:반도체']);
});
ok('쏠림: 현재가 없으면 평단으로(추정 표시), 업종 미확인은 업종 경고 안 함', () => {
  const c = concentration([
    { ticker: 'A', name: 'A', quantity: 1, price: null, avgPrice: 100 },
    { ticker: 'B', name: 'B', quantity: 0, price: 100, avgPrice: 100 },
  ]);
  assert.equal(c.total, 100); assert.equal(c.estimated, true); assert.equal(c.stocks.length, 1);
  assert.deepEqual(c.warnings.map((w) => w.kind), ['stock']);
});

// ── 가격 알림 ──
ok('알림: 이상·이하 판정, 꺼짐·가격 없음은 null', () => {
  assert.equal(checkAlert({ above: 100 }, 100), 'above');
  assert.equal(checkAlert({ below: 90 }, 89), 'below');
  assert.equal(checkAlert({ above: 100, below: 90 }, 95), null);
  assert.equal(checkAlert({ above: 100, enabled: false }, 120), null);
  assert.equal(checkAlert({ above: 100 }, 0), null);
  assert.equal(isAlertOn({}), false);
});
ok('알림: 가까운 기준까지 거리(%)', () => {
  assert.equal(alertDistancePct({ above: 110, below: 50 }, 100), 10);
  assert.equal(alertDistancePct({ below: 95 }, 100), 5);
  assert.equal(alertDistancePct({}, 100), null);
});

ok('보유시간 분해 — 구간 경계·짧은 구간부터·보유시간 모르는 매매 제외', () => {
  const M = 60_000, H = 60 * M, D = 24 * H;
  assert.equal(holdBandIndex(14 * M), 0);  // 15분 미만 = 스캘핑
  assert.equal(holdBandIndex(15 * M), 1);  // 경계는 다음 구간
  assert.equal(holdBandIndex(3 * H), 2);
  assert.equal(holdBandIndex(3 * D), 4);   // 1~7일 = 스윙
  assert.equal(holdBandIndex(30 * D), 5);
  const items: BreakItem[] = [
    { ts: 0, symbol: 'A', value: 10, win: true, holdMs: 5 * M },
    { ts: 0, symbol: 'A', value: -4, win: false, holdMs: 10 * M },
    { ts: 0, symbol: 'A', value: 20, win: true, holdMs: 2 * D },
    { ts: 0, symbol: 'A', value: 99, win: true, holdMs: null },   // 모름 → 제외
    { ts: 0, symbol: 'A', value: 99, win: true },                  // 필드 없음 → 제외
  ];
  const rows = byHoldBand(items);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].key, 'hb0'); assert.equal(rows[0].count, 2); assert.equal(rows[0].sum, 6); assert.equal(rows[0].winRate, 50);
  assert.equal(rows[1].key, 'hb4'); assert.equal(rows[1].avg, 20);
});

console.log(`\n${passed} passed`);
