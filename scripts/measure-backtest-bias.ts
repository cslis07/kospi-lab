/**
 * 백테스트 편향 측정 — "지금 성적표를 얼마나 믿을 수 있나"를 수치로 낸다.
 *
 * 현재 백테스트에는 세 가지 결함이 있다(전체 점검에서 확정):
 *   H-2a  sliceUpTo 가 봉 '시작'시각으로 잘라 1H 지표가 미래를 본다
 *   H-2b  vwapCalc 가 서버 현재시각 기준이라 과거 구간에서 VWAP 가 대부분 null
 *   M-6   emaSeries 시드가 죽어 있어 ema200 이 사실상 EMA 가 아니다
 *
 * 이 스크립트는 원본 엔진과 '결함 제거판'을 같은 데이터로 돌려 성적 차이를 비교한다.
 * 실행: npx tsx scripts/measure-backtest-bias.ts
 */
import type { Candle } from '../lib/coinAnalysis';

const BITGET = 'https://api.bitget.com';

async function fetchCandles(symbol: string, granularity: string, limit: number): Promise<Candle[]> {
  const url = `${BITGET}/api/v2/mix/market/candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=${granularity}&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const j = await res.json();
  const rows: string[][] = j?.data ?? [];
  return rows
    .map((r) => ({ ts: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), v: Number(r[5]), qv: Number(r[6] ?? 0) }))
    .filter((c) => c.c > 0)
    .sort((a, b) => a.ts - b.ts);
}

const GRAN_MS: Record<string, number> = { '5m': 300_000, '15m': 900_000, '1H': 3_600_000 };

/** 결함 있는 현재 방식: 봉 시작시각 기준 — 마지막 봉이 미래를 포함한다 */
function sliceCurrent(candles: Candle[], ts: number, limit: number): Candle[] {
  let end = candles.length;
  while (end > 0 && candles[end - 1].ts > ts) end--;
  return candles.slice(Math.max(0, end - limit), end);
}
/** 고친 방식: 결정 시점까지 '완결된' 봉만 */
function sliceFixed(candles: Candle[], decisionTs: number, limit: number, granMs: number): Candle[] {
  let end = candles.length;
  while (end > 0 && candles[end - 1].ts + granMs > decisionTs) end--;
  return candles.slice(Math.max(0, end - limit), end);
}

async function main() {
  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  const { analyzeTimeframe, srZones, fibonacci, atr, buildVerdict } = await import('../lib/coinAnalysis');

  console.log('=== 1) 미래 참조량 실측 ===');
  for (const sym of symbols) {
    const [c5, c15, c1h] = await Promise.all([
      fetchCandles(sym, '5m', 1000), fetchCandles(sym, '15m', 500), fetchCandles(sym, '1H', 250),
    ]);
    let n = 0, sum15 = 0, sum1h = 0, max1h = 0;
    for (let i = 80; i < c5.length - 1; i += 3) {
      const nowTs = c5[i].ts;
      const decisionTs = nowTs + GRAN_MS['5m'];   // 5분봉 종가 확정 시점
      const s15 = sliceCurrent(c15, nowTs, 160);
      const s1h = sliceCurrent(c1h, nowTs, 120);
      if (!s15.length || !s1h.length) continue;
      const f15 = Math.max(0, (s15[s15.length - 1].ts + GRAN_MS['15m'] - decisionTs) / 60000);
      const f1h = Math.max(0, (s1h[s1h.length - 1].ts + GRAN_MS['1H'] - decisionTs) / 60000);
      sum15 += f15; sum1h += f1h; max1h = Math.max(max1h, f1h); n++;
    }
    console.log(`  ${sym}: 표본 ${n} · 15m 마지막봉 평균 ${(sum15 / n).toFixed(1)}분 미래 · 1H 평균 ${(sum1h / n).toFixed(1)}분(최대 ${max1h.toFixed(0)}분) 미래`);
  }

  console.log('\n=== 2) 성적표 비교 (현재 엔진 vs 미래참조 제거) ===');
  console.log('심볼      방식        신호  승  패  승률     기대값(R)');
  const totals = { cur: { s: 0, w: 0, l: 0 }, fix: { s: 0, w: 0, l: 0 } };

  for (const sym of symbols) {
    const [c5, c15, c1h] = await Promise.all([
      fetchCandles(sym, '5m', 1000), fetchCandles(sym, '15m', 500), fetchCandles(sym, '1H', 250),
    ]);

    for (const mode of ['cur', 'fix'] as const) {
      let signals = 0, wins = 0, losses = 0, openUntil = -1;
      for (let i = 80; i < c5.length - 1; i += 3) {
        if (i <= openUntil) continue;
        const nowTs = c5[i].ts;
        const decisionTs = nowTs + GRAN_MS['5m'];
        const s5 = mode === 'cur' ? sliceCurrent(c5, nowTs, 160) : sliceFixed(c5, decisionTs, 160, GRAN_MS['5m']);
        const s15 = mode === 'cur' ? sliceCurrent(c15, nowTs, 160) : sliceFixed(c15, decisionTs, 160, GRAN_MS['15m']);
        const s1h = mode === 'cur' ? sliceCurrent(c1h, nowTs, 120) : sliceFixed(c1h, decisionTs, 120, GRAN_MS['1H']);
        if (s5.length < 60 || s15.length < 60 || s1h.length < 60) continue;

        const h1 = analyzeTimeframe('1H', s1h);
        const m15 = analyzeTimeframe('15m', s15);
        const m5 = analyzeTimeframe('5m', s5);
        const price = m5.close;
        const zones = srZones(s15, price, atr(s15));
        const fib = fibonacci(s15, price);
        const v = buildVerdict(h1, m15, m5, 0, null, fib, zones, null, {});
        if (!v.entryOk || v.direction === 'wait') continue;

        const entry = price, stop = v.stop;
        const risk = Math.abs(entry - stop);
        if (risk <= 0) continue;
        const target = v.direction === 'long' ? entry + risk : entry - risk;
        let res: 'win' | 'loss' | null = null;
        let j = i + 1;
        for (; j < Math.min(c5.length, i + 1 + 96); j++) {
          const b = c5[j];
          if (v.direction === 'long') {
            if (b.l <= stop) { res = 'loss'; break; }
            if (b.h >= target) { res = 'win'; break; }
          } else {
            if (b.h >= stop) { res = 'loss'; break; }
            if (b.l <= target) { res = 'win'; break; }
          }
        }
        signals++;
        if (res === 'win') wins++; else if (res === 'loss') losses++;
        openUntil = j;
      }
      const closed = wins + losses;
      const wr = closed ? (wins / closed) * 100 : null;
      const avgR = closed ? (wins - losses) / closed : null;
      totals[mode].s += signals; totals[mode].w += wins; totals[mode].l += losses;
      console.log(
        `${sym.padEnd(9)} ${(mode === 'cur' ? '현재(편향)' : '고침').padEnd(11)} ${String(signals).padStart(4)}  ${String(wins).padStart(2)}  ${String(losses).padStart(2)}  ` +
        `${wr != null ? `${wr.toFixed(1)}%`.padStart(6) : '  -   '}  ${avgR != null ? avgR.toFixed(3) : '-'}`,
      );
    }
  }

  console.log('\n=== 3) 합계 ===');
  for (const mode of ['cur', 'fix'] as const) {
    const t = totals[mode]; const closed = t.w + t.l;
    console.log(
      `  ${(mode === 'cur' ? '현재(편향)' : '고침').padEnd(11)} 신호 ${t.s} · 승 ${t.w} · 패 ${t.l} · ` +
      `승률 ${closed ? ((t.w / closed) * 100).toFixed(1) : '-'}% · 기대값 ${closed ? ((t.w - t.l) / closed).toFixed(3) : '-'}R`,
    );
  }
  const cc = totals.cur.w + totals.cur.l, fc = totals.fix.w + totals.fix.l;
  if (cc && fc) {
    const d = (totals.cur.w / cc) * 100 - (totals.fix.w / fc) * 100;
    console.log(`\n→ 미래참조가 승률을 ${d >= 0 ? '+' : ''}${d.toFixed(1)}%p 부풀리고 있었다`);
  }
}

main();
