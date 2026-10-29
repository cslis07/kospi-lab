/**
 * ETH 체제 보드 순수함수 회귀 테스트 (레이어1·2·4) — 실행: npm test
 * 공급 합산·프리미엄·맥스페인이 틀리면 "체제 판정"이 통째로 거짓이 되므로 계산을 고정한다.
 */
import assert from 'node:assert/strict';
import { summarizeStables, summarizeCex, supplyState } from '../lib/coinSupply';
import { premiumPct, demandState, takerDelta, cvdSummary } from '../lib/coinPremium';
import { parseInstrument, expiryToTs, maxPain, summarizeOptions } from '../lib/coinOptions';
import {
  supplyTilt, demandTilt, macroTilt, confluenceOf, crowdingState, synthesizeRegime,
} from '../lib/coinRegime';
import {
  sma, trueRange, atrPct, forwardMovePct, maxAdverseFwd, median, quantile, classifyState, baseRates,
  type Candle,
} from '../lib/regimeEdge';
import { upcomingCatalysts, CRYPTO_CATALYSTS, type CryptoCatalyst } from '../lib/cryptoCatalysts';
import type { SupplyLayer } from '../lib/coinSupply';
import type { DemandLayer } from '../lib/coinPremium';
import type { MacroContext } from '../lib/coinMacroContext';

let passed = 0;
function ok(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    throw e;
  }
}

console.log('coinSupply.ts');

ok('summarizeStables: USD 페그만 합산, 전일/전주 변화율', () => {
  const r = summarizeStables([
    { pegType: 'peggedUSD', circulating: { peggedUSD: 100 }, circulatingPrevDay: { peggedUSD: 99 }, circulatingPrevWeek: { peggedUSD: 95 } },
    { pegType: 'peggedUSD', circulating: { peggedUSD: 100 }, circulatingPrevDay: { peggedUSD: 101 }, circulatingPrevWeek: { peggedUSD: 105 } },
    { pegType: 'peggedEUR', circulating: { peggedUSD: 9999 } }, // 제외돼야
  ])!;
  assert.equal(r.totalUsd, 200);
  assert.equal(r.prevDayUsd, 200);
  assert.equal(r.prevWeekUsd, 200);
  assert.equal(r.weekChangePct, 0);
});

ok('summarizeStables: 빈 배열이면 null', () => {
  assert.equal(summarizeStables([]), null);
  assert.equal(summarizeStables([{ pegType: 'peggedEUR' }]), null);
});

ok('summarizeCex: cleanAssetsTvl 우선 합산·최대·개수', () => {
  const r = summarizeCex([{ cleanAssetsTvl: 100 }, { cleanAssetsTvl: 300 }, { currentTvl: 50 }, { cleanAssetsTvl: 0 }])!;
  assert.equal(r.totalReserveUsd, 450);
  assert.equal(r.topReserveUsd, 300);
  assert.equal(r.count, 3);
});

ok('supplyState: 스테이블 증가=supportive, stETH 디스카운트=headwind', () => {
  assert.equal(supplyState({ stableWeekPct: 1.0, stethPegPct: 0 }), 'supportive');
  assert.equal(supplyState({ stableWeekPct: -1.0, stethPegPct: 0 }), 'headwind');
  assert.equal(supplyState({ stableWeekPct: 0.1, stethPegPct: -0.5 }), 'headwind');
  assert.equal(supplyState({ stableWeekPct: 0, stethPegPct: 0 }), 'neutral');
  // 상쇄: 증가 +1, 디페그 -1 → neutral
  assert.equal(supplyState({ stableWeekPct: 1.0, stethPegPct: -0.5 }), 'neutral');
});

console.log('coinPremium.ts');

ok('premiumPct: (a/b-1)*100, b=0이면 0', () => {
  assert.ok(Math.abs(premiumPct(110, 100) - 10) < 1e-9);
  assert.ok(Math.abs(premiumPct(99, 100) - -1) < 1e-9);
  assert.equal(premiumPct(100, 0), 0);
});

ok('demandState: 코인베이스 프리미엄 주가중', () => {
  assert.equal(demandState({ coinbasePremiumPct: 0.1 }), 'buying');
  assert.equal(demandState({ coinbasePremiumPct: -0.1 }), 'selling');
  assert.equal(demandState({ coinbasePremiumPct: 0, kimchiPct: 0 }), 'neutral');
  // 프리미엄 중립 + 김프만으론 0.5라 neutral
  assert.equal(demandState({ coinbasePremiumPct: 0, kimchiPct: 5 }), 'neutral');
  // 프리미엄 + 김프 과열 동시
  assert.equal(demandState({ coinbasePremiumPct: 0.1, kimchiPct: 5 }), 'buying');
});

ok('takerDelta·cvdSummary: 순 테이커 델타 집계', () => {
  // kline[5]=총거래량, kline[9]=테이커 매수량
  const k = (vol: number, buy: number): string[] => ['0', '0', '0', '0', '0', String(vol), '0', '0', '0', String(buy)];
  assert.equal(takerDelta(k(100, 70)), 40); // 2*70-100
  assert.equal(takerDelta(k(100, 30)), -40);
  const s = cvdSummary([k(100, 70), k(100, 30), k(200, 150)]); // 델타 40-40+100=100, 총 400
  assert.equal(s.netEth, 100);
  assert.equal(s.totalEth, 400);
  assert.equal(s.ratioPct, 25); // 100/400*100
  assert.equal(cvdSummary([]).ratioPct, 0);
});

ok('demandState: CVD 순매수/매도 반영', () => {
  assert.equal(demandState({ coinbasePremiumPct: 0, cvdRatioPct: 5 }), 'buying');
  assert.equal(demandState({ coinbasePremiumPct: 0, cvdRatioPct: -5 }), 'selling');
  assert.equal(demandState({ coinbasePremiumPct: 0, cvdRatioPct: 1 }), 'neutral'); // ±3 미만
  // 프리미엄 음수 + CVD 양수 → 상쇄 neutral
  assert.equal(demandState({ coinbasePremiumPct: -0.1, cvdRatioPct: 5 }), 'neutral');
});

console.log('coinOptions.ts');

ok('parseInstrument: 행사가·만기·콜풋 추출', () => {
  assert.deepEqual(parseInstrument('ETH-27NOV26-3100-P'), { expiry: '27NOV26', strike: 3100, type: 'P' });
  assert.deepEqual(parseInstrument('ETH-9JAN26-2000-C'), { expiry: '9JAN26', strike: 2000, type: 'C' });
  assert.equal(parseInstrument('ETH-27NOV26-3100'), null); // 콜풋 없음
  assert.equal(parseInstrument('BTC-PERPETUAL'), null);
});

ok('expiryToTs: DDMMMYY → 08:00 UTC, 잘못된 월은 null', () => {
  assert.equal(expiryToTs('27NOV26'), Date.UTC(2026, 10, 27, 8, 0, 0));
  assert.equal(expiryToTs('9JAN26'), Date.UTC(2026, 0, 9, 8, 0, 0));
  assert.equal(expiryToTs('1ZZZ26'), null);
});

ok('maxPain: 총 내재가치 최소 행사가(유일 최소)', () => {
  // 중앙(2500)에 OI가 몰려 양끝(2000·3000)보다 지급액이 작다 → 맥스페인 2500
  const opts = [
    { strike: 2000, type: 'C' as const, oi: 10 },
    { strike: 2500, type: 'C' as const, oi: 100 },
    { strike: 2500, type: 'P' as const, oi: 100 },
    { strike: 3000, type: 'P' as const, oi: 10 },
  ];
  // K=2500 지급=10000 < K=2000(60000)·K=3000(60000)
  assert.equal(maxPain(opts), 2500);
  assert.equal(maxPain([]), null);
});

ok('summarizeOptions: 만기별 묶기·미래 만기만·가까운 순', () => {
  const now = Date.UTC(2026, 9, 19, 0, 0, 0); // 2026-10-19
  const rows = [
    { instrument_name: 'ETH-20OCT26-2400-C', open_interest: 50 },
    { instrument_name: 'ETH-20OCT26-2600-P', open_interest: 30 },
    { instrument_name: 'ETH-27NOV26-3000-C', open_interest: 10 },
    { instrument_name: 'ETH-1JAN26-2000-C', open_interest: 99 }, // 과거 만기 → 제외
    { instrument_name: 'ETH-20OCT26-2400-C', open_interest: 0 }, // OI 0 → 제외
    { instrument_name: 'garbage', open_interest: 100 }, // 파싱 불가 → 제외
  ];
  const r = summarizeOptions(rows, now);
  assert.equal(r.expiries.length, 2);
  assert.equal(r.nearest!.expiry, '20OCT26');
  assert.equal(r.nearest!.totalOiEth, 80);
  assert.ok(r.nearest!.daysToExpiry >= 0);
  assert.equal(r.expiries[1].expiry, '27NOV26');
});

console.log('coinRegime.ts');

const supply = (state: SupplyLayer['state']): SupplyLayer => ({ stables: null, steth: null, cex: null, state, asof: 0 });
const demand = (state: DemandLayer['state']): DemandLayer => ({ ethUsd: null, eth24hChgPct: null, coinbasePremiumPct: null, kimchiPct: null, cvdNetEth: null, cvdRatioPct: null, cvdWindowH: 24, usdKrw: null, state, asof: 0 });
const macro = (bias: MacroContext['bias']): MacroContext => ({
  dirs: { us10: 'flat', dxy: 'flat', realYield: 'flat' }, bias, strength: '보통', headline: 'test', note: '', votes: { riskOff: 0, riskOn: 0, known: 0 },
});

ok('레이어 기울기: 상태 → -1/0/+1', () => {
  assert.equal(supplyTilt(supply('supportive')).tilt, 1);
  assert.equal(supplyTilt(supply('headwind')).tilt, -1);
  assert.equal(supplyTilt(null).tilt, 0);
  assert.equal(demandTilt(demand('buying')).tilt, 1);
  assert.equal(demandTilt(demand('selling')).tilt, -1);
  assert.equal(macroTilt(macro('long')).tilt, 1);
  assert.equal(macroTilt(macro('short')).tilt, -1);
  assert.equal(macroTilt(macro('mixed')).tilt, 0);
});

ok('confluence: net·agree·strength', () => {
  assert.deepEqual(
    confluenceOf([supplyTilt(supply('supportive')), demandTilt(demand('buying')), macroTilt(macro('long'))]),
    { net: 3, agree: 3, known: 3, strength: '강' },
  );
  const mixed = confluenceOf([supplyTilt(supply('supportive')), demandTilt(demand('selling')), macroTilt(macro('mixed'))]);
  assert.equal(mixed.net, 0);
  assert.equal(mixed.strength, '혼조');
  assert.equal(confluenceOf([supplyTilt(null), demandTilt(null), macroTilt(null)]).strength, '혼조');
});

ok('crowdingState: 고펀딩+롱쏠림=crowded_long, 음펀딩=crowded_short', () => {
  assert.equal(crowdingState({ fundingPctAnnual: 40, longShortRatio: 1.5 }).crowding, 'crowded_long');
  assert.equal(crowdingState({ fundingPctAnnual: -20 }).crowding, 'crowded_short');
  assert.equal(crowdingState({ fundingPctAnnual: 10, longShortRatio: 1.1 }).crowding, 'balanced');
  assert.equal(crowdingState(null).crowding, 'unknown');
});

ok('synthesizeRegime: 태그 — amplifier / supply_no_demand / macro_headwind', () => {
  const amp = synthesizeRegime({ supply: supply('supportive'), demand: demand('buying'), macro: macro('long'), positioning: null });
  assert.ok(amp.tags.includes('amplifier'));
  assert.equal(amp.confluence.strength, '강');
  const snd = synthesizeRegime({ supply: supply('supportive'), demand: demand('selling'), macro: macro('mixed'), positioning: { fundingPctAnnual: 40, longShortRatio: 1.5 } });
  assert.ok(snd.tags.includes('supply_no_demand'));
  assert.ok(snd.tags.includes('crowded'));
  const mh = synthesizeRegime({ supply: supply('neutral'), demand: demand('neutral'), macro: macro('short'), positioning: null });
  assert.ok(mh.tags.includes('macro_headwind'));
  const mix = synthesizeRegime({ supply: supply('neutral'), demand: demand('neutral'), macro: macro('mixed'), positioning: null });
  assert.deepEqual(mix.tags, ['mixed']);
});

console.log('regimeEdge.ts');

ok('sma·trueRange·atrPct 기본', () => {
  assert.equal(sma([1, 2, 3, 4], 3, 2), 3.5);
  assert.equal(sma([1, 2], 0, 2), null);
  assert.equal(trueRange({ ts: 1, close: 10, high: 12, low: 9 }, { ts: 0, close: 10, high: 10, low: 10 }), 3);
});

ok('forwardMovePct·maxAdverseFwd', () => {
  const cs: Candle[] = [
    { ts: 0, close: 100, high: 100, low: 100 },
    { ts: 1, close: 90, high: 101, low: 88 }, // 롱 진입 후 저점 88 = -12% 역행
    { ts: 2, close: 110, high: 110, low: 90 },
  ];
  assert.ok(Math.abs(forwardMovePct(cs, 0, 2)! - 10) < 1e-9); // 100→110
  assert.ok(Math.abs(maxAdverseFwd(cs, 0, 2, false)! - 12) < 1e-9); // (100-88)/100
  assert.equal(forwardMovePct(cs, 2, 2), null); // 범위 밖
});

ok('median·quantile', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9); // round(0.9*9)=8 → s[8]
  assert.equal(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1), 10);
  assert.equal(median([]), null);
});

// 결정적 합성 시계열 — 상승추세 확인 + base rate 구조
function genUp(n: number): Candle[] {
  const cs: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const close = 100 + i; // 단조 증가
    cs.push({ ts: i, close, high: close + 0.5, low: close - 0.5 });
  }
  return cs;
}

ok('classifyState: 단조 상승은 상승추세', () => {
  const cs = genUp(60);
  const st = classifyState(cs, cs.length - 1);
  assert.ok(st !== null && st.trend === 'up');
  assert.equal(classifyState(cs, 10), null); // 과거 부족
});

ok('baseRates: 단조 상승이면 상승비율 1·판정 분류', () => {
  const br = baseRates(genUp(300), 2);
  assert.ok(br.current !== null && br.current.trend === 'up');
  assert.ok(br.control !== null && br.control.upRatio === 1);
  assert.ok(br.matched !== null && br.matched.upRatio === 1);
  assert.ok(['edge-unclear', 'vol-differs', 'insufficient'].includes(br.verdict));
});

ok('baseRates: 표본 부족이면 insufficient', () => {
  const br = baseRates(genUp(40), 2);
  assert.equal(br.verdict, 'insufficient');
});

console.log('cryptoCatalysts.ts');

ok('upcomingCatalysts: 최근~미래 창 필터·가까운 순·dday', () => {
  const now = Date.UTC(2026, 9, 19); // 2026-10-19
  const list: CryptoCatalyst[] = [
    { date: '2026-08-01', title: '오래됨', kind: 'regulation', dateLabel: '', desc: '', note: '', source: '' }, // dday -79 → 제외
    { date: '2026-10-16', title: '최근', kind: 'institution', dateLabel: '', desc: '', note: '', source: '' }, // -3 포함
    { date: '2026-10-20', title: '임박', kind: 'regulation', dateLabel: '', desc: '', note: '', source: '' }, // +1
    { date: '2027-06-01', title: '먼미래', kind: 'politics', dateLabel: '', desc: '', note: '', source: '' }, // +225 → 제외
  ];
  const r = upcomingCatalysts(list, now);
  assert.equal(r.length, 2);
  assert.equal(r[0].title, '최근');
  assert.equal(r[0].dday, -3);
  assert.equal(r[1].title, '임박');
  assert.equal(r[1].dday, 1);
});

ok('CRYPTO_CATALYSTS: 날짜 형식·종류 유효', () => {
  for (const c of CRYPTO_CATALYSTS) {
    assert.match(c.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(['regulation', 'institution', 'politics'].includes(c.kind));
    assert.ok(c.title && c.note);
  }
});

console.log(`\n${passed} passed`);
