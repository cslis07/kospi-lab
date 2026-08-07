/**
 * 파생 레이어 A/B — "주문흐름·포지셔닝이 엣지를 더하는가"를 잰다.
 *
 * 배경: 라이브 엔진은 파생 신호를 최대 ±22점 쓰는데(테이커 비율·다이버전스·OI 4분면·
 * 롱숏 격차) 백테스트는 `extras={}` 로 돌아 이걸 한 번도 검증한 적이 없다.
 * 가격 기술적 지표만으로는 엣지가 없다는 건 이미 727건으로 확인됐고(승률 49.7%),
 * 남은 가능성이 이 레이어다.
 *
 * ⚠ 해상도 한계(정직하게 명시):
 *   5분 단위 파생 히스토리는 Bitget 2.5시간 / OKX 2일뿐이라 표본이 안 나온다.
 *   그래서 OKX 1시간 단위(30일)로 재현한다. 라이브는 30분 테이커 비율을 쓰지만
 *   여기선 1시간 비율이다 — "파생 레이어의 방향이 도움이 되는가"를 재는 것이지
 *   라이브를 그대로 복제하는 게 아니다.
 *
 * ⚠ 미래 참조 금지: 파생도 결정 시점 이전에 '완결된' 1시간 봉만 쓴다.
 *
 * 실행: npx tsx scripts/backtest-deriv.ts [일수] [심볼,...]
 */
import type { Candle } from '../lib/coinAnalysis';

const BITGET = 'https://api.bitget.com';
const OKX = 'https://www.okx.com';
const GRAN_MS = { '5m': 300_000, '15m': 900_000, '1H': 3_600_000, '4H': 14_400_000, '1D': 86_400_000 } as const;
type Gran = keyof typeof GRAN_MS;
const HOUR = GRAN_MS['1H'];

const CCY: Record<string, string> = { BTCUSDT: 'BTC', ETHUSDT: 'ETH', SOLUSDT: 'SOL', XRPUSDT: 'XRP' };

async function fetchHistory(symbol: string, gran: Gran, days: number): Promise<Candle[]> {
  const need = Math.ceil((days * 86_400_000) / GRAN_MS[gran]);
  const out: Candle[] = [];
  let endTime = Date.now();
  while (out.length < need) {
    const url = `${BITGET}/api/v2/mix/market/history-candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=${gran}&limit=200&endTime=${endTime}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) break;
    const rows: string[][] = (await res.json())?.data ?? [];
    if (!rows.length) break;
    const batch = rows.map((r) => ({
      ts: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]),
      v: Number(r[5]), qv: Number(r[6] ?? 0),
    })).filter((c) => c.c > 0);
    out.unshift(...batch);
    const oldest = Math.min(...batch.map((c) => c.ts));
    if (!Number.isFinite(oldest) || oldest >= endTime) break;
    endTime = oldest;
    await new Promise((r) => setTimeout(r, 100));
  }
  const m = new Map<number, Candle>();
  for (const c of out) m.set(c.ts, c);
  return [...m.values()].sort((a, b) => a.ts - b.ts);
}

/** OKX rubik 시계열 → [ts, v1, v2] */
async function okxSeries(path: string, ccy: string, extra = ''): Promise<[number, number, number][]> {
  try {
    const r = await fetch(`${OKX}/api/v5/rubik/stat/${path}?ccy=${ccy}&period=1H${extra}`, { signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    return ((j?.data ?? []) as string[][])
      .map((x) => [Number(x[0]), Number(x[1]), Number(x[2] ?? 0)] as [number, number, number])
      .filter((x) => Number.isFinite(x[0]))
      .sort((a, b) => a[0] - b[0]);
  } catch { return []; }
}

/** 결정 시점까지 완결된 마지막 항목의 인덱스 (없으면 -1) */
function lastCompletedIdx(series: [number, number, number][], decisionTs: number): number {
  let i = series.length - 1;
  while (i >= 0 && series[i][0] + HOUR > decisionTs) i--;
  return i;
}

interface Trade { dir: string; score: number; result: 'win' | 'loss' | 'open' }

async function run(symbol: string, days: number, useDeriv: boolean, cache: {
  c5: Candle[]; c15: Candle[]; c1h: Candle[];
  taker: [number, number, number][]; oi: [number, number, number][]; ls: [number, number, number][];
}) {
  const { analyzeTimeframe, srZones, fibonacci, atr, buildVerdict } = await import('../lib/coinAnalysis');
  const { c5, c15, c1h, taker, oi, ls } = cache;
  const trades: Trade[] = [];
  let derivApplied = 0;
  let openUntil = -1;

  const slice = (arr: Candle[], decisionTs: number, limit: number, g: number) => {
    let end = arr.length;
    while (end > 0 && arr[end - 1].ts + g > decisionTs) end--;
    return arr.slice(Math.max(0, end - limit), end);
  };

  for (let i = 80; i < c5.length - 1; i += 3) {
    if (i <= openUntil) continue;
    const decisionTs = c5[i].ts + GRAN_MS['5m'];
    const s5 = slice(c5, decisionTs, 160, GRAN_MS['5m']);
    const s15 = slice(c15, decisionTs, 160, GRAN_MS['15m']);
    const s1h = slice(c1h, decisionTs, 120, GRAN_MS['1H']);
    if (s5.length < 60 || s15.length < 60 || s1h.length < 60) continue;

    const h1 = analyzeTimeframe('1H', s1h);
    const m15 = analyzeTimeframe('15m', s15);
    const m5 = analyzeTimeframe('5m', s5);
    const price = m5.close;
    const zones = srZones(s15, price, atr(s15));
    const fib = fibonacci(s15, price);

    // ── 파생 extras 재현 (완결된 1H 항목만) ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let extras: any = {};
    let lsRatio: number | null = null;
    if (useDeriv) {
      const ti = lastCompletedIdx(taker, decisionTs);
      const oiIdx = lastCompletedIdx(oi, decisionTs);
      const lsIdx = lastCompletedIdx(ls, decisionTs);
      if (ti >= 1 && oiIdx >= 1 && lsIdx >= 0) {
        // OKX taker-volume = [ts, sellVol, buyVol]
        const sell = taker[ti][1], buy = taker[ti][2];
        const takerRatio = sell > 0 ? buy / sell : null;
        const cumDelta = (taker[ti][2] - taker[ti][1]) + (taker[ti - 1][2] - taker[ti - 1][1]);
        const closes = s5.map((c) => c.c);
        const p12 = closes.length > 12 ? closes[closes.length - 13] : null;
        const pChg12 = p12 ? ((price - p12) / p12) * 100 : 0;
        let takerDivergence: 'bullish' | 'bearish' | null = null;
        if (pChg12 >= 0.3 && cumDelta < 0) takerDivergence = 'bearish';
        else if (pChg12 <= -0.3 && cumDelta > 0) takerDivergence = 'bullish';
        const oiNow = oi[oiIdx][1], oiPrev = oi[oiIdx - 1][1];
        const oiChange1hPct = oiPrev > 0 ? ((oiNow - oiPrev) / oiPrev) * 100 : null;
        lsRatio = ls[lsIdx][1] || null;
        extras = { takerRatio, takerDivergence, oiChange1hPct, priceChange1hPct: pChg12 };
        derivApplied++;
      }
    }

    const v = buildVerdict(h1, m15, m5, 0, null, fib, zones, lsRatio, extras);
    if (!v.entryOk || v.direction === 'wait') continue;

    const entry = price, stop = v.stop;
    const risk = Math.abs(entry - stop);
    if (risk <= 0) continue;
    const target = v.direction === 'long' ? entry + risk : entry - risk;
    let result: Trade['result'] = 'open';
    let j = i + 1;
    for (; j < Math.min(c5.length, i + 1 + 96); j++) {
      const b = c5[j];
      if (v.direction === 'long') {
        if (b.l <= stop) { result = 'loss'; break; }
        if (b.h >= target) { result = 'win'; break; }
      } else {
        if (b.h >= stop) { result = 'loss'; break; }
        if (b.l <= target) { result = 'win'; break; }
      }
    }
    trades.push({ dir: v.direction, score: v.score, result });
    openUntil = j;
  }
  return { trades, derivApplied };
}

function stat(ts: Trade[]) {
  const w = ts.filter((t) => t.result === 'win').length;
  const l = ts.filter((t) => t.result === 'loss').length;
  const c = w + l;
  return { n: ts.length, w, l, c, wr: c ? (w / c) * 100 : 0, ev: c ? (w - l) / c : 0, se: c ? Math.sqrt(0.25 / c) * 100 : 0 };
}

async function main() {
  const days = Number(process.argv[2] ?? 28);   // OKX 파생이 30일까지라 그 안에서
  const symbols = (process.argv[3] ?? 'BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT').split(',');
  console.log(`파생 레이어 A/B · ${symbols.join(', ')} · 최근 ${days}일 · 파생은 OKX 1H(완결봉만)\n`);

  const allBase: Trade[] = [], allDeriv: Trade[] = [];
  console.log('심볼       파생  신호   승   패   승률      기대값(R)   파생적용');
  for (const sym of symbols) {
    const ccy = CCY[sym] ?? sym.replace('USDT', '');
    const [c5, c15, c1h, taker, oi, ls] = await Promise.all([
      fetchHistory(sym, '5m', days), fetchHistory(sym, '15m', days), fetchHistory(sym, '1H', days),
      okxSeries('taker-volume', ccy, '&instType=CONTRACTS'),
      okxSeries('contracts/open-interest-volume', ccy),
      okxSeries('contracts/long-short-account-ratio', ccy),
    ]);
    if (!taker.length || !oi.length) { console.log(`${sym}: 파생 데이터 없음 — 건너뜀`); continue; }
    const cache = { c5, c15, c1h, taker, oi, ls };
    for (const useDeriv of [false, true]) {
      const r = await run(sym, days, useDeriv, cache);
      const s = stat(r.trades);
      (useDeriv ? allDeriv : allBase).push(...r.trades);
      console.log(
        `${sym.padEnd(10)} ${(useDeriv ? '적용' : '없음').padEnd(5)} ${String(s.n).padStart(4)} ${String(s.w).padStart(4)} ${String(s.l).padStart(4)} ` +
        `${s.wr.toFixed(1).padStart(6)}%  ${s.ev.toFixed(3).padStart(8)}   ${useDeriv ? r.derivApplied : ''}`,
      );
    }
  }

  console.log('\n=== 합계 ===');
  const b = stat(allBase), d = stat(allDeriv);
  console.log(`  가격만      청산 ${String(b.c).padStart(4)} · 승률 ${b.wr.toFixed(1)}% (±${b.se.toFixed(1)}%p) · 기대값 ${b.ev.toFixed(3)}R`);
  console.log(`  파생 포함    청산 ${String(d.c).padStart(4)} · 승률 ${d.wr.toFixed(1)}% (±${d.se.toFixed(1)}%p) · 기대값 ${d.ev.toFixed(3)}R`);
  const diff = d.wr - b.wr;
  const seDiff = Math.sqrt(b.se ** 2 + d.se ** 2);
  console.log(`\n  차이 ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%p (합성 오차 ±${seDiff.toFixed(1)}%p) → ${Math.abs(diff) > seDiff * 1.96 ? '✅ 통계적으로 유의' : '⚠ 오차범위 안 — 엣지 근거 없음'}`);

  // 파생 신호가 강한 구간만 따로
  console.log('\n=== 파생 포함 시 |score| 구간별 ===');
  for (const [lo, hi] of [[45, 55], [55, 65], [65, 80], [80, 999]] as [number, number][]) {
    const sub = allDeriv.filter((t) => Math.abs(t.score) >= lo && Math.abs(t.score) < hi && t.result !== 'open');
    const s = stat(sub);
    console.log(`  |score| ${lo}~${hi === 999 ? '∞' : hi}: n=${String(s.c).padStart(3)} 승률 ${s.c ? s.wr.toFixed(1).padStart(5) : '  -  '}% 기대값 ${s.c ? s.ev.toFixed(3) : '-'}R`);
  }
}

main();
