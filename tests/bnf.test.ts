/**
 * BNF형 연구 엔진(lib/bnf) — 데이터 검증·리샘플·일봉 기준(당일·미래 배제)·신호·체결 규칙·집계·판정 + 미래 누출 통합 검사.
 * 합성 데이터는 이 테스트 안에서만 쓴다(결과 화면·CSV 에 쓰지 않음). 실행: npm test
 */
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { parseBinanceKlines, validateBars, continuousSpan, resample, fundingGaps, MIN15, HOUR, H4, DAY, type Bar } from '../lib/bnf/data';
import { dailyContext, quantileSorted, wilderAtr, atrAsOf, type DailyContext } from '../lib/bnf/indicators';
import { findSignals, simulate, DEFAULT_PARAMS, type Signal, type RunInput } from '../lib/bnf/engine';
import { summarize, maxDrawdownPct, maxConsecutiveLosses, monthlyReturns, verdict, MIN_TRADES, type Summary } from '../lib/bnf/metrics';
import { unzipFirst } from '../lib/bnf/zip';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
const near = (a: number | null | undefined, b: number, eps = 1e-9) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const T0 = Date.UTC(2024, 0, 1);
const flat = (n: number, px = 100, t0 = T0, step = MIN15): Bar[] => Array.from({ length: n }, (_, i) => ({ t: t0 + i * step, o: px, h: px, l: px, c: px, v: 1 }));

// ── 데이터 ──────────────────────────────────────────────
ok('Binance CSV — 헤더 건너뜀, close_time 불일치 검출', () => {
  const txt = 'open_time,open,high,low,close,volume,close_time\n'
    + `${T0},1,2,0.5,1.5,10,${T0 + MIN15 - 1}\n${T0 + MIN15},1.5,2,1,1.2,5,${T0 + MIN15 + 5}\n`;
  const p = parseBinanceKlines(txt);
  assert.equal(p.bars.length, 2);
  assert.deepEqual(p.closeTimeErrors, [T0 + MIN15]);
});

ok('검증 — 정렬·같은 값 중복 1개 유지·다른 값 중복은 오류·OHLC 범위·결측·경계', () => {
  const b = flat(4);
  const v = validateBars([b[2], b[0], b[1], { ...b[1] }, b[3]]);
  assert.equal(v.duplicates, 1); assert.equal(v.bars.length, 4); assert.equal(v.ok, true);
  assert.deepEqual(v.bars.map((x) => x.t), b.map((x) => x.t));
  assert.equal(validateBars([b[0], { ...b[0], c: 101, h: 101 }]).conflicts.length, 1);
  assert.equal(validateBars([{ ...b[0], l: 100.5 }]).ohlcErrors.length, 1);       // 저가 > 시가
  assert.equal(validateBars([{ ...b[0], h: 99 }]).ohlcErrors.length, 1);         // 고가 < 시가
  assert.equal(validateBars([{ ...b[0], t: T0 + 1000 }]).misaligned.length, 1);
  const g = validateBars([b[0], b[3]]).gaps;
  assert.deepEqual(g, [{ afterT: b[0].t, nextT: b[3].t, missing: 2 }]);
});

ok('부분 봉 제거 — 수집 시각에 아직 안 끝난 봉', () => {
  const b = flat(3);
  const v = validateBars(b, MIN15, b[2].t + MIN15 - 1);
  assert.equal(v.partialRemoved, 1); assert.equal(v.bars.length, 2);
});

ok('연속 구간 — 첫 결측 직전에서 멈춤(보간 없음)', () => {
  const b = flat(10);
  const withGap = [...b.slice(0, 5), ...b.slice(6)];
  const span = continuousSpan(withGap, MIN15, T0);
  assert.equal(span.length, 5); assert.equal(span[4].t, b[4].t);
  assert.equal(continuousSpan(withGap, MIN15, T0 + 1).length, 0);
  assert.equal(continuousSpan(b, MIN15, T0, b[6].t).length, 7);
});

ok('리샘플 — UTC 경계, 시가 첫 봉·고저 극값·종가 마지막·거래량 합, 부분 봉 버림', () => {
  const b = flat(4 * 3, 100, T0 + MIN15);                // 00:15 시작 → 첫 1시간 묶음은 3개뿐
  b[4] = { ...b[4], h: 107 }; b[5] = { ...b[5], l: 93 }; b[6] = { ...b[6], c: 101, h: 101 };
  const h = resample(b, HOUR);
  assert.equal(h.length, 2);
  assert.equal(h[0].t, T0 + HOUR);
  assert.deepEqual([h[0].o, h[0].h, h[0].l, h[0].v], [100, 107, 93, 4]);
  assert.equal(h[0].c, 101);
  const d = resample(flat(96 + 95), DAY);
  assert.equal(d.length, 1);
});

ok('zip 해제 — 중앙 디렉터리 크기 사용(로컬 헤더 크기 0이어도)', () => {
  const body = Buffer.from('open_time,open\n1,2\n');
  const comp = deflateRawSync(body);
  const name = Buffer.from('a.csv');
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt16LE(name.length, 26);
  const cdOff = 30 + name.length + comp.length;
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(body.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(0, 42);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(46 + name.length, 12); eocd.writeUInt32LE(cdOff, 16);
  const z = unzipFirst(Buffer.concat([local, name, comp, cd, name, eocd]));
  assert.equal(z.name, 'a.csv'); assert.equal(z.data.toString(), body.toString());
});

ok('펀딩 결측 — 주기 1.5배 초과 간격', () => {
  const ev = [0, 8, 16, 40].map((h) => ({ t: T0 + h * HOUR, rate: 0.0001, intervalH: 8 }));
  assert.deepEqual(fundingGaps(ev), [{ fromT: T0 + 16 * HOUR, toT: T0 + 40 * HOUR }]);
});

// ── 일봉 기준 ───────────────────────────────────────────
const dailyFrom = (closes: number[]): Bar[] => closes.map((c, i) => ({ t: T0 + i * DAY, o: c, h: c, l: c, c, v: 1 }));

ok('분위수 — 선형보간(type 7)', () => {
  near(quantileSorted([1, 2, 3, 4, 5], 0.1), 1.4);
  near(quantileSorted([10], 0.1), 10);
});

ok('SMA25 — D−25…D−1 만 사용(당일 종가 변경해도 불변)', () => {
  const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
  const a = dailyContext(dailyFrom(closes));
  assert.equal(a.sma25[24], null);
  near(a.sma25[25]!, closes.slice(0, 25).reduce((x, y) => x + y) / 25);
  const changed = [...closes]; changed[25] = 999;
  near(dailyContext(dailyFrom(changed)).sma25[25]!, a.sma25[25]!);
  near(a.devDaily[25]!, closes[25] / a.sma25[25]! - 1);
});

ok('Q10 — 직전 365일 일봉 이격도만(당일·미래 배제), 창이 다 차야 계산', () => {
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const closes = Array.from({ length: 25 + 365 + 10 }, () => 100 * (0.8 + 0.4 * rnd()));
  const a = dailyContext(dailyFrom(closes));
  const d = 25 + 365;
  assert.equal(a.q10[d - 1], null);
  const win = (a.devDaily.slice(d - 365, d) as number[]).sort((x, y) => x - y);
  near(a.q10[d]!, quantileSorted(win, 0.1));
  const fut = [...closes]; for (let k = d; k < fut.length; k++) fut[k] = 1;   // 당일·미래 폭락
  near(dailyContext(dailyFrom(fut)).q10[d]!, a.q10[d]!);
});

ok('약세장 — close_{D−1} < SMA200(D−200…D−1)', () => {
  const up = dailyContext(dailyFrom(Array.from({ length: 202 }, (_, i) => 100 + i)));
  assert.equal(up.bear[199], null); assert.equal(up.bear[200], false);
  const down = dailyContext(dailyFrom(Array.from({ length: 202 }, (_, i) => 400 - i)));
  assert.equal(down.bear[200], true);
});

ok('Wilder ATR14 · 완료된 4시간봉만(미래 ATR 금지)', () => {
  const b = Array.from({ length: 16 }, (_, i) => ({ t: T0 + i * H4, o: 100, h: 102, l: 100, c: 101, v: 1 }));
  const atr = wilderAtr(b, 14);
  assert.equal(atr[12], null); near(atr[13]!, 2);
  b[14] = { ...b[14], h: 116 };
  const atr2 = wilderAtr(b, 14);
  near(atr2[14]!, (2 * 13 + 16) / 14);
  near(atrAsOf(b, atr2, b[14].t + H4)!, atr2[14]!);
  near(atrAsOf(b, atr2, b[14].t + H4 - 1)!, atr2[13]!);          // 진행 중인 봉 제외
  assert.equal(atrAsOf(b, atr2, b[0].t + H4 - 1), null);
});

// ── 신호 ────────────────────────────────────────────────
function fakeCtx(days: number, opts: { bear?: boolean } = {}): DailyContext {
  return { day0: T0, sma25: new Array(days).fill(100), devDaily: new Array(days).fill(0), q10: new Array(days).fill(-0.05), sma200: new Array(days).fill(100), bear: new Array(days).fill(opts.bear ?? true) };
}
const hourBars = (closes: number[], highs?: number[]): Bar[] => closes.map((c, i) => ({ t: T0 + i * HOUR, o: c, h: highs?.[i] ?? c, l: c, c, v: 1 }));

ok('신호 — 최근 4봉(현재 포함) 과매도 + 종가 > 직전 고가, 다음 봉 시각에 확정', () => {
  const bars = hourBars([100, 94, 96, 96, 96.5, 97]);       // 1번 봉 과매도(−6%)
  const sig = findSignals(bars, HOUR, fakeCtx(2), 'all');
  // i=2: 96 > 94 ✓, i=3: 96 > 96 ✗, i=4: 96.5 > 96 ✓(창 1..4), i=5: 창 2..5 에 과매도 없음 ✗
  assert.deepEqual(sig.map((s) => s.t), [bars[2].t, bars[4].t]);
  assert.equal(sig[0].decideT, bars[2].t + HOUR);
  near(sig[0].dev, -0.04);
});

ok('신호 — 과매도 봉 자체가 돌파해도 신호, 돌파 없으면 없음', () => {
  assert.equal(findSignals(hourBars([100, 94.5], [100, 94.5]), HOUR, fakeCtx(1), 'all').length, 0);
  assert.equal(findSignals(hourBars([90, 94], [90, 94]), HOUR, fakeCtx(1), 'all').length, 1);
});

ok('약세장 한정 — bear 가 아닌 날은 신호 없음, 기준값이 없으면 신호 없음', () => {
  const bars = hourBars([100, 94, 96]);
  assert.equal(findSignals(bars, HOUR, fakeCtx(1, { bear: false }), 'bear').length, 0);
  assert.equal(findSignals(bars, HOUR, fakeCtx(1, { bear: false }), 'all').length, 1);
  const c = fakeCtx(1); c.q10[0] = null;
  assert.equal(findSignals(bars, HOUR, c, 'all').length, 0);
});

// ── 체결·청산 ───────────────────────────────────────────
function setup(n = 1400, atrVal = 1) {
  const bars15 = flat(n);
  const bars4h = resample(bars15, H4);
  const atr4h = bars4h.map(() => atrVal);
  return { bars15, bars4h, atr4h };
}
const K = 32;                                              // 진입 봉 = T0 + 8h
const sigAt = (k: number): Signal => ({ t: T0 + (k - 1) * MIN15, decideT: T0 + k * MIN15, dev: -0.1, q10: -0.05 });
function run(s: ReturnType<typeof setup>, signals: Signal[], extra: Partial<RunInput> = {}) {
  return simulate({ ...s, signals, leverage: 5, entryFrom: -Infinity, entryTo: Infinity, startT: T0, ...extra });
}

ok('진입 — 신호 봉이 아니라 다음 봉 시가 × (1+슬리피지), 위험 0.5%·손절 1.5×ATR', () => {
  const s = setup();
  s.bars15[K] = { ...s.bars15[K], o: 101, h: 101, l: 101, c: 100 };
  const t = run(s, [sigAt(K)]).trades[0];
  assert.equal(t.entryT, T0 + K * MIN15); assert.equal(t.rawOpen, 101);
  near(t.entry, 101 * 1.0002);
  near(t.stopDist, 1.5 / t.entry);
  near(t.qty, 5 / (t.entry - t.stop), 1e-9);
  near(t.target, t.entry + 1.8 * (t.entry - t.stop));
});

ok('손절 거리 — 1.2% 미만은 1.2%로, 8% 초과는 건너뜀', () => {
  near(run(setup(1400, 0.1), [sigAt(K)]).trades[0].stopDist, 0.012);
  const r = run(setup(1400, 6), [sigAt(K)]);
  assert.equal(r.trades.length, 0); assert.equal(r.skipped.wideStop, 1);
});

ok('같은 봉 손절·목표 동시 → 손절 우선, 체결가 손절가 × (1−슬리피지)', () => {
  const s = setup();
  s.bars15[K + 8] = { ...s.bars15[K + 8], l: 90, h: 120 };
  const t = run(s, [sigAt(K)]).trades[0];
  assert.equal(t.reason, 'stop'); near(t.exit, t.stop * (1 - 0.0002));
  assert.equal(t.exitT, s.bars15[K + 8].t + MIN15);
  near(t.r, t.net / (t.qty * (t.entry - t.stop)));
  assert.ok(t.r < -1);                                      // 비용 때문에 −1R 보다 나쁨
});

ok('갭 하락 — 시가가 손절가 아래면 불리한 실제 시가 체결', () => {
  const s = setup();
  s.bars15[K + 8] = { t: s.bars15[K + 8].t, o: 95, h: 96, l: 94, c: 95, v: 1 };
  const t = run(s, [sigAt(K)]).trades[0];
  assert.equal(t.reason, 'stop_gap'); assert.equal(t.rawExit, 95); assert.equal(t.exitT, s.bars15[K + 8].t);
});

ok('목표 — 고가가 목표가 이상이면 목표가 체결(갭 상승도 목표가로 보수 처리)', () => {
  const s = setup();
  s.bars15[K + 8] = { ...s.bars15[K + 8], h: 110 };
  const t = run(s, [sigAt(K)]).trades[0];
  assert.equal(t.reason, 'target'); near(t.rawExit, t.target);
  const g = setup();
  g.bars15[K + 8] = { t: g.bars15[K + 8].t, o: 110, h: 111, l: 109, c: 110, v: 1 };
  const tg = run(g, [sigAt(K)]).trades[0];
  assert.equal(tg.reason, 'target'); near(tg.rawExit, tg.target); assert.equal(tg.exitT, g.bars15[K + 8].t);
});

ok('최대 보유 72h — 만기 봉 시가에서 먼저 청산(그 봉이 목표에 닿아도)', () => {
  const s = setup();
  const m = K + 72 * 4;
  s.bars15[m] = { ...s.bars15[m], h: 120 };
  const t = run(s, [sigAt(K)]).trades[0];
  assert.equal(t.reason, 'time'); assert.equal(t.exitT, s.bars15[m].t); near(t.holdH, 72);
});

ok('1포지션·청산 후 24h 대기 — 보유 중·대기 중 신호는 버림', () => {
  const s = setup(1400);
  s.bars15[K + 4] = { ...s.bars15[K + 4], l: 90 };          // K+4 봉에서 손절 → 청산 시각 K+5
  const ex = K + 5;
  const r = run(s, [sigAt(K), sigAt(K + 2), sigAt(ex + 95), sigAt(ex + 96)]);
  assert.equal(r.skipped.busy, 1); assert.equal(r.skipped.cooldown, 1);
  assert.equal(r.trades.length, 2); assert.equal(r.trades[1].entryT, T0 + (ex + 96) * MIN15);
  near(r.trades[1].riskAmt, 0.005 * r.trades[0].equityAfter);     // 다음 거래는 바뀐 자산 기준
});

ok('증거금 상한 — 명목가 ≤ 자산 × 상한 × 레버리지, 기본값에선 5x·10x 손익 동일', () => {
  const s = setup();
  s.bars15[K + 8] = { ...s.bars15[K + 8], h: 110 };
  const capped = run(s, [sigAt(K)], { leverage: 1, params: { ...DEFAULT_PARAMS, marginCapPct: 0.1 } }).trades[0];
  assert.equal(capped.capped, true); near(capped.notional, 100, 1e-9);
  const a = run(s, [sigAt(K)], { leverage: 5 }).trades[0], b = run(s, [sigAt(K)], { leverage: 10 }).trades[0];
  assert.equal(a.capped, false); near(a.net, b.net); near(a.margin, 2 * b.margin);
});

ok('수수료·슬리피지 — 진입·청산 양쪽 반영', () => {
  const s = setup();
  s.bars15[K + 8] = { ...s.bars15[K + 8], h: 110 };
  const t = run(s, [sigAt(K)]).trades[0];
  near(t.fees, t.qty * t.entry * 0.0005 + t.qty * t.exit * 0.0005);
  near(t.net, t.qty * (t.exit - t.entry) - t.fees);
  near(t.slipCost, t.qty * (t.entry - 100) + t.qty * (t.target - t.exit));
});

ok('펀딩 — 보유 중 정산은 롱이 양(+)의 비율을 지불, apply 일 때만 순손익 반영, 결측 겹치면 null', () => {
  const s = setup();
  const ev = [{ t: T0 + 16 * HOUR + 3, rate: 0.0001, intervalH: 8 }, { t: T0 + 24 * HOUR + 2, rate: -0.0002, intervalH: 8 }];
  s.bars15[K + 4 * 20] = { ...s.bars15[K + 4 * 20], h: 110 };     // 진입 8h → 28h 에 목표
  const off = run(s, [sigAt(K)], { funding: { events: ev, gaps: [], apply: false } }).trades[0];
  const on = run(s, [sigAt(K)], { funding: { events: ev, gaps: [], apply: true } }).trades[0];
  near(off.funding!, -off.qty * 100 * 0.0001 + off.qty * 100 * 0.0002);
  near(on.net - off.net, off.funding!);
  const gap = run(s, [sigAt(K)], { funding: { events: ev, gaps: [{ fromT: T0, toT: T0 + 30 * HOUR }], apply: true } });
  assert.equal(gap.trades[0].funding, null); assert.equal(gap.fundingIncomplete, 1);
});

ok('데이터 끝 — 미결 거래는 마지막 종가로 청산하고 data_end 표시', () => {
  const s = setup(K + 20);
  const t = run(s, [sigAt(K)]).trades[0];
  assert.equal(t.reason, 'data_end'); assert.equal(t.exitT, s.bars15[K + 19].t + MIN15);
});

ok('기간 창 — 진입 시각이 창 밖인 신호는 무시', () => {
  const r = run(setup(), [sigAt(K)], { entryFrom: T0 + (K + 1) * MIN15 });
  assert.equal(r.trades.length, 0); assert.equal(r.signalsInWindow, 0);
});

// ── 집계·판정 ───────────────────────────────────────────
ok('MDD·연속 손실·월별 수익률', () => {
  near(maxDrawdownPct([[0, 100], [1, 120], [2, 90], [3, 130], [4, 117]]), 25);
  assert.equal(maxConsecutiveLosses([1, -1, -2, 0, 3, -1].map((net) => ({ net }) as never)), 3);
  const jan = Date.UTC(2025, 0, 10), feb = Date.UTC(2025, 1, 10);
  const m = monthlyReturns([[jan, 1000], [jan + DAY, 1100], [feb, 990]], 1000, jan, Date.UTC(2025, 2, 1));
  assert.deepEqual(m.map((x) => x.month), ['2025-01', '2025-02']);
  near(m[0].retPct, 10); near(m[1].retPct, -10);
});

ok('집계 — 승률·PF·평균R·30회 미만은 판단 불가', () => {
  const s = setup();
  s.bars15[K + 8] = { ...s.bars15[K + 8], h: 110 };
  const sum = summarize(run(s, [sigAt(K)]), 1000);
  assert.equal(sum.trades, 1); assert.equal(sum.winRate, 100); assert.equal(sum.pf, null); assert.equal(sum.sufficient, false);
  assert.equal(MIN_TRADES, 30);
});

const S = (o: Partial<Summary>): Summary => ({ trades: 40, wins: 20, winRate: 50, pf: 1.5, avgR: 0.2, avgHoldH: 10, maxLossUsdt: -6, maxLossR: -1.1, mddPct: 4, totalReturnPct: 5, finalEquity: 1050, maxConsecLoss: 4, feesTotal: 1, slipTotal: 1, fundingTotal: 0, exitReasons: { target: 0, stop: 0, stop_gap: 0, time: 0, data_end: 0 }, worstMaePct: -3, cappedTrades: 0, skipped: { wideStop: 0, busy: 0, cooldown: 0, noAtr: 0, noBar: 0 }, signalsInWindow: 50, sufficient: true, ...o });
ok('판정 — 미리 정한 순서(표본→기대수익→낙폭→우위→기간 일관성→펀딩)', () => {
  assert.equal(verdict(S({ trades: 29, sufficient: false }), S({}), null), 'insufficient');
  assert.equal(verdict(S({ pf: 0.9, avgR: -0.05 }), S({}), null), 'negative');
  assert.equal(verdict(S({ mddPct: 10.5 }), S({}), null), 'drawdown');
  assert.equal(verdict(S({ pf: 1.1 }), S({}), null), 'weak');
  assert.equal(verdict(S({}), S({ avgR: -0.01 }), null), 'inconsistent');
  assert.equal(verdict(S({}), S({ avgR: -0.01, sufficient: false, trades: 10 }), null), 'candidate');
  assert.equal(verdict(S({}), S({}), S({ avgR: -0.01 })), 'funding_negative');
  assert.equal(verdict(S({}), S({}), S({})), 'candidate');
});

// ── 통합: 합성 경로로 전체 파이프라인 + 미래 누출 검사 ────────────
ok('통합 — 데이터를 미래에서 자르면 그 이전 신호·거래가 그대로(미래 누출 없음)', () => {
  let seed = 42;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const n = 96 * 520;
  const bars: Bar[] = [];
  let px = 2000;
  for (let i = 0; i < n; i++) {
    const o = px;
    const c = o * Math.exp((rnd() - 0.5) * 0.012 - 0.00002);
    const h = Math.max(o, c) * (1 + rnd() * 0.003), l = Math.min(o, c) * (1 - rnd() * 0.003);
    bars.push({ t: T0 + i * MIN15, o, h, l, c, v: 1 });
    px = c;
  }
  const pipe = (b15: Bar[]) => {
    const ctx = dailyContext(resample(b15, DAY));
    const b4 = resample(b15, H4);
    const sig = findSignals(resample(b15, HOUR), HOUR, ctx, 'all');
    return { sig, res: simulate({ bars15: b15, bars4h: b4, atr4h: wilderAtr(b4, 14), signals: sig, leverage: 5, entryFrom: -Infinity, entryTo: Infinity, startT: T0 }) };
  };
  const full = pipe(bars);
  const cut = T0 + 96 * 470 * MIN15;
  const part = pipe(bars.filter((b) => b.t < cut));
  assert.ok(full.sig.length > 0, '합성 경로에서 신호가 하나는 나와야 검사 의미가 있음');
  const before = (s: Signal[]) => JSON.stringify(s.filter((x) => x.decideT <= cut - DAY));
  assert.equal(before(part.sig), before(full.sig));
  const done = (tr: typeof full.res.trades) => JSON.stringify(tr.filter((t) => t.exitT < cut - DAY).map((t) => [t.entryT, t.exitT, t.net]));
  assert.equal(done(part.res.trades), done(full.res.trades));
  for (const t of full.res.trades) assert.ok(t.entryT > t.signalT, '신호 봉 시가 체결 금지');
});

console.log(`bnf: ${passed} passed`);
