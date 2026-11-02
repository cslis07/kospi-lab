/**
 * 개인 위험관리 엔진(lib/riskControl) — 손절 기준 크기·5/10배 증거금·수수료 반영 손익·진입 판정(ALLOW/WAIT/BLOCK).
 * 실행: npm test
 */
import assert from 'node:assert/strict';
import {
  sizePosition, evaluateEntry, sanitizeSettings, fundingPayFraction, postEventVolRatio, openRiskUsdt,
  DEFAULT_RISK_SETTINGS as S, type PlanInput, type AccountContext, type MarketContext, type EntryInput,
} from '../lib/riskControl';
import { buildSchedule, etToUtc } from '../lib/macroSchedule';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
const near = (a: number | null | undefined, b: number, eps = 1e-6) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const H = 3600_000;
const NOW = Date.UTC(2026, 10, 2, 3, 0); // 2026-11-02 12:00 KST (월)

const plan = (p: Partial<PlanInput> = {}): PlanInput => ({
  equity: 2000, direction: 'long', entry: 100, stop: 99, target: 103, leverage: 5,
  entryOrder: 'market', targetOrder: 'limit', fundingRate: 0.0001, fundingIntervalH: 8, ...p,
});
const account = (a: Partial<AccountContext> = {}): AccountContext => ({ equity: 2000, equitySource: 'manual', closed: [], closedSource: 'journal', open: [], ...a });
const market = (m: Partial<MarketContext> = {}): MarketContext => ({
  symbol: 'BTCUSDT', fetchedAt: NOW, price: 100, priceTs: NOW - 5000, bid: 99.99, ask: 100.01,
  fundingRate: 0.0001, fundingIntervalH: 8, trend4h: 'up', trend1d: 'up',
  last4hCloseTs: NOW - H, last1dCloseTs: NOW - 3 * H, support: 98, resistance: 110,
  volumeRatio1h: 1.1, volSpike1h: 1.2, oiChange24hPct: 1, priceChange24hPct: 0.5, m5: null, errors: [], ...m,
});
const at = (now: number, m: Partial<MarketContext> = {}) => market({ priceTs: now - 5000, last4hCloseTs: now - H, last1dCloseTs: now - 3 * H, ...m });
// 멀리 있는 일정만(관망 구간 밖)
const farEvents = buildSchedule({ cpi: ['2026-11-10'] }, []);
const input = (o: Partial<EntryInput> = {}): EntryInput => ({ plan: plan(), settings: S, account: account(), market: market(), events: farEvents, now: NOW, ...o });

ok('기본값 — 5배·최대 10배·0.5%·일 2%·주 5%·연속 3회·손익비 1.5·전체 1%', () => {
  assert.equal(S.defaultLeverage, 5); assert.equal(S.maxLeverage, 10); assert.equal(S.riskPerTradePct, 0.5);
  assert.equal(S.dailyLossPct, 2); assert.equal(S.weeklyLossPct, 5); assert.equal(S.maxConsecutiveLosses, 3);
  assert.equal(S.minNetRR, 1.5); assert.equal(S.maxTotalRiskPct, 1);
});

ok('설정 정리 — 최대 레버리지 10배·거래당 위험 2% 하드 상한, 이상값은 기본값', () => {
  const s = sanitizeSettings({ maxLeverage: 25, riskPerTradePct: 5, defaultLeverage: 50, minNetRR: 'abc' });
  assert.equal(s.maxLeverage, 10); assert.equal(s.riskPerTradePct, 2); assert.equal(s.defaultLeverage, 10); assert.equal(s.minNetRR, 1.5);
  assert.deepEqual(sanitizeSettings(null), S);
});

ok('2,000 USDT·0.5% = 10 USDT — 손절 시 순손실이 정확히 허용액(수수료·슬리피지 포함)', () => {
  const z = sizePosition(plan({ fundingRate: 0 }), S);
  assert.ok(z.ok);
  near(z.riskBudget, 10);
  near(z.netLossAtStop, 10);
  // 코인 1개당 손실 = 1(가격) + 100×0.06% + 99×0.06% + 100×0.05% + 99×0.05%
  const perUnit = 1 + 0.06 + 0.0594 + 0.05 + 0.0495;
  near(z.qty, 10 / perUnit);
  near(z.notional, (10 / perUnit) * 100);
  near(z.riskPctOfEquity, 0.5);
});

ok('5배 vs 10배 — 수량·손실은 같고 증거금만 절반', () => {
  const a = sizePosition(plan({ leverage: 5 }), S), b = sizePosition(plan({ leverage: 10 }), S);
  near(a.qty, b.qty); near(a.netLossAtStop, b.netLossAtStop); near(a.notional, b.notional);
  near(a.margin, b.margin * 2);
  const m5 = a.marginAt.find((x) => x.lev === 5)!, m10 = a.marginAt.find((x) => x.lev === 10)!;
  near(m5.margin, a.notional / 5); near(m10.margin, a.notional / 10);
});

ok('수수료 반영 손익 — 목표 순이익·순손익비(지정가 목표 = 메이커)', () => {
  const z = sizePosition(plan({ fundingRate: 0 }), S);
  const perUnitLoss = 1 + 0.06 + 0.0594 + 0.05 + 0.0495;
  const perUnitProfit = 3 - 0.06 - 103 * 0.0002 - 0.05; // 진입 테이커·슬리피지, 목표 메이커
  near(z.netProfitAtTarget, z.qty * perUnitProfit);
  near(z.netRR, perUnitProfit / perUnitLoss);
  near(z.grossRR, 3);
  assert.ok(z.netRR! < z.grossRR!);
});

ok('펀딩 — 내는 쪽만 비용, 받는 쪽은 0(보수적)·없으면 null', () => {
  near(fundingPayFraction('long', 0.0001, 8, 8), 0.0001);
  near(fundingPayFraction('long', 0.0001, 8, 24), 0.0003);
  near(fundingPayFraction('short', 0.0001, 8, 24), 0);
  near(fundingPayFraction('short', -0.0002, 4, 8), 0.0004);
  assert.equal(fundingPayFraction('long', null, 8, 8), null);
  const z = sizePosition(plan({ fundingRate: null, fundingIntervalH: null }), S);
  assert.equal(z.costs.fundingKnown, false);
});

ok('크기 계산 실패 — 손절 없음·반대편 손절·반대편 목표', () => {
  assert.equal(sizePosition(plan({ stop: null }), S).ok, false);
  assert.equal(sizePosition(plan({ stop: 101 }), S).ok, false);
  assert.equal(sizePosition(plan({ direction: 'short', stop: 99 }), S).ok, false);
  assert.equal(sizePosition(plan({ target: 98 }), S).ok, false);
});

ok('ALLOW — 모든 조건 충족(수익 신호 아님 문구)', () => {
  const d = evaluateEntry(input());
  assert.equal(d.verdict, 'ALLOW', JSON.stringify(d.reasons.filter((r) => r.level !== 'ok'), null, 1));
  assert.match(d.headline, /수익 신호가 아닙니다/);
});

ok('BLOCK — 손절가 없음 / 레버리지 10배 초과', () => {
  assert.equal(evaluateEntry(input({ plan: plan({ stop: null }) })).verdict, 'BLOCK');
  const d = evaluateEntry(input({ plan: plan({ leverage: 11 }) }));
  assert.equal(d.verdict, 'BLOCK'); assert.ok(d.reasons.some((r) => r.code === 'lev-max'));
  assert.equal(evaluateEntry(input({ plan: plan({ leverage: 10 }) })).verdict, 'ALLOW');
});

ok('BLOCK — 일일 손실 한도(계좌 2% = 40 USDT) 도달 / 연속 손절 3회', () => {
  const today = NOW - H;
  const d = evaluateEntry(input({ account: account({ closed: [{ ts: today, result: 'loss', realizedUsdt: -41 }] }) }));
  assert.equal(d.verdict, 'BLOCK'); assert.ok(d.reasons.some((r) => r.code === 'daily'));
  const streak = [1, 2, 3].map((i) => ({ ts: NOW - 30 * H - i * H, result: 'loss' as const, realizedUsdt: -1 }));
  const s = evaluateEntry(input({ account: account({ closed: streak }) }));
  assert.equal(s.verdict, 'BLOCK'); assert.ok(s.reasons.some((r) => r.code === 'streak'));
  assert.equal(s.budget.lossStreak, 3);
});

ok('남은 일일 한도로 크기 축소 — 오늘 −35면 이번 허용 손실 5 USDT', () => {
  const d = evaluateEntry(input({ account: account({ closed: [{ ts: NOW - H, result: 'loss', realizedUsdt: -35 }] }) }));
  near(d.budget.dailyRemaining, 5);
  assert.ok(d.sizing.capped); near(d.sizing.netLossAtStop, 5);
});

ok('전체 동시 위험 — 열린 위험 20 = 한도(1%) 소진이면 BLOCK, 손절 미확인 포지션이면 WAIT', () => {
  const full = evaluateEntry(input({ account: account({ open: [{ symbol: 'ETHUSDT', side: 'long', riskUsdt: 20 }] }) }));
  assert.equal(full.verdict, 'BLOCK'); assert.ok(full.reasons.some((r) => r.code === 'total-risk'));
  const half = evaluateEntry(input({ account: account({ open: [{ symbol: 'ETHUSDT', side: 'long', riskUsdt: 15 }] }) }));
  near(half.sizing.netLossAtStop, 5); // 남은 전체 한도 5 로 축소
  const unk = evaluateEntry(input({ account: account({ open: [{ symbol: 'ETHUSDT', side: 'short', riskUsdt: null }] }) }));
  assert.equal(unk.verdict, 'WAIT'); assert.ok(unk.reasons.some((r) => r.code === 'open-unknown'));
});

ok('손익비 — 순손익비 1.5 미달 WAIT(설정 시 BLOCK)·비용 빼면 손실이면 BLOCK·목표 없으면 WAIT', () => {
  const low = evaluateEntry(input({ plan: plan({ target: 101.5 }) }));
  assert.equal(low.verdict, 'WAIT'); assert.ok(low.reasons.some((r) => r.code === 'rr-low'));
  assert.equal(evaluateEntry(input({ plan: plan({ target: 101.5 }), settings: { ...S, rrShortfall: 'block' } })).verdict, 'BLOCK');
  assert.equal(evaluateEntry(input({ plan: plan({ target: 100.05 }) })).verdict, 'BLOCK');
  assert.equal(evaluateEntry(input({ plan: plan({ target: null }) })).verdict, 'WAIT');
});

ok('데이터 — 오래된 시세·시세 없음·일정 없음·청산 기록 없음은 WAIT(임의 값 안 채움)', () => {
  assert.equal(evaluateEntry(input({ market: market({ priceTs: NOW - 10 * 60_000 }) })).verdict, 'WAIT');
  assert.equal(evaluateEntry(input({ market: null })).verdict, 'WAIT');
  assert.equal(evaluateEntry(input({ events: null })).verdict, 'WAIT');
  assert.equal(evaluateEntry(input({ account: account({ closed: null }) })).verdict, 'WAIT');
  assert.equal(evaluateEntry(input({ market: market({ trend4h: null }) })).verdict, 'WAIT');
  assert.equal(evaluateEntry(input({ market: market({ bid: null }) })).verdict, 'WAIT');
});

ok('거시 발표 — 60분 전·발표 후 30분 WAIT, 이후 5분봉 변동 정상화 확인', () => {
  const t = etToUtc('2026-11-10', '08:30');
  const ev = buildSchedule({ cpi: ['2026-11-10'] }, []);
  assert.equal(evaluateEntry(input({ events: ev, now: t - 59 * 60_000, market: at(t - 59 * 60_000) })).verdict, 'WAIT');
  assert.equal(evaluateEntry(input({ events: ev, now: t - 61 * 60_000, market: at(t - 61 * 60_000) })).verdict, 'ALLOW');
  assert.equal(evaluateEntry(input({ events: ev, now: t + 29 * 60_000, market: at(t + 29 * 60_000) })).verdict, 'WAIT');
  // 발표 후 40분: 발표 전 5분봉 변동폭 1, 최근 3봉 5 → 5배 > 2배 → WAIT, 최근 1.5 → 정상화
  const mk = (recent: number) => {
    const bars = [] as { ts: number; range: number }[];
    for (let k = -13; k < 8; k++) bars.push({ ts: t + k * 5 * 60_000, range: k < 0 ? 1 : recent });
    return bars;
  };
  const now = t + 40 * 60_000;
  assert.equal(evaluateEntry(input({ events: ev, now, market: at(now, { m5: mk(5) }) })).verdict, 'WAIT');
  assert.equal(evaluateEntry(input({ events: ev, now, market: at(now, { m5: mk(1.5) }) })).verdict, 'ALLOW');
  near(postEventVolRatio(mk(5), t, now), 5);
  assert.equal(postEventVolRatio(null, t, now), null);
});

ok('시장 조건 — 펀딩 과열(내 방향이 냄)·4H·1D 모두 역방향·급변·넓은 스프레드는 WAIT', () => {
  assert.equal(evaluateEntry(input({ market: market({ fundingRate: 0.0003 }) })).verdict, 'WAIT'); // 연 32.85%
  assert.equal(evaluateEntry(input({ plan: plan({ direction: 'short', stop: 101, target: 97 }), market: market({ fundingRate: 0.0003, trend4h: 'flat', trend1d: 'flat' }) })).verdict, 'ALLOW'); // 숏은 받음
  assert.equal(evaluateEntry(input({ market: market({ trend4h: 'down', trend1d: 'down' }) })).verdict, 'WAIT');
  assert.equal(evaluateEntry(input({ market: market({ trend4h: 'down', trend1d: 'up' }) })).verdict, 'ALLOW'); // 한쪽만 역방향 = 참고
  assert.equal(evaluateEntry(input({ market: market({ trend4h: 'down', trend1d: 'down' }), settings: { ...S, counterTrend: 'note' } })).verdict, 'ALLOW');
  assert.equal(evaluateEntry(input({ market: market({ volSpike1h: 3.5 }) })).verdict, 'WAIT');
  assert.equal(evaluateEntry(input({ market: market({ bid: 99.9, ask: 100.1 }) })).verdict, 'WAIT'); // 20bp
});

ok('증거금 초과·손절 전 청산 근사 → BLOCK', () => {
  // 손절 0.05% 로 아주 좁으면 명목가치가 커져 1배 증거금이 자산 초과
  assert.equal(evaluateEntry(input({ plan: plan({ stop: 99.95, target: 100.5, leverage: 1 }) })).verdict, 'BLOCK');
  // 10배·손절 12% → 청산 근사(약 −9.5%)가 손절보다 먼저
  const d = evaluateEntry(input({ plan: plan({ stop: 88, target: 130, leverage: 10 }) }));
  assert.equal(d.verdict, 'BLOCK'); assert.ok(d.reasons.some((r) => r.code === 'liq'));
});

ok('열린 포지션 손절 위험 계산', () => {
  near(openRiskUsdt('long', 2, 100, 95), 10);
  near(openRiskUsdt('short', 2, 100, 103), 6);
  near(openRiskUsdt('long', 2, 100, 101), 0); // 이익 잠금
  assert.equal(openRiskUsdt('long', 2, 100, null), null);
});

console.log(`\nriskControl: ${passed} passed`);
