/**
 * 펀딩 극단 되돌림 — 본검증.
 *
 * 1차 실험(4코인·90일)에서 |펀딩| 0.01~0.03% 구간이 16h 보유 +0.461%(t=3.62)로
 * 유일하게 신호를 보였다. 확립된 전략이라 부르려면 아래를 통과해야 한다:
 *
 *   V1 표본 확대   — 4 → 19종목 (펀딩 히스토리는 270건=90일이 상한이라 기간은 못 늘린다)
 *   V2 기간 반분   — 전반 45일 / 후반 45일에서 모두 유지되는가 (out-of-sample)
 *   V3 종목 일관성 — 소수 종목이 끌고 가는가, 대다수에서 나오는가
 *   V4 국면 의존   — 상승장/하락장/횡보에서 각각 유지되는가
 *   V5 손절 내성   — 고정보유가 아니라 손절을 걸어도 살아남는가
 *
 * ⚠ 횡단면 확대의 한계: 메이저 코인은 서로 강하게 상관되므로 19종목 n이
 *   19배의 독립 표본을 뜻하지 않는다. t값은 낙관적으로 나온다 — 종목 일관성(V3)을
 *   함께 봐야 하는 이유다.
 *
 * 실행: npx tsx scripts/validate-funding.ts [보유시간] [손절%]
 */
export {};   // import 가 없으면 전역 스크립트로 취급돼 다른 스크립트와 이름이 충돌한다

const BITGET = 'https://api.bitget.com';
const FEE_PCT = 0.12;        // 왕복 테이커
const BAND_LO = 0.01, BAND_HI = 0.03;   // 1차 실험에서 신호가 나온 구간

const SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT', 'DOGEUSDT', 'ADAUSDT',
  'AVAXUSDT', 'LINKUSDT', 'DOTUSDT', 'TRXUSDT', 'LTCUSDT', 'BCHUSDT', 'NEARUSDT',
  'APTUSDT', 'ARBUSDT', 'OPUSDT', 'SUIUSDT', 'ATOMUSDT',
];

interface Bar { ts: number; o: number; h: number; l: number; c: number }
interface Funding { ts: number; rate: number }

async function fetchFunding(symbol: string): Promise<Funding[]> {
  const m = new Map<number, number>();
  for (let p = 1; p <= 5; p++) {
    const r = await fetch(`${BITGET}/api/v2/mix/market/history-fund-rate?symbol=${symbol}&productType=USDT-FUTURES&pageSize=100&pageNo=${p}`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) break;
    const rows = ((await r.json())?.data ?? []) as { fundingRate: string; fundingTime: string }[];
    if (!rows.length) break;
    for (const x of rows) m.set(Number(x.fundingTime), Number(x.fundingRate));
    if (rows.length < 100) break;
    await new Promise((res) => setTimeout(res, 100));
  }
  return [...m.entries()].map(([ts, rate]) => ({ ts, rate })).filter((f) => Number.isFinite(f.rate)).sort((a, b) => a.ts - b.ts);
}

async function fetchBars(symbol: string, days: number): Promise<Bar[]> {
  const need = days * 24;
  const out: Bar[] = [];
  let endTime = Date.now();
  while (out.length < need) {
    const r = await fetch(`${BITGET}/api/v2/mix/market/history-candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=1H&limit=200&endTime=${endTime}`, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) break;
    const rows: string[][] = (await r.json())?.data ?? [];
    if (!rows.length) break;
    const batch = rows.map((x) => ({ ts: Number(x[0]), o: Number(x[1]), h: Number(x[2]), l: Number(x[3]), c: Number(x[4]) })).filter((b) => b.c > 0);
    out.unshift(...batch);
    const oldest = Math.min(...batch.map((b) => b.ts));
    if (!Number.isFinite(oldest) || oldest >= endTime) break;
    endTime = oldest;
    await new Promise((res) => setTimeout(res, 80));
  }
  const m = new Map<number, Bar>();
  for (const b of out) m.set(b.ts, b);
  return [...m.values()].sort((a, b) => a.ts - b.ts);
}

interface Rec {
  sym: string; ts: number; rate: number; side: 1 | -1;
  fixedNet: number;    // 고정보유 순손익%(캐리+수수료 반영)
  stopNet: number;     // 손절 적용 순손익%
  stopped: boolean;
  half: 1 | 2;
  regime: 'up' | 'down' | 'flat';
}

function mean(v: number[]) { return v.reduce((a, b) => a + b, 0) / (v.length || 1); }
function tStat(v: number[]) {
  if (v.length < 2) return { m: 0, se: 0, t: 0 };
  const m = mean(v);
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
  const se = sd / Math.sqrt(v.length);
  return { m, se, t: se ? m / se : 0 };
}
const verdict = (t: number, m: number) => (Math.abs(t) > 1.96 ? (m > 0 ? '✅ 유의(+)' : '❌ 유의(-)') : '⚠ 무의미');

async function main() {
  const hold = Number(process.argv[2] ?? 16);
  const stopPct = Number(process.argv[3] ?? 2);
  console.log(`펀딩 극단 되돌림 본검증 · |펀딩| ${BAND_LO}~${BAND_HI}% · 보유 ${hold}h · 손절 ${stopPct}% · 수수료 ${FEE_PCT}% 반영`);
  console.log(`대상 ${SYMBOLS.length}종목\n`);

  const recs: Rec[] = [];
  let tMin = Infinity, tMax = -Infinity;
  // 대조군(V6)에서 재사용하려고 원본을 보관한다
  const barCache = new Map<string, Bar[]>();
  const fundCache = new Map<string, Funding[]>();

  for (const sym of SYMBOLS) {
    const [fund, bars] = await Promise.all([fetchFunding(sym), fetchBars(sym, 100)]);
    if (fund.length < 50 || bars.length < 500) { console.log(`  ${sym}: 데이터 부족 (펀딩 ${fund.length}, 봉 ${bars.length}) — 제외`); continue; }
    barCache.set(sym, bars); fundCache.set(sym, fund);
    const idxOf = (ts: number) => { let i = 0; while (i < bars.length && bars[i].ts < ts) i++; return i < bars.length ? i : -1; };
    for (const f of fund) {
      const bp = Math.abs(f.rate) * 100;
      if (bp < BAND_LO || bp >= BAND_HI) continue;
      const i0 = idxOf(f.ts);
      if (i0 < 0 || i0 + hold >= bars.length) continue;
      const entry = bars[i0].c;
      if (!(entry > 0)) continue;
      const side: 1 | -1 = f.rate > 0 ? -1 : 1;   // 붐비는 쪽 반대
      const carry = Math.abs(f.rate) * 100;

      // 고정 보유
      const exitFixed = bars[i0 + hold].c;
      const fixedNet = side * ((exitFixed - entry) / entry) * 100 + carry - FEE_PCT;

      // 손절 적용 — 1H 고저로 손절 도달 판정
      let stopNet = 0, stopped = false;
      const stopPrice = side === 1 ? entry * (1 - stopPct / 100) : entry * (1 + stopPct / 100);
      let exitP = exitFixed;
      for (let k = i0 + 1; k <= i0 + hold; k++) {
        const b = bars[k];
        if (side === 1 ? b.l <= stopPrice : b.h >= stopPrice) { exitP = stopPrice; stopped = true; break; }
      }
      stopNet = side * ((exitP - entry) / entry) * 100 + carry - FEE_PCT;

      // 국면: 진입 시점 기준 직전 7일 가격 변화
      const i7 = Math.max(0, i0 - 24 * 7);
      const chg7 = ((entry - bars[i7].c) / bars[i7].c) * 100;
      const regime: Rec['regime'] = chg7 >= 3 ? 'up' : chg7 <= -3 ? 'down' : 'flat';

      recs.push({ sym, ts: f.ts, rate: f.rate, side, fixedNet, stopNet, stopped, half: 1, regime });
      tMin = Math.min(tMin, f.ts); tMax = Math.max(tMax, f.ts);
    }
  }

  // 기간 반분
  const mid = (tMin + tMax) / 2;
  for (const r of recs) r.half = r.ts < mid ? 1 : 2;

  const spanDays = (tMax - tMin) / 86_400_000;
  console.log(`수집 완료: ${recs.length}건 · ${new Date(tMin).toISOString().slice(0, 10)} ~ ${new Date(tMax).toISOString().slice(0, 10)} (${spanDays.toFixed(0)}일)\n`);

  const show = (label: string, v: number[]) => {
    const s = tStat(v);
    const winRate = v.length ? (v.filter((x) => x > 0).length / v.length) * 100 : 0;
    console.log(`  ${label.padEnd(24)} n=${String(v.length).padStart(4)}  평균 ${s.m.toFixed(3).padStart(7)}%  t=${s.t.toFixed(2).padStart(5)}  승률 ${winRate.toFixed(1).padStart(5)}%  ${verdict(s.t, s.m)}`);
  };

  console.log('=== V1. 표본 확대 (19종목, 수수료 반영) ===');
  show('고정보유', recs.map((r) => r.fixedNet));
  show(`손절 ${stopPct}% 적용`, recs.map((r) => r.stopNet));
  console.log(`  손절 도달 비율: ${((recs.filter((r) => r.stopped).length / recs.length) * 100).toFixed(1)}%`);

  console.log('\n=== V2. 기간 반분 (out-of-sample) ===');
  show('전반 45일', recs.filter((r) => r.half === 1).map((r) => r.fixedNet));
  show('후반 45일', recs.filter((r) => r.half === 2).map((r) => r.fixedNet));

  console.log('\n=== V3. 종목 일관성 ===');
  const perSym = SYMBOLS.map((s) => {
    const v = recs.filter((r) => r.sym === s).map((r) => r.fixedNet);
    return { s, n: v.length, m: v.length ? mean(v) : 0 };
  }).filter((x) => x.n >= 5).sort((a, b) => b.m - a.m);
  const pos = perSym.filter((x) => x.m > 0).length;
  console.log(`  양수 종목 ${pos}/${perSym.length} (${((pos / perSym.length) * 100).toFixed(0)}%) — 절반 근처면 소수 종목이 끌고 가는 것`);
  console.log(`  상위: ${perSym.slice(0, 4).map((x) => `${x.s.replace('USDT', '')} ${x.m.toFixed(2)}%(n=${x.n})`).join(' · ')}`);
  console.log(`  하위: ${perSym.slice(-4).map((x) => `${x.s.replace('USDT', '')} ${x.m.toFixed(2)}%(n=${x.n})`).join(' · ')}`);
  // 상위 2종목 제외해도 유지되는가
  const top2 = new Set(perSym.slice(0, 2).map((x) => x.s));
  show('상위 2종목 제외', recs.filter((r) => !top2.has(r.sym)).map((r) => r.fixedNet));

  console.log('\n=== V4. 국면 의존 ===');
  for (const g of ['up', 'down', 'flat'] as const) {
    show(`직전7일 ${g === 'up' ? '상승' : g === 'down' ? '하락' : '횡보'}`, recs.filter((r) => r.regime === g).map((r) => r.fixedNet));
  }

  console.log('\n=== V5. 방향별 (숏 편향 확인) ===');
  show('숏 (펀딩+, 롱 과열)', recs.filter((r) => r.side === -1).map((r) => r.fixedNet));
  show('롱 (펀딩−, 숏 과열)', recs.filter((r) => r.side === 1).map((r) => r.fixedNet));

  let baseT = 0;
  console.log('\n=== V6. 대조군 — 이게 진짜 펀딩 엣지인가, 그냥 숏 베타인가 ===');
  console.log('  (같은 기간·같은 종목에서 펀딩과 무관하게 매 8시간 숏을 친 경우와 비교)');
  {
    // 펀딩 필터를 끄고 '항상 숏'을 같은 방식으로 측정
    const shortBase: number[] = [];
    for (const sym of SYMBOLS) {
      const bars = barCache.get(sym); const fund = fundCache.get(sym);
      if (!bars || !fund) continue;
      const idxOf = (ts: number) => { let i = 0; while (i < bars.length && bars[i].ts < ts) i++; return i < bars.length ? i : -1; };
      for (const f of fund) {
        const i0 = idxOf(f.ts);
        if (i0 < 0 || i0 + hold >= bars.length) continue;
        const entry = bars[i0].c;
        if (!(entry > 0)) continue;
        // 항상 숏 · 펀딩은 롱이 낼 때만 수취(rate>0), 아니면 지불
        shortBase.push(-((bars[i0 + hold].c - entry) / entry) * 100 + f.rate * 100 - FEE_PCT);
      }
    }
    show('항상 숏 (펀딩 무관)', shortBase);
    const filtered = tStat(recs.filter((r) => r.side === -1).map((r) => r.fixedNet));
    const base = tStat(shortBase);
    baseT = base.t;
    const gap = filtered.m - base.m;
    console.log(`  펀딩 필터 숏 ${filtered.m.toFixed(3)}% vs 항상 숏 ${base.m.toFixed(3)}% → 필터 기여 ${gap >= 0 ? '+' : ''}${gap.toFixed(3)}%p`);
    console.log(`  → ${Math.abs(gap) < Math.max(filtered.se, base.se) * 1.96 ? '⚠ 필터가 베타 이상을 못 만든다 — 펀딩 엣지가 아니라 숏 베타일 가능성' : '✅ 필터가 베타를 넘는 기여를 한다'}`);
  }

  const overall = tStat(recs.map((r) => r.fixedNet));
  const h1 = tStat(recs.filter((r) => r.half === 1).map((r) => r.fixedNet));
  const h2 = tStat(recs.filter((r) => r.half === 2).map((r) => r.fixedNet));
  const stopS = tStat(recs.map((r) => r.stopNet));
  const longSide = tStat(recs.filter((r) => r.side === 1).map((r) => r.fixedNet));
  console.log('\n=== 종합 판정 ===');
  const checks: [string, boolean][] = [
    ['V1 전체 표본에서 양의 유의', overall.t > 1.96],
    // 후반이 '양수'만으로는 너무 느슨하다 — 최근 구간에서도 유의해야 실전에 쓸 수 있다
    ['V2 후반 45일(out-of-sample)에서도 유의', h2.t > 1.96],
    ['V3 종목 과반이 양수', pos / perSym.length > 0.6],
    ['V4 손절 적용해도 양의 유의', stopS.t > 1.96],
    // 진짜 펀딩 쏠림 효과라면 롱·숏 양쪽에서 나와야 한다.
    // 숏에서만 나오면 하락장 베타를 펀딩 엣지로 착각한 것일 수 있다
    ['V5 롱 방향도 양수 (대칭성)', longSide.m > 0],
    ['V6 대조군(항상 숏)이 유의하지 않음 — 기간 편향 없음', !(baseT > 1.96)],
  ];
  for (const [l, ok] of checks) console.log(`  ${ok ? '✅' : '❌'} ${l}`);
  const passed = checks.filter(([, o]) => o).length;
  console.log(`\n  → ${passed}/${checks.length} 통과 — ${passed === checks.length ? '검증됨으로 승격 가능' : '확립된 전략으로 볼 수 없음(실투자 금지)'}`);
}

main();
