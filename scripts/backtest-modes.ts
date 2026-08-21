/**
 * 3모드 진입엔진(lib/coinSignalModes.ts) 엣지 측정 — "정교해 보임 ≠ 측정된 우위"를 잰다.
 *
 * 배경: coin-signal에서 이관한 SCALP·SWING·POSITION 3모드 엔진은 아직 한 번도
 * 백테스트를 거치지 않았다(PROJECT_STATUS §0). 여기서 라이브 /api/coin-signal 과
 * 동일한 buildModes 를 과거 캔들에 돌려, state===TRADE/ULTRA 신호가
 * 방향성 우위를 갖는지(승률이 손익분기 50%를 넘는지) 잰다.
 *
 * 라이브와의 정합:
 *   - 입력: 5TF 캔들만(derivs/macro/etf 제외). 라이브 경량 라우트도 캔들 위주이고,
 *     파생 레이어는 이미 엣지 없음이 확인됨(§0 backtest-deriv 49.7%→48.4%, 오차범위).
 *     캔들만 쓰면 flowPts 가 낮아 TRADE 문턱이 오히려 더 빡세다(표본 보수적).
 *   - state 판정·문턱·추격감쇠는 엔진 그대로. 우리가 손대는 건 진입/청산 시뮬뿐.
 *
 * ⚠ 미래 참조 금지: 각 결정 시점마다 '완결된' 봉만 슬라이스해 buildModes 에 넣는다.
 * ⚠ vwapDay 는 실시간 '오늘' 기준이라 과거 슬라이스에선 last-96 폴백으로 동작(결정적·무lookahead).
 *
 * 청산 규칙:
 *   - 진입: 신호 발생 봉의 종가에 시장가 진입(= "앱이 TRADE라 해서 들어감").
 *   - 대칭 1R: target = entry ± |entry-invalidation|. 승률을 50% 손익분기와 직접 비교.
 *   - 엔진 RR: TP1/invalidation 을 그대로 써 기대값(R)도 별도 집계.
 *   - 수수료: 왕복 테이커를 R 로 환산해 차감(기본 0.3R, 기존 스크립트와 동일 가정).
 *
 * 실행: npx tsx scripts/backtest-modes.ts [일수] [심볼,...]
 *   예: npx tsx scripts/backtest-modes.ts 45 BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT
 */
import { buildModes, type Candle } from '../lib/coinSignalModes';

const BITGET = 'https://api.bitget.com';
const GRAN_MS = { '5m': 300_000, '15m': 900_000, '1H': 3_600_000, '4H': 14_400_000, '1D': 86_400_000 } as const;
type Gran = keyof typeof GRAN_MS;

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
    const batch = rows
      .map((r) => ({ ts: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), v: Number(r[5]), qv: Number(r[6] ?? 0) }))
      .filter((c) => c.c > 0);
    out.unshift(...batch);
    const oldest = Math.min(...batch.map((c) => c.ts));
    if (!Number.isFinite(oldest) || oldest >= endTime) break;
    endTime = oldest;
    await new Promise((r) => setTimeout(r, 110));
  }
  const seen = new Map<number, Candle>();
  for (const c of out) seen.set(c.ts, c);
  return [...seen.values()].sort((a, b) => a.ts - b.ts);
}

/** decisionTs 이전에 완결된 봉만, 최대 limit 개 */
function sliceCompleted(candles: Candle[], decisionTs: number, limit: number, granMs: number): Candle[] {
  let end = candles.length;
  while (end > 0 && candles[end - 1].ts + granMs > decisionTs) end--;
  return candles.slice(Math.max(0, end - limit), end);
}

type ModeKey = 'scalp' | 'swing' | 'position';
const MODES: ModeKey[] = ['scalp', 'swing', 'position'];
// 모드별 최대 보유(5m 봉 수): scalp 8h, swing 48h, position 10d
const MAX_HOLD: Record<ModeKey, number> = { scalp: 96, swing: 576, position: 2880 };

interface Trade { mode: ModeKey; dir: 'LONG' | 'SHORT'; state: string; eq: number; conf: number; dirAbs: number;
  result: 'win' | 'loss' | 'open'; rrWin: number; feeR: number }

function run(symbol: string, c5: Candle[], c15: Candle[], c1h: Candle[], c4h: Candle[], c1d: Candle[], feeR: number) {
  const trades: Trade[] = [];
  const openUntil: Record<ModeKey, number> = { scalp: -1, swing: -1, position: -1 };
  // 1시간(=12개 5m봉) 간격으로 결정 → 5개 프레임 재구성 후 3모드 동시 판정
  for (let i = 240; i < c5.length - 1; i += 12) {
    const decisionTs = c5[i].ts + GRAN_MS['5m'];
    const s5 = sliceCompleted(c5, decisionTs, 300, GRAN_MS['5m']);
    const s15 = sliceCompleted(c15, decisionTs, 300, GRAN_MS['15m']);
    const s1h = sliceCompleted(c1h, decisionTs, 300, GRAN_MS['1H']);
    const s4h = sliceCompleted(c4h, decisionTs, 250, GRAN_MS['4H']);
    const s1d = sliceCompleted(c1d, decisionTs, 400, GRAN_MS['1D']);
    if (s5.length < 60 || s15.length < 60 || s1h.length < 60 || s4h.length < 30 || s1d.length < 30) continue;

    const modes = buildModes({ candles: { c5m: s5, c15m: s15, c1h: s1h, c4h: s4h, c1d: s1d } });
    const price = s5[s5.length - 1].c;

    for (const mk of MODES) {
      if (i <= openUntil[mk]) continue;
      const sig = modes[mk];
      if (sig.state !== 'TRADE' || sig.dirLabel === 'WAIT') continue; // TRADE만(ULTRA는 TRADE의 상위집합)
      const stop = sig.invalidation, tp1 = sig.tp1;
      if (stop == null || tp1 == null) continue;
      const risk = Math.abs(price - stop);
      if (risk <= 0) continue;
      const long = sig.dirLabel === 'LONG';
      // 손절이 진입 잘못된 쪽(예: 롱인데 stop>price)이면 건너뜀(엔진 존 산출 이상치)
      if (long ? stop >= price : stop <= price) continue;
      const reward = Math.abs(tp1 - price);
      const rrWin = risk > 0 ? reward / risk : 0;
      const target1R = long ? price + risk : price - risk; // 대칭 1R

      let result: Trade['result'] = 'open';
      let j = i + 1;
      for (; j < Math.min(c5.length, i + 1 + MAX_HOLD[mk]); j++) {
        const b = c5[j];
        if (long) {
          if (b.l <= stop) { result = 'loss'; break; }
          if (b.h >= target1R) { result = 'win'; break; }
        } else {
          if (b.h >= stop) { result = 'loss'; break; }
          if (b.l <= target1R) { result = 'win'; break; }
        }
      }
      trades.push({ mode: mk, dir: long ? 'LONG' : 'SHORT', state: sig.state, eq: sig.entryQuality,
        conf: sig.confidence, dirAbs: Math.abs(sig.direction), result, rrWin, feeR });
      openUntil[mk] = j;
    }
  }
  return trades;
}

function stat(ts: Trade[]) {
  const w = ts.filter((t) => t.result === 'win').length;
  const l = ts.filter((t) => t.result === 'loss').length;
  const c = w + l;
  const wr = c ? (w / c) * 100 : 0;
  const se = c ? Math.sqrt(0.25 / c) * 100 : 0;
  const ev1R = c ? (w - l) / c : 0;                     // 대칭 1R 기대값
  const evEng = c ? ts.filter((t) => t.result !== 'open')
    .reduce((a, t) => a + (t.result === 'win' ? t.rrWin - t.feeR : -1 - t.feeR), 0) / c : 0; // 엔진 RR·수수료 반영
  return { n: ts.length, w, l, c, wr, se, ev1R, evEng };
}

async function main() {
  const days = Number(process.argv[2] ?? 45);
  const symbols = (process.argv[3] ?? 'BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT').split(',');
  const feeR = 0.3;
  console.log(`3모드 엔진 엣지 측정 · ${symbols.join(', ')} · 최근 ${days}일 · 캔들만(라이브 경량 라우트와 동일) · 수수료 ${feeR}R\n`);

  const all: Trade[] = [];
  console.log('심볼       모드       신호   승   패   승률      기대값1R   기대값(엔진RR·수수료)');
  for (const sym of symbols) {
    const [c5, c15, c1h, c4h, c1d] = await Promise.all([
      fetchHistory(sym, '5m', days), fetchHistory(sym, '15m', days), fetchHistory(sym, '1H', days),
      fetchHistory(sym, '4H', days + 120), fetchHistory(sym, '1D', days + 400),
    ]);
    const trades = run(sym, c5, c15, c1h, c4h, c1d, feeR);
    all.push(...trades);
    for (const mk of MODES) {
      const s = stat(trades.filter((t) => t.mode === mk));
      console.log(
        `${sym.padEnd(10)} ${mk.padEnd(9)} ${String(s.n).padStart(4)} ${String(s.w).padStart(4)} ${String(s.l).padStart(4)} ` +
        `${s.c ? s.wr.toFixed(1).padStart(6) : '   -  '}%  ${s.c ? s.ev1R.toFixed(3).padStart(8) : '     -  '}   ${s.c ? s.evEng.toFixed(3) : '-'}`,
      );
    }
  }

  console.log('\n=== 모드별 합계 ===');
  for (const mk of MODES) {
    const s = stat(all.filter((t) => t.mode === mk));
    console.log(
      `  ${mk.padEnd(9)} 신호 ${String(s.n).padStart(4)} · 청산 ${String(s.c).padStart(4)} · ` +
      `승률 ${s.c ? s.wr.toFixed(1) : '-'}% (±${s.se.toFixed(1)}%p) · 기대값1R ${s.c ? s.ev1R.toFixed(3) : '-'}R · 엔진RR ${s.c ? s.evEng.toFixed(3) : '-'}R`,
    );
  }
  const S = stat(all);
  console.log('\n=== 전체 합계 ===');
  console.log(`  신호 ${S.n} · 청산 ${S.c} (미청산 ${S.n - S.c}) · 승률 ${S.c ? S.wr.toFixed(1) : '-'}% (±${S.se.toFixed(1)}%p)`);
  console.log(`  기대값(대칭1R) ${S.c ? S.ev1R.toFixed(3) : '-'}R · 기대값(엔진RR·수수료 ${feeR}R) ${S.c ? S.evEng.toFixed(3) : '-'}R`);
  console.log(`  손익분기 승률 50%(1R:1R). 수수료 반영 시 ${(50 * 1.3).toFixed(0)}% 근처 필요.`);
  const edge = S.wr - 50, z = S.se ? edge / S.se : 0;
  console.log(`  → 50% 대비 ${edge >= 0 ? '+' : ''}${edge.toFixed(1)}%p (z=${z.toFixed(2)}) ${Math.abs(z) > 1.96 ? (edge > 0 ? '✅ 유의미한 우위' : '❌ 유의미한 열위') : '⚠ 오차범위 안 — 엣지 근거 없음'}`);

  console.log('\n=== Entry Quality 구간별(문턱 튜닝 근거) ===');
  for (const [lo, hi] of [[62, 70], [70, 80], [80, 101]] as [number, number][]) {
    const s = stat(all.filter((t) => t.eq >= lo && t.eq < hi && t.result !== 'open'));
    console.log(`  EQ ${lo}~${hi === 101 ? '100' : hi}: n=${String(s.c).padStart(3)} 승률 ${s.c ? s.wr.toFixed(1).padStart(5) : '  -  '}% 기대값1R ${s.c ? s.ev1R.toFixed(3) : '-'}R`);
  }
  console.log('\n=== 방향별 (숏 편향=하락장 베타 여부 점검) ===');
  for (const d of ['LONG', 'SHORT'] as const) {
    const s = stat(all.filter((t) => t.dir === d && t.result !== 'open'));
    console.log(`  ${d}: n=${String(s.c).padStart(3)} 승률 ${s.c ? s.wr.toFixed(1) : '-'}% 기대값1R ${s.c ? s.ev1R.toFixed(3) : '-'}R`);
  }
}

main();
