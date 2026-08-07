/**
 * 백테스트 랩 — 큰 표본으로 엔진 성적을 정직하게 잰다.
 *
 * 프로덕션 백테스트(/api/coin-analysis)는 Bitget 1회 조회 한도(1000봉 = 83시간)에
 * 묶여 표본이 40건대에 그친다. 그 크기로는 승률 차이가 통계적으로 무의미하다.
 * 여기서는 history 엔드포인트로 과거를 페이지네이션해 수개월치를 모아 측정한다.
 *
 * 실행: npx tsx scripts/backtest-lab.ts [일수] [심볼,심볼]
 *   예: npx tsx scripts/backtest-lab.ts 60 BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT
 */
import type { Candle } from '../lib/coinAnalysis';

const BITGET = 'https://api.bitget.com';
const GRAN_MS = {
  '5m': 300_000, '15m': 900_000, '1H': 3_600_000,
  '4H': 14_400_000, '1D': 86_400_000,
} as const;
type Gran = keyof typeof GRAN_MS;

/** 과거 캔들 페이지네이션 — endTime 을 앞으로 밀며 모은다 */
async function fetchHistory(symbol: string, gran: Gran, days: number): Promise<Candle[]> {
  const need = Math.ceil((days * 86_400_000) / GRAN_MS[gran]);
  const out: Candle[] = [];
  let endTime = Date.now();
  while (out.length < need) {
    const url = `${BITGET}/api/v2/mix/market/history-candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=${gran}&limit=200&endTime=${endTime}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) break;
    const j = await res.json();
    const rows: string[][] = j?.data ?? [];
    if (!rows.length) break;
    const batch = rows
      .map((r) => ({ ts: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), v: Number(r[5]), qv: Number(r[6] ?? 0) }))
      .filter((c) => c.c > 0);
    out.unshift(...batch);
    const oldest = Math.min(...batch.map((c) => c.ts));
    if (!Number.isFinite(oldest) || oldest >= endTime) break;
    endTime = oldest;
    await new Promise((r) => setTimeout(r, 120));   // 공개 API 예의
  }
  // 중복 제거 + 정렬
  const seen = new Map<number, Candle>();
  for (const c of out) seen.set(c.ts, c);
  return [...seen.values()].sort((a, b) => a.ts - b.ts);
}

function sliceCompleted(candles: Candle[], decisionTs: number, limit: number, granMs: number): Candle[] {
  let end = candles.length;
  while (end > 0 && candles[end - 1].ts + granMs > decisionTs) end--;
  return candles.slice(Math.max(0, end - limit), end);
}

interface Trade { ts: number; dir: string; score: number; result: 'win' | 'loss' | 'open'; bars: number; rr: number }

/** 1H 봉을 묶어 상위 타임프레임 합성 (4H=4개, 1D=24개) */
function aggregate(candles: Candle[], factor: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i + factor <= candles.length; i += factor) {
    const ch = candles.slice(i, i + factor);
    out.push({
      ts: ch[0].ts, o: ch[0].o,
      h: Math.max(...ch.map((c) => c.h)), l: Math.min(...ch.map((c) => c.l)),
      c: ch[ch.length - 1].c,
      v: ch.reduce((a, c) => a + c.v, 0), qv: ch.reduce((a, c) => a + c.qv, 0),
    });
  }
  return out;
}

async function run(symbol: string, days: number, opts: { useHtf: boolean; feeR: number }, cache?: Candle[][]) {
  const { analyzeTimeframe, srZones, fibonacci, atr, buildVerdict } = await import('../lib/coinAnalysis');
  const [c5, c15, c1h] = cache ?? await Promise.all([
    fetchHistory(symbol, '5m', days),
    fetchHistory(symbol, '15m', days),
    fetchHistory(symbol, '1H', days),
  ]);
  // 라이브 엔진은 4H·1D 레짐 필터를 쓰는데 백테스트는 그동안 이걸 빼고 돌렸다.
  // 상위TF 는 지표 워밍업에 깊은 과거가 필요하므로 측정 구간보다 훨씬 길게 받는다
  // (1D 는 45일치면 45봉뿐이라 워밍업이 안 된다 — 실제로 이 조건에 걸려 필터가 통째로 무시됐었다).
  const [c4h, c1d] = opts.useHtf
    ? await Promise.all([fetchHistory(symbol, '4H', days + 120), fetchHistory(symbol, '1D', days + 400)])
    : [[] as Candle[], [] as Candle[]];

  const trades: Trade[] = [];
  let htfApplied = 0;
  let openUntil = -1;
  for (let i = 80; i < c5.length - 1; i += 3) {
    if (i <= openUntil) continue;
    const decisionTs = c5[i].ts + GRAN_MS['5m'];
    const s5 = sliceCompleted(c5, decisionTs, 160, GRAN_MS['5m']);
    const s15 = sliceCompleted(c15, decisionTs, 160, GRAN_MS['15m']);
    const s1h = sliceCompleted(c1h, decisionTs, 120, GRAN_MS['1H']);
    if (s5.length < 60 || s15.length < 60 || s1h.length < 60) continue;

    const h1 = analyzeTimeframe('1H', s1h);
    const m15 = analyzeTimeframe('15m', s15);
    const m5 = analyzeTimeframe('5m', s5);
    const price = m5.close;
    const zones = srZones(s15, price, atr(s15));
    const fib = fibonacci(s15, price);
    let extras = {};
    if (opts.useHtf) {
      const s4h = sliceCompleted(c4h, decisionTs, 250, GRAN_MS['4H']);
      const s1d = sliceCompleted(c1d, decisionTs, 250, GRAN_MS['1D']);
      if (s4h.length >= 60 && s1d.length >= 60) {
        extras = { htf: { h4: analyzeTimeframe('4H', s4h), d1: analyzeTimeframe('1D', s1d) } };
        htfApplied++;
      }
    }
    const v = buildVerdict(h1, m15, m5, 0, null, fib, zones, null, extras);
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
    // 수수료·슬리피지: 왕복 R 환산분을 차감
    const rr = result === 'win' ? 1 - opts.feeR : result === 'loss' ? -1 - opts.feeR : 0;
    trades.push({ ts: c5[i].ts, dir: v.direction, score: v.score, result, bars: j - i, rr });
    openUntil = j;
  }
  return { htfApplied, symbol, spanDays: c5.length ? (c5[c5.length - 1].ts - c5[0].ts) / 86_400_000 : 0, bars: c5.length, trades };
}

async function main() {
  const days = Number(process.argv[2] ?? 45);
  const symbols = (process.argv[3] ?? 'BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT').split(',');
  // 왕복 테이커 0.12% 를 손절폭 평균 0.2% 기준 R 로 환산 → 대략 0.6R. 보수적으로 0.3R 적용
  const feeR = 0.3;

  console.log(`표본 수집: ${symbols.join(', ')} · 최근 ${days}일 · 수수료 ${feeR}R 차감\n`);
  const all: Trade[] = [];
  const allHtf: Trade[] = [];
  console.log('심볼       레짐필터  신호   승   패   승률     기대값(R)');
  for (const s of symbols) {
    // 캔들은 한 번만 받아 두 모드에 공유
    const cache = await Promise.all([
      fetchHistory(s, '5m', days), fetchHistory(s, '15m', days), fetchHistory(s, '1H', days),
    ]);
    for (const useHtf of [false, true]) {
      const r = await run(s, days, { useHtf, feeR }, cache);
      const w = r.trades.filter((t) => t.result === 'win').length;
      const l = r.trades.filter((t) => t.result === 'loss').length;
      const closed = w + l;
      (useHtf ? allHtf : all).push(...r.trades);
      console.log(
        `${s.padEnd(10)} ${(useHtf ? '적용' : '없음').padEnd(9)} ${String(r.trades.length).padStart(5)} ` +
        `${String(w).padStart(4)} ${String(l).padStart(4)}  ${closed ? ((w / closed) * 100).toFixed(1).padStart(5) : '  -  '}%  ${closed ? ((w - l) / closed).toFixed(3).padStart(7) : '   -   '}` +
        `${useHtf ? `   (레짐 실제적용 ${r.htfApplied}회)` : ''}`,
      );
    }
  }

  const summary = (ts: Trade[], label: string) => {
    const w = ts.filter((t) => t.result === 'win').length;
    const l = ts.filter((t) => t.result === 'loss').length;
    const c = w + l;
    const se = c ? Math.sqrt(0.25 / c) * 100 : 0;
    console.log(
      `  ${label.padEnd(14)} 신호 ${String(ts.length).padStart(4)} · 청산 ${String(c).padStart(4)} · ` +
      `승률 ${c ? ((w / c) * 100).toFixed(1) : '-'}% (±${se.toFixed(1)}%p) · 기대값 ${c ? ((w - l) / c).toFixed(3) : '-'}R`,
    );
  };
  console.log('\n=== 레짐 필터 효과 ===');
  summary(all, '필터 없음');
  summary(allHtf, '필터 적용');

  const w = all.filter((t) => t.result === 'win').length;
  const l = all.filter((t) => t.result === 'loss').length;
  const closed = w + l;
  console.log(`\n=== 합계 ===`);
  console.log(`신호 ${all.length} · 승 ${w} · 패 ${l} · 승률 ${closed ? ((w / closed) * 100).toFixed(1) : '-'}%`);
  console.log(`기대값 ${closed ? ((w - l) / closed).toFixed(3) : '-'}R · 수수료 반영 ${closed ? (all.filter((t) => t.result !== 'open').reduce((a, t) => a + t.rr, 0) / closed).toFixed(3) : '-'}R`);
  console.log(`손익분기 승률 = 50% (1R 손절 / 1R 익절), 수수료 반영 시 ${(50 * (1 + 0.3)).toFixed(0)}% 근처 필요`);

  // 점수 구간별 성적 — 문턱을 올리면 나아지는지
  console.log('\n=== |score| 구간별 (문턱 튜닝 근거) ===');
  const bands: [number, number][] = [[45, 55], [55, 65], [65, 80], [80, 999]];
  for (const [lo, hi] of bands) {
    const sub = all.filter((t) => Math.abs(t.score) >= lo && Math.abs(t.score) < hi && t.result !== 'open');
    const sw = sub.filter((t) => t.result === 'win').length;
    const sl = sub.filter((t) => t.result === 'loss').length;
    const sc = sw + sl;
    console.log(`  |score| ${lo}~${hi === 999 ? '∞' : hi}: n=${String(sc).padStart(3)} 승률 ${sc ? ((sw / sc) * 100).toFixed(1).padStart(5) : '  -  '}% 기대값 ${sc ? ((sw - sl) / sc).toFixed(3) : '-'}R`);
  }

  console.log('\n=== 방향별 ===');
  for (const d of ['long', 'short']) {
    const sub = all.filter((t) => t.dir === d && t.result !== 'open');
    const sw = sub.filter((t) => t.result === 'win').length;
    const sc = sub.length;
    console.log(`  ${d}: n=${sc} 승률 ${sc ? ((sw / sc) * 100).toFixed(1) : '-'}%`);
  }
}

main();
