/**
 * 주식 룰 엔진 엣지 측정 — 코인에 했던 것과 같은 잣대를 국내 주식에도 댄다.
 *
 * 배경: 코인 엔진은 두 번(옛 룰엔진 49.7%, 3모드 41.7%) 측정해 "엣지 없음"을 확인했는데
 * 주식 엔진은 한 번도 대규모로 재지 않았다(PROJECT_STATUS §4 "주식 엔진 엣지 측정" 잔여).
 * 프로덕션 백테스트(/api/stock-analysis)는 1년·1종목이라 표본이 수십 건에 그친다.
 *
 * ⚠ 대조군이 핵심이다(펀딩 전략 탈락의 결정타였던 교훈):
 *   주식은 롱 온리라 상승장에서는 아무 데나 사도 이긴다. 따라서
 *   **같은 손절·목표 규칙으로 '진입 필터만 제거한' 대조군**과 비교해야
 *   "엔진의 진입 판정이 값어치를 하는가"를 잴 수 있다. 절대 승률은 시장 베타다.
 *
 * ⚠ technicalOnly=true — 과거 시점 수급·재무·공시 데이터를 재현할 수 없어 기술적 신호만 잰다.
 *   라이브 엔진은 수급(±35)까지 보므로 이 측정은 '엔진 하한'이다. 그 점을 결론에 명시한다.
 *
 * 실행: npx tsx scripts/backtest-stock-lab.ts [일봉수] [종목코드,...]
 *   예: npx tsx scripts/backtest-stock-lab.ts 750
 */
import { Candle, analyzeTimeframe, srZones, fibonacci, atr } from '../lib/coinAnalysis';
import { buildStockVerdict } from '../lib/stockAnalysis';

/** 기본 유니버스 — KOSPI·KOSDAQ 대형/중형 분산(키 없이 재현 가능하도록 고정) */
const DEFAULT_UNIVERSE = [
  // KOSPI 대형
  '005930', '000660', '373220', '207940', '005380', '005490', '035420', '051910',
  '006400', '035720', '105560', '055550', '012330', '028260', '068270', '066570',
  // KOSPI 중형·경기민감
  '010130', '011200', '086790', '316140', '033780', '090430', '018260', '009150',
  // KOSDAQ
  '247540', '086520', '196170', '145020', '058470', '039030', '278280', '357780',
];

const MAX_HOLD = 20;      // 영업일
const WARMUP = 70;
const FEE_R = 0.1;        // 국내 왕복 수수료·세금(매도 0.18%+수수료)을 R로 환산한 보수적 근사

/**
 * 네이버 fchart siseJson.
 * ⚠ `count=` 파라미터는 헤더행만 돌려준다(실측). 반드시 `startTime`/`endTime`(YYYYMMDD)을 써야 한다.
 * 응답은 작은따옴표 헤더 + 탭/개행 섞인 유사 JSON이라 정규화 후 파싱한다.
 */
async function fetchDaily(code: string, tradingDays: number): Promise<Candle[]> {
  const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const end = new Date();
  const start = new Date(end.getTime() - Math.ceil(tradingDays * 1.5) * 86_400_000);   // 거래일→달력일 여유
  const url = `https://fchart.stock.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${ymd(start)}&endTime=${ymd(end)}&timeframe=day`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml',
      Referer: 'https://finance.naver.com/',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return [];
  const raw = (await res.text()).trim();
  let rows: unknown[];
  try {
    rows = JSON.parse(raw.replace(/'/g, '"').replace(/,\s*]/g, ']'));
  } catch { return []; }
  const out: Candle[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 6) continue;
    const [d, o, h, l, c, v] = r as [string, number, number, number, number, number];
    if (typeof d !== 'string' || !/^\d{8}$/.test(d)) continue;   // 헤더행 스킵
    const ts = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
    if (!(c > 0)) continue;
    out.push({ ts, o: +o, h: +h, l: +l, c: +c, v: +v, qv: 0 });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

interface T { result: 'win' | 'loss'; score: number; days: number }

/**
 * 엔진 백테스트 + 대조군을 한 번의 순회로 계산한다.
 * 두 경로가 완전히 같은 손절·목표(1R)·보유상한 규칙을 쓰고, 다른 것은 '진입 필터'뿐이다.
 */
function run(candles: Candle[]) {
  const engine: T[] = [];
  const control: T[] = [];
  let openUntilE = -1, openUntilC = -1;

  for (let i = WARMUP; i < candles.length - 1; i++) {
    const win = candles.slice(Math.max(0, i - 250 + 1), i + 1);
    if (win.length < 60) continue;

    const daily = analyzeTimeframe('D', win);
    const price = daily.close;
    const zones = srZones(win, price, atr(win));
    const fib = fibonacci(win, price);
    const v = buildStockVerdict(daily, win, fib, zones, { technicalOnly: true });

    const stop = v.stop;
    const risk = price - stop;
    if (!(risk > 0)) continue;
    const target = price + risk;   // 1R 대칭 — 손익분기 승률 50%와 직접 비교

    // 같은 규칙으로 청산 시뮬레이션
    const settle = (): { result: 'win' | 'loss'; days: number; exitIdx: number } | null => {
      for (let j = i + 1; j < Math.min(candles.length, i + 1 + MAX_HOLD); j++) {
        const c = candles[j];
        if (c.l <= stop) return { result: 'loss', days: j - i, exitIdx: j };   // 동시 도달 → 보수적 손실
        if (c.h >= target) return { result: 'win', days: j - i, exitIdx: j };
      }
      return null;   // 미청산(보유상한 초과) — 집계에서 제외
    };

    const engineFires = v.entryOk && v.stance === 'buy';

    if (engineFires && i > openUntilE) {
      const s = settle();
      if (s) { engine.push({ result: s.result, score: v.score, days: s.days }); openUntilE = s.exitIdx; }
      else openUntilE = i + MAX_HOLD;
    }
    // 대조군: 진입 판정을 보지 않고 '매 기회마다' 같은 규칙으로 진입
    if (i > openUntilC) {
      const s = settle();
      if (s) { control.push({ result: s.result, score: v.score, days: s.days }); openUntilC = s.exitIdx; }
      else openUntilC = i + MAX_HOLD;
    }
  }
  return { engine, control };
}

function stat(ts: T[]) {
  const w = ts.filter((t) => t.result === 'win').length;
  const n = ts.length;
  const wr = n ? (w / n) * 100 : 0;
  return {
    n, w, l: n - w, wr,
    se: n ? Math.sqrt(0.25 / n) * 100 : 0,
    ev: n ? (w - (n - w)) / n : 0,
    evFee: n ? (w * (1 - FEE_R) - (n - w) * (1 + FEE_R)) / n : 0,
    days: n ? ts.reduce((a, t) => a + t.days, 0) / n : 0,
  };
}

async function main() {
  const count = Number(process.argv[2] ?? 750);
  const codes = (process.argv[3] ?? DEFAULT_UNIVERSE.join(',')).split(',').filter(Boolean);
  console.log(`주식 룰 엔진 엣지 측정 · ${codes.length}종목 · 일봉 ${count}개(약 ${(count / 250).toFixed(1)}년) · 보유상한 ${MAX_HOLD}영업일 · 수수료 ${FEE_R}R`);
  console.log(`⚠ technicalOnly — 과거 수급·재무 재현 불가로 기술적 신호만 측정(라이브는 수급 ±35 추가)\n`);

  const allE: T[] = [], allC: T[] = [];
  let spanFrom = Infinity, spanTo = -Infinity, okStocks = 0;
  console.log('종목       봉수   엔진신호  승률     대조군신호  승률     차이');
  for (const code of codes) {
    const candles = await fetchDaily(code, count);
    if (candles.length < WARMUP + 40) { console.log(`${code}     데이터 부족(${candles.length}봉) — 건너뜀`); continue; }
    okStocks++;
    spanFrom = Math.min(spanFrom, candles[0].ts);
    spanTo = Math.max(spanTo, candles[candles.length - 1].ts);
    const { engine, control } = run(candles);
    allE.push(...engine); allC.push(...control);
    const e = stat(engine), c = stat(control);
    console.log(
      `${code}   ${String(candles.length).padStart(5)}   ${String(e.n).padStart(6)}  ${e.n ? e.wr.toFixed(1).padStart(5) : '  -  '}%   ` +
      `${String(c.n).padStart(8)}  ${c.n ? c.wr.toFixed(1).padStart(5) : '  -  '}%   ${e.n && c.n ? `${(e.wr - c.wr >= 0 ? '+' : '')}${(e.wr - c.wr).toFixed(1)}%p` : '-'}`,
    );
    await new Promise((r) => setTimeout(r, 150));   // 네이버 예의
  }

  const E = stat(allE), C = stat(allC);
  if (!okStocks) { console.log('\n❌ 유효 표본 0 — 데이터 소스 확인 필요(파싱·차단)'); return; }
  const iso = (t: number) => (Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '-');
  console.log(`\n=== 표본 ===`);
  console.log(`  종목 ${okStocks} · 기간 ${iso(spanFrom)} ~ ${iso(spanTo)}`);
  console.log(`\n=== 엔진 (entryOk && stance=buy) ===`);
  console.log(`  청산 ${E.n} · 승 ${E.w} · 패 ${E.l} · 승률 ${E.wr.toFixed(1)}% (±${E.se.toFixed(1)}%p) · 기대값 ${E.ev.toFixed(3)}R · 수수료반영 ${E.evFee.toFixed(3)}R · 평균보유 ${E.days.toFixed(1)}일`);
  console.log(`\n=== 대조군 (진입 필터만 제거 · 손절/목표/보유 동일) ===`);
  console.log(`  청산 ${C.n} · 승 ${C.w} · 패 ${C.l} · 승률 ${C.wr.toFixed(1)}% (±${C.se.toFixed(1)}%p) · 기대값 ${C.ev.toFixed(3)}R`);

  const diff = E.wr - C.wr;
  const seDiff = Math.sqrt(E.se ** 2 + C.se ** 2);
  const z = seDiff ? diff / seDiff : 0;
  console.log(`\n=== 판정 ===`);
  console.log(`  엔진 − 대조군 = ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%p (합성오차 ±${seDiff.toFixed(1)}%p, z=${z.toFixed(2)})`);
  console.log(`  → ${Math.abs(z) > 1.96 ? (diff > 0 ? '✅ 진입 필터가 통계적으로 유의한 우위를 준다' : '❌ 진입 필터가 오히려 유의하게 해롭다') : '⚠ 오차범위 안 — 진입 필터의 엣지 근거 없음(절대 승률은 시장 베타)'}`);
  const zAbs = E.se ? (E.wr - 50) / E.se : 0;
  console.log(`  참고: 엔진 절대 승률의 50% 대비 ${E.wr - 50 >= 0 ? '+' : ''}${(E.wr - 50).toFixed(1)}%p (z=${zAbs.toFixed(2)}) — 롱온리라 이 값은 상승장 베타를 포함한다`);

  console.log(`\n=== 점수 구간별 (문턱 튜닝 근거 — 구간을 골라 쓰면 과적합) ===`);
  for (const [lo, hi] of [[0, 30], [30, 50], [50, 70], [70, 999]] as [number, number][]) {
    const s = stat(allE.filter((t) => t.score >= lo && t.score < hi));
    console.log(`  score ${lo}~${hi === 999 ? '∞' : hi}: n=${String(s.n).padStart(4)} 승률 ${s.n ? s.wr.toFixed(1).padStart(5) : '  -  '}% 기대값 ${s.n ? s.ev.toFixed(3) : '-'}R`);
  }
}

main();
