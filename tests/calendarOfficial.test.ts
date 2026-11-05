/**
 * 경제 캘린더 일정 정합(lib/calendarOfficial) + 정적 일정·CPI YoY·발표 스냅샷 상태·ETH 체제 문구 회귀.
 * 공식 일시(2026-11, 서머타임 종료 11/1 이후): 고용 11/6·CPI 11/10·PPI 11/13·PCE 11/25 08:30 ET = 22:30 KST
 * (BLS 일정 = FRED release calendar 대조, BEA news/schedule 확인 2026-11-04). 실행: npm test
 */
import assert from 'node:assert/strict';
import { buildSchedule, FOMC_DECISION_DATES, type MacroEvent } from '../lib/macroSchedule';
import { officialToCalendar, mergeOfficial, snapToOfficial, kindOfTitle, releaseTs } from '../lib/calendarOfficial';
import { CALENDAR_EVENTS } from '../lib/calendarEvents';
import { SEED_EVENTS as MARKET_EVENTS_SEED } from '../lib/marketEvents';
import { buildIndicator, shiftMonth, pointAtMonth, MACRO_CFG } from '../lib/macroData';
import { pendingLabel } from '../lib/releaseReaction';
import { synthesizeRegime, confluenceOf } from '../lib/coinRegime';
import { classify } from '../lib/macroEvents';
import { calendarWithOfficial, fetchOfficialSchedule } from '../lib/officialSchedule';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
const near = (a: number | null | undefined, b: number, eps = 1e-3) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≈ ${b}`);

const NOV: MacroEvent[] = buildSchedule({
  jobs: ['2026-11-06', '2026-12-04'], cpi: ['2026-11-10', '2026-12-10'], ppi: ['2026-11-13'], pce: ['2026-10-29', '2026-11-25'], gdp: ['2026-11-25'],
}, ['2026-10-28', '2026-12-09']);
const OFF = officialToCalendar(NOV);
const at = (kind: string, date: string) => OFF.find((e) => e.kind === kind && e.date === date)!;

ok('공식 일시 → KST — 11월(EST) 08:30 ET = 22:30, 10월(EDT) 21:30, FOMC 14:00 ET = 익일 04:00/03:00', () => {
  assert.equal(at('jobs', '2026-11-06').timeKst, '22:30');
  assert.equal(at('cpi', '2026-11-10').timeKst, '22:30');
  assert.equal(at('ppi', '2026-11-13').timeKst, '22:30');
  assert.equal(at('pce', '2026-11-25').timeKst, '22:30');
  assert.equal(at('pce', '2026-10-29').timeKst, '21:30');                // 서머타임 중
  assert.equal(at('fomc', '2026-12-09').timeKst, '익일 04:00');
  assert.equal(at('fomc', '2026-10-28').timeKst, '익일 03:00');
  assert.equal(OFF.some((e) => e.kind === 'powell'), false);             // 기자회견은 FOMC 와 묶어 따로 안 넣음
  assert.equal(at('cpi', '2026-11-10').title, '미국 CPI (소비자물가)');
  assert.equal(at('pce', '2026-11-25').importance, 'high');
});

ok('수동 일정 + 공식 일정 — 공식 범위 안의 같은 지표는 공식으로 대체, 범위 밖·한국 일정은 유지', () => {
  const manual = [
    { date: '2026-11-12', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
    { date: '2027-03-11', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
    { date: '2026-11-27', title: '한국은행 기준금리 결정', category: 'bok', country: 'KR', importance: 'high' },
    { date: '2026-11-26', title: 'Thanksgiving (미국 휴장)', category: 'holiday', country: 'US', importance: 'low' },
  ] as const;
  const merged = mergeOfficial([...manual], OFF);
  const cpi = merged.filter((e) => kindOfTitle(e.title) === 'cpi').map((e) => e.date).sort();
  assert.deepEqual(cpi, ['2026-11-10', '2026-12-10', '2027-03-11']);
  assert.ok(merged.some((e) => e.category === 'bok')); assert.ok(merged.some((e) => e.category === 'holiday'));
  assert.equal(mergeOfficial([...manual], []).length, manual.length);   // 공식 일정 실패 시 정적 일정 그대로
});

ok('외부 제공업체 날짜를 공식에 맞춤 — SoSoValue CPI 11/09 → 11/10(±2일 안 같은 지표만)', () => {
  const soso = [
    { date: '2026-11-09', name: 'CPI (YoY)', ko: 'CPI(전년비)', key: 'cpi' },
    { date: '2026-11-12', name: 'PPI (MoM)', ko: 'PPI(전월비)', key: 'ppi' },
    { date: '2026-11-11', name: 'Existing Home Sales', ko: '기존 주택판매', key: 'ehs' },
    { date: '2026-11-20', name: 'CPI (MoM)', ko: 'CPI(전월비)', key: 'cpi' },  // 공식 CPI 와 10일 차이 — 끌어오지 않음
  ];
  const s = snapToOfficial(soso, NOV);
  assert.equal(s[0].date, '2026-11-10'); assert.equal(s[0].providerDate, '2026-11-09');
  assert.equal(s[1].date, '2026-11-13');
  assert.equal(s[2].date, '2026-11-11'); assert.equal(s[2].providerDate, undefined);
  assert.equal(s[3].date, '2026-11-20');
});

ok('같은 CPI 발표가 달력 그리드·이번 주 표·아래 목록에서 같은 날짜(11/10)', () => {
  const list = mergeOfficial(CALENDAR_EVENTS, OFF);
  const listCpi = list.filter((e) => kindOfTitle(e.title) === 'cpi' && e.date.startsWith('2026-11')).map((e) => e.date);
  const table = snapToOfficial([{ date: '2026-11-09', name: 'CPI (YoY)', ko: 'CPI(전년비)', key: classify('CPI (YoY)').key }], NOV).map((e) => e.date);
  const grid = list.filter((e) => e.date.startsWith('2026-11') && /CPI/.test(e.title)).map((e) => e.date);
  assert.deepEqual(listCpi, ['2026-11-10']); assert.deepEqual(table, ['2026-11-10']); assert.deepEqual(grid, ['2026-11-10']);
});

ok('정적 일정 자체도 공식과 일치 — 2026 CPI·고용, FOMC 는 연준 공식 목록 안', () => {
  const cpi = CALENDAR_EVENTS.filter((e) => /미국 CPI/.test(e.title) && e.date.startsWith('2026')).map((e) => e.date);
  assert.deepEqual(cpi, ['2026-01-13', '2026-02-13', '2026-03-11', '2026-04-10', '2026-05-12', '2026-06-10', '2026-07-14', '2026-08-12', '2026-09-11', '2026-10-14', '2026-11-10', '2026-12-10']);
  assert.ok(CALENDAR_EVENTS.filter((e) => /NFP/.test(e.title)).some((e) => e.date === '2026-11-06'));
  for (const e of CALENDAR_EVENTS.filter((x) => x.category === 'fomc')) assert.ok(FOMC_DECISION_DATES.includes(e.date), `FOMC ${e.date}`);
  const seedFomc = MARKET_EVENTS_SEED.filter((e) => e.type === 'FOMC').map((e) => new Date(e.ts).toISOString().slice(0, 10));
  for (const d of seedFomc) assert.ok(FOMC_DECISION_DATES.includes(d), `marketEvents FOMC ${d}`);
});

// ── /indicators CPI YoY — 빈 달(2025-10 셧다운 미발표)이 있어도 날짜로 맞춤 ──
const cpiCfg = MACRO_CFG.find((c) => c.id === 'cpi')!;
const SA = [['2025-08', 323.291], ['2025-09', 324.245], ['2025-11', 325.063], ['2025-12', 326.031], ['2026-01', 326.588], ['2026-02', 327.46], ['2026-03', 330.293],
  ['2026-04', 332.407], ['2026-05', 333.979], ['2026-06', 332.568], ['2026-07', 332.813], ['2026-08', 334.131], ['2026-09', 336.298]].map(([d, v]) => ({ date: `${d}-01`, value: v as number }));
const NSA = [['2025-09', 324.8], ['2026-08', 334.98], ['2026-09', 336.94]].map(([d, v]) => ({ date: `${d}-01`, value: v as number }));

ok('CPI YoY — 2026-09 vs 2025-09(배열 −13 = 2025-08 로 4.02% 나오던 버그), 계절조정 전 계열이면 BLS 헤드라인 3.7%', () => {
  const same = buildIndicator(cpiCfg, SA);
  near(same.yoyPct, (336.298 / 324.245 - 1) * 100); assert.equal(same.yoyBasis, 'same');
  assert.ok(Math.abs((same.yoyPct ?? 0) - 4.02) > 0.2);
  const nsa = buildIndicator(cpiCfg, SA, NSA);
  near(nsa.yoyPct, (336.94 / 324.8 - 1) * 100); assert.equal(nsa.yoyBasis, 'nsa');
  assert.equal(nsa.yoyPct!.toFixed(1), '3.7');
  near(nsa.changePct, (336.298 / 334.131 - 1) * 100);                  // 전월대비는 표시(계절조정) 계열
});

ok('CPI 전월대비 — 앞 달이 빈 달이면 2개월 변화를 전월대비로 쓰지 않음(null), 12개월 전이 없으면 YoY null', () => {
  const nov = buildIndicator(cpiCfg, SA.filter((p) => p.date <= '2025-11-01'));
  assert.equal(nov.latest!.date, '2025-11-01'); assert.equal(nov.prev, null); assert.equal(nov.changePct, null);
  assert.equal(nov.yoyPct, null); assert.equal(nov.yoyBasis, null);
  const zero = buildIndicator(cpiCfg, [{ date: '2025-09-01', value: 0 }, ...SA.filter((p) => p.date > '2025-09-01')]);
  assert.equal(zero.yoyPct, null);                                        // 0 으로 나누지 않음
  assert.equal(shiftMonth('2026-01', -1), '2025-12'); assert.equal(shiftMonth('2025-09', 12), '2026-09');
  assert.equal(pointAtMonth(SA, '2025-10'), null);
  const daily = buildIndicator({ ...cpiCfg, periodicity: 'daily' }, SA.slice(-3));
  assert.equal(daily.prev!.date, SA.at(-2)!.date);                        // 일간은 직전 관측치
});

ok('발표 스냅샷 — 결과 빈 행은 수집일 기준으로 구분(지금도 미발표라고 단정하지 않음)', () => {
  assert.equal(pendingLabel('2026-10-16', '2026-10-12'), '예정(수집 시점)');
  assert.equal(pendingLabel('2026-10-12', '2026-10-12'), '수집 당시 미발표');
  assert.equal(pendingLabel('2026-10-01', null), '발표 전');
});

ok('ETH 체제 문구 — 엇갈리면 판단 어려움, 정렬돼도 레버리지 증가 권유 없음', () => {
  const t = (tilt: -1 | 0 | 1, key: 'supply' | 'demand' | 'macro') => ({ key, label: key, tilt, reason: '' });
  const mixed = synthesizeRegime({ supply: null, demand: null, macro: null, positioning: null } as never);
  assert.ok(mixed.note.includes('판단하기 어렵습니다') || mixed.note.includes('엇갈립니다'), mixed.note);
  for (const r of [mixed]) { assert.ok(!r.note.includes('조금 더')); assert.ok(r.note.includes('레버리지를 높일 근거는 아닙니다')); }
  assert.equal(confluenceOf([t(1, 'supply'), t(1, 'demand'), t(1, 'macro')]).strength, '강');
});

// ── 분석 API(브리핑·코인·종목)용 발표 시각 — 공식 행은 실제 시각, 수동 행은 기관 표준 시각을 미 동부 기준으로 환산 ──
ok('releaseTs — 공식 CPI 11/10 = 22:30 KST(겨울), 수동 FOMC 12/09 = 익일 04:00 KST, 여름 수동 CPI = 21:30 KST', () => {
  assert.equal(releaseTs(at('cpi', '2026-11-10')), Date.parse('2026-11-10T22:30:00+09:00'));
  assert.equal(releaseTs({ date: '2026-12-09', title: 'FOMC 금리 결정', category: 'fomc', country: 'US', importance: 'high' }), Date.parse('2026-12-10T04:00:00+09:00'));
  assert.equal(releaseTs({ date: '2026-07-14', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' }), Date.parse('2026-07-14T21:30:00+09:00'));
  assert.equal(releaseTs({ date: '2026-11-27', title: '한국은행 기준금리 결정', category: 'bok', country: 'KR', importance: 'high' }), Date.parse('2026-11-27T00:00:00+09:00'));
});

console.log(`calendarOfficial: ${passed} passed`);

// 서버 공용 일정(lib/officialSchedule) — FRED 키가 없으면 공식 일정 없이 정적 일정 그대로(없는 일시를 만들지 않음)
void (async () => {
  delete process.env.FRED_API_KEY;
  const s = await fetchOfficialSchedule();
  assert.equal(s.missing.length, 6);
  assert.ok(s.events.every((e) => e.kind === 'fomc' || e.kind === 'powell'));
  const cal = await calendarWithOfficial(500);
  assert.deepEqual(cal, CALENDAR_EVENTS);
  console.log('  ✓ officialSchedule — 키 없음 → 정적 일정 그대로');
})().catch((e) => { console.error('  ✗ officialSchedule', e); process.exit(1); });
