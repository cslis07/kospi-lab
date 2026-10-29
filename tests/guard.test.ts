import assert from 'node:assert/strict';
import { evaluateGuard, suggestStop, cooldownState, feeRisk, guardMarksFrom, SL_GRACE_MS, SL_ALT_MULT, type GuardInput, type OpenPos } from '../lib/guard';
import { feeVsRisk } from '../lib/positionSizing';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
console.log('guard.ts');

const NOW = Date.parse('2026-10-23T06:00:00Z'), M = 60_000, H = 3_600_000;
const p = (o: Partial<OpenPos>): OpenPos => ({ symbol: 'BTCUSDT', side: 'long', openTs: NOW - 60 * M, entry: 100, mark: 100, liq: 50, h1Trend: 'up', ...o });
const inp = (o: Partial<GuardInput>): GuardInput => ({ now: NOW, positions: [], slSymbols: new Set(), journal: [], closed: [], limits: null, equity: 1000, ...o });
const keys = (r: { alerts: { key: string }[] }) => r.alerts.map((a) => a.key.split(':')[0]);

ok('손절 주문 없음: 유예 3분 뒤, 거래소 SL·일지 손절 있으면 안 울림, 조회 실패(null)면 생략', () => {
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [p({})] }), { fired: {} })), ['nosl']);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [p({ openTs: NOW - SL_GRACE_MS + M })] }), { fired: {} })), []);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [p({})], slSymbols: new Set(['BTCUSDT']) }), { fired: {} })), []);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [p({})], journal: [{ symbol: 'BTC/USDT', side: 'long', id: 'j', stop: 95, target1: 0, target2: 0 }] }), { fired: {} })), []);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [p({})], slSymbols: null }), { fired: {} })), []);
});
ok('재발화: 손절 없음 2시간, 추세 역행은 포지션당 1회', () => {
  const pos = p({ h1Trend: 'down' });
  const first = evaluateGuard(inp({ positions: [pos] }), { fired: {} });
  assert.deepEqual(keys(first).sort(), ['nosl', 'trend']);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [pos], now: NOW + H }), first.state)), []);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [pos], now: NOW + 2 * H + M }), first.state)), ['nosl']);
});
ok('복구 매매: 직전이 손실 청산이고 30분 안 재진입일 때만', () => {
  const pos = p({ openTs: NOW - 20 * M });
  const sl = new Set(['BTCUSDT']);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [pos], slSymbols: sl, closed: [{ symbol: 'ETHUSDT', netProfit: -10, closeTs: NOW - 30 * M }] }), { fired: {} })), ['revenge']);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [pos], slSymbols: sl, closed: [{ symbol: 'ETHUSDT', netProfit: -10, closeTs: NOW - 90 * M }] }), { fired: {} })), []);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [pos], slSymbols: sl, closed: [{ symbol: 'ETHUSDT', netProfit: -10, closeTs: NOW - 40 * M }, { symbol: 'ETHUSDT', netProfit: 5, closeTs: NOW - 25 * M }] }), { fired: {} })), []);
});
ok('청산가 근접 15%/8%, 일지 계획 손절 도달', () => {
  const sl = new Set(['BTCUSDT']);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [p({ liq: 88 })], slSymbols: sl }), { fired: {} })), ['liq']);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [p({ liq: 95 })], slSymbols: sl }), { fired: {} })), ['liqCrit']);
  const r = evaluateGuard(inp({ positions: [p({ mark: 94 })], slSymbols: sl, journal: [{ symbol: 'BTCUSDT', side: 'long', id: 'j1', stop: 95, target1: 0, target2: 0 }] }), { fired: {} });
  assert.deepEqual(r.alerts.map((a) => a.key), ['j1:stop']);
});
ok('서킷브레이커: 한도 미설정이면 평가금 3%를 오늘 한도로(문구 명시), 하루 1회', () => {
  const closed = [{ symbol: 'BTCUSDT', netProfit: -40, closeTs: NOW - H }];
  const r = evaluateGuard(inp({ closed, equity: 1000 }), { fired: {} });
  assert.deepEqual(keys(r), ['cb']); assert.match(r.alerts[0].text, /평가금 1000의 3%/);
  assert.deepEqual(keys(evaluateGuard(inp({ closed, equity: 1000, now: NOW + H }), r.state)), []);
  assert.deepEqual(keys(evaluateGuard(inp({ closed: [{ symbol: 'BTCUSDT', netProfit: -10, closeTs: NOW - H }], equity: 1000 }), { fired: {} })), []);
});
ok('손절 제안: 진입가 ∓1.2ATR, 이미 지났으면 현재가 기준, 1% 리스크 수량', () => {
  const s = suggestStop({ side: 'long', entry: 100, mark: 99, size: 2, atr1h: 1 }, 1000)!;
  assert.ok(Math.abs(s.stop - 98.8) < 1e-9); assert.equal(s.fromMark, false);
  assert.ok(Math.abs(s.qtyAtRisk! - 10 / 1.2) < 1e-9); assert.ok(Math.abs(s.curRiskPct! - 0.24) < 1e-9);
  const passedS = suggestStop({ side: 'short', entry: 100, mark: 102, size: 1, atr1h: 1 }, null)!;
  assert.equal(passedS.fromMark, true); assert.equal(passedS.stop, 103.2); assert.equal(passedS.qtyAtRisk, null);
  assert.equal(suggestStop({ side: 'long', entry: 100, mark: 99, atr1h: null }, 1000), null);
  assert.match(evaluateGuard(inp({ positions: [p({ atr1h: 1, size: 2 })] }), { fired: {} }).alerts[0].text, /제안 손절 <b>98\.800<\/b>/);
});
ok('냉각: 손실 청산 30분, 서킷브레이커면 KST 자정까지, 이익 청산이면 없음', () => {
  const c = cooldownState([{ netProfit: -5, closeTs: NOW - 10 * M }], null, 1000, NOW)!;
  assert.equal(c.kind, 'loss'); assert.equal(c.until, NOW + 20 * M);
  assert.equal(cooldownState([{ netProfit: -5, closeTs: NOW - 40 * M }], null, 1000, NOW), null);
  assert.equal(cooldownState([{ netProfit: 5, closeTs: NOW - 5 * M }], null, 1000, NOW), null);
  const b = cooldownState([{ netProfit: -40, closeTs: NOW - H }], null, 1000, NOW)!;
  assert.equal(b.kind, 'breaker'); assert.equal((b.until + 9 * H) % 86_400_000, 0);
});
ok('하락 충격봉: 롱 보유 중에만, 충격봉당 1회, 측정 빈도 문구', () => {
  const sl = new Set(['BTCUSDT']);
  const shock = { ts: NOW - 10 * M, dir: 'down' as const, rangePct: 1.3, volX: 30 };
  const r = evaluateGuard(inp({ positions: [p({ shock })], slSymbols: sl }), { fired: {} });
  assert.deepEqual(keys(r), ['shock']); assert.match(r.alerts[0].text, /추가 하락 \d+% vs 반등 \d+%/);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [p({ shock })], slSymbols: sl, now: NOW + H }), r.state)), []);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [p({ side: 'short', h1Trend: 'down', shock })], slSymbols: sl }), { fired: {} })), []);
});
ok('폭락 조기 경보: 롱 + 그 코인에서 유의했던 경보만, 6시간에 1번', () => {
  const sl = new Set(['ETHUSDT']);
  const f = { ts: NOW, close: 100, mtf: true, h1VolBreak: false, core: true, failReclaim: false, btcBreak: true, lowerHighs1h: true, break15: true, vol5: true, checklist: 4 };
  const eth = p({ symbol: 'ETHUSDT', warn: f });
  const r = evaluateGuard(inp({ positions: [eth], slSymbols: sl }), { fired: {} });
  assert.deepEqual(keys(r), ['warn']); assert.match(r.alerts[0].text, /60분 안 −3% [\d.]+% \(평소 [\d.]+%/);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [eth], slSymbols: sl, now: NOW + H }), r.state)), []);
  // BTC는 측정상 유의한 경보가 없어 안 울림
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [p({ warn: f })], slSymbols: new Set(['BTCUSDT']) }), { fired: {} })), []);
});
ok('왕복 수수료 경고: 1R 대비 25% 이상일 때 손절가마다 1회, 거래소 SL 우선·일지 계획 폴백', () => {
  const sl = new Set(['BTCUSDT']);
  // 진입 100, 수량 10 → 왕복 수수료 100×10×0.0004×2 = 0.8. 손절 99.7 → 1R 3 → 27% (경고) / 손절 99 → 1R 10 → 8% (조용)
  const fr = feeRisk({ side: 'long', entry: 100, size: 10 }, 99.7)!;
  assert.ok(Math.abs(fr.cost - 0.8) < 1e-9 && Math.abs(fr.risk - 3) < 1e-9);
  assert.ok(Math.abs(fr.breakEvenWinPct - ((1 + 0.8 / 3) / 2) * 100) < 1e-9);
  assert.equal(feeRisk({ side: 'long', entry: 100, size: 10 }, 101), null);   // 본전 위 추적 손절
  assert.equal(feeRisk({ side: 'short', entry: 100, size: 10 }, 99), null);
  const pos = p({ size: 10 });
  const r = evaluateGuard(inp({ positions: [pos], slSymbols: sl, slStops: { 'BTCUSDT:long': 99.7 } }), { fired: {} });
  assert.deepEqual(keys(r), ['fee']); assert.match(r.alerts[0].text, /본전 승률 63\.3%/);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [pos], slSymbols: sl, slStops: { 'BTCUSDT:long': 99.7 }, now: NOW + 9 * H }), r.state)), []);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [pos], slSymbols: sl, slStops: { 'BTCUSDT:long': 99 } }), { fired: {} })), []);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [pos], slSymbols: sl, slStops: { 'BTCUSDT:short': 100.2 } }), { fired: {} })), []);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [p({ size: 10, mark: 101 })], slSymbols: sl, journal: [{ symbol: 'BTC/USDT', side: 'long', id: 'j', stop: 99.8, target1: 0, target2: 0 }] }), { fired: {} })), ['fee']);
  assert.deepEqual(keys(evaluateGuard(inp({ positions: [p({})], slSymbols: sl, slStops: { 'BTCUSDT:long': 99.7 } }), { fired: {} })), []); // 수량 모르면 생략
});
ok('단타 횟수: 오늘(KST) 1시간 미만 청산 3건째부터 건수마다 1회, 어제·1시간 이상은 안 셈', () => {
  const sc = (minAgo: number, holdMin: number, net = -1) => ({ symbol: 'BTCUSDT', netProfit: net, grossPnl: net + 0.5, fee: -0.5, openTs: NOW - (minAgo + holdMin) * M, closeTs: NOW - minAgo * M });
  const two = [sc(200, 10), sc(100, 20)];
  assert.deepEqual(keys(evaluateGuard(inp({ closed: [...two, sc(90, 90)] }), { fired: {} })).filter((k) => k === 'scalp'), []);
  const r = evaluateGuard(inp({ closed: [...two, sc(50, 5, 2)] }), { fired: {} });
  assert.deepEqual(keys(r).filter((k) => k === 'scalp'), ['scalp']);
  assert.match(r.alerts.find((a) => a.key.startsWith('scalp'))!.text, /1시간 미만 매매 3건째[\s\S]*수수료 1\.5 USDT[\s\S]*tab=cost/);
  assert.deepEqual(keys(evaluateGuard(inp({ closed: [...two, sc(50, 5, 2)], now: NOW + M }), r.state)).filter((k) => k === 'scalp'), []);
  assert.deepEqual(keys(evaluateGuard(inp({ closed: [...two, sc(50, 5, 2), sc(10, 5)], now: NOW + M }), r.state)).filter((k) => k === 'scalp'), ['scalp']);
  // 어제(KST) 청산은 제외 — NOW 는 KST 15:00
  assert.deepEqual(keys(evaluateGuard(inp({ closed: [...two, sc(16 * 60, 5)] }), { fired: {} })).filter((k) => k === 'scalp'), []);
});
ok('알림 링크·넓은 손절 대안', () => {
  const r = evaluateGuard(inp({ positions: [p({ atr1h: 1, size: 2 })] }), { fired: {} });
  assert.match(r.alerts[0].text, /<a href="https:\/\/kospi-lab\.vercel\.app\/coin-analysis\?symbol=BTCUSDT">BTC 분석<\/a>/);
  assert.match(r.alerts[0].text, new RegExp(`넓게: ${SL_ALT_MULT}×ATR 손절 <b>98\.200</b>`));
  assert.equal(suggestStop({ side: 'long', entry: 100, mark: 99, size: 2, atr1h: 1 }, 1000, SL_ALT_MULT)!.stop, 98.2);
});
ok('진입 전 비용 미리보기(feeVsRisk): 왕복 수수료율 ÷ 손절 거리', () => {
  const f = feeVsRisk(0.4, 0.0012)!;   // 시장가 왕복 0.12% · 손절 0.4% → 30%
  assert.ok(Math.abs(f.ratio - 0.3) < 1e-9); assert.ok(Math.abs(f.breakEvenWinPct - 65) < 1e-9); assert.ok(Math.abs(f.minStopPct - 0.48) < 1e-9);
  assert.equal(feeVsRisk(0, 0.0012), null);
});
ok('guardMarksFrom: 서킷브레이커·복구 매매·단타만, 시간순, 무한대 제외', () => {
  const m = guardMarksFrom({ fired: { 'nosl:a': 5, 'cb:blocked:1': 30, 'revenge:x': 10, 'scalp:1:3': 20, 'warn:BTC': 1, 'revenge:y': Number.POSITIVE_INFINITY } });
  assert.deepEqual(m, [{ kind: 'revenge', ts: 10 }, { kind: 'scalp', ts: 20 }, { kind: 'cb', ts: 30 }]);
  assert.deepEqual(guardMarksFrom(null), []);
});
console.log(`\n${passed} passed`);
