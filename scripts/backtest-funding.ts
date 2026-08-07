/**
 * 펀딩 캐리 전략 실험.
 *
 * 배경: 추세추종 방향성 베팅은 가격 층에도 파생 층에도 엣지가 없었다(49.7% / 48.4%).
 * 펀딩 캐리는 구조가 다르다 — 방향을 맞히는 게임이 아니라, 극단 펀딩 구간에서
 * 붐비는 쪽의 반대에 서서 (a) 펀딩 수취 (b) 과열 되돌림 두 가지를 노린다.
 *
 * 검증 대상 가설:
 *   H1. 펀딩이 극단적으로 높으면(롱 과열) 이후 수익률이 음(-)에 치우친다 → 숏 유리
 *   H2. 펀딩 수취분만으로도 기대값이 양(+)이다
 *
 * 데이터: Bitget 펀딩 히스토리(8시간 간격) + 1H 캔들. 미래 참조 없음 —
 *   펀딩이 확정된 시각 이후의 가격 변화만 측정한다.
 *
 * 실행: npx tsx scripts/backtest-funding.ts [보유시간] [심볼,...]
 */
const BITGET = 'https://api.bitget.com';

interface Funding { ts: number; rate: number }
interface Bar { ts: number; c: number }

async function fetchFunding(symbol: string): Promise<Funding[]> {
  const out: Funding[] = [];
  for (let page = 1; page <= 6; page++) {
    const url = `${BITGET}/api/v2/mix/market/history-fund-rate?symbol=${symbol}&productType=USDT-FUTURES&pageSize=100&pageNo=${page}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) break;
    const rows = ((await r.json())?.data ?? []) as { fundingRate: string; fundingTime: string }[];
    if (!rows.length) break;
    out.push(...rows.map((x) => ({ ts: Number(x.fundingTime), rate: Number(x.fundingRate) })));
    await new Promise((res) => setTimeout(res, 120));
  }
  const m = new Map<number, Funding>();
  for (const f of out) if (Number.isFinite(f.ts) && Number.isFinite(f.rate)) m.set(f.ts, f);
  return [...m.values()].sort((a, b) => a.ts - b.ts);
}

async function fetchBars(symbol: string, days: number): Promise<Bar[]> {
  const need = Math.ceil((days * 24));
  const out: Bar[] = [];
  let endTime = Date.now();
  while (out.length < need) {
    const url = `${BITGET}/api/v2/mix/market/history-candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=1H&limit=200&endTime=${endTime}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) break;
    const rows: string[][] = (await r.json())?.data ?? [];
    if (!rows.length) break;
    const batch = rows.map((x) => ({ ts: Number(x[0]), c: Number(x[4]) })).filter((b) => b.c > 0);
    out.unshift(...batch);
    const oldest = Math.min(...batch.map((b) => b.ts));
    if (!Number.isFinite(oldest) || oldest >= endTime) break;
    endTime = oldest;
    await new Promise((res) => setTimeout(res, 100));
  }
  const m = new Map<number, Bar>();
  for (const b of out) m.set(b.ts, b);
  return [...m.values()].sort((a, b) => a.ts - b.ts);
}

/** ts 시점 이후 첫 완결 1H 종가 */
function priceAt(bars: Bar[], ts: number): number | null {
  for (let i = 0; i < bars.length; i++) if (bars[i].ts >= ts) return bars[i].c;
  return null;
}

interface Row { sym: string; ts: number; rate: number; fwdPct: number; carryPct: number; netPct: number }

async function main() {
  const holdHours = Number(process.argv[2] ?? 8);
  const symbols = (process.argv[3] ?? 'BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT').split(',');
  console.log(`펀딩 캐리 실험 · 보유 ${holdHours}시간 · ${symbols.join(', ')}\n`);

  const all: Row[] = [];
  for (const sym of symbols) {
    const [fund, bars] = await Promise.all([fetchFunding(sym), fetchBars(sym, 120)]);
    if (!fund.length || !bars.length) { console.log(`${sym}: 데이터 없음`); continue; }
    for (const f of fund) {
      const p0 = priceAt(bars, f.ts);
      const p1 = priceAt(bars, f.ts + holdHours * 3_600_000);
      if (p0 == null || p1 == null || p0 <= 0) continue;
      // 붐비는 쪽의 반대: rate>0(롱 과열)이면 숏, rate<0이면 롱
      const side = f.rate > 0 ? -1 : 1;
      const fwdPct = ((p1 - p0) / p0) * 100;          // 가격 변화(롱 기준)
      const carryPct = Math.abs(f.rate) * 100;         // 반대편에 서면 펀딩 수취
      const netPct = side * fwdPct + carryPct;         // 방향 손익 + 캐리
      all.push({ sym, ts: f.ts, rate: f.rate, fwdPct, carryPct, netPct });
    }
    console.log(`${sym}: 펀딩 ${fund.length}건 · 1H봉 ${bars.length} · 사용 ${all.filter((r) => r.sym === sym).length}건`);
  }

  const stat = (rows: Row[], key: 'netPct' | 'carryPct') => {
    if (!rows.length) return { n: 0, mean: 0, se: 0, t: 0, win: 0 };
    const v = rows.map((r) => r[key]);
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, v.length - 1));
    const se = sd / Math.sqrt(v.length);
    return { n: v.length, mean, se, t: se ? mean / se : 0, win: (rows.filter((r) => r[key] > 0).length / rows.length) * 100 };
  };

  console.log(`\n=== H1·H2: 극단 펀딩 구간에서 반대편 포지션 (보유 ${holdHours}h) ===`);
  console.log('펀딩 절대값 구간      건수   방향손익%   캐리%    합계%    t값    합계>0 비율   판정');
  const bands: [number, number, string][] = [
    [0, 0.005, '0~0.005%'],
    [0.005, 0.01, '0.005~0.01%'],
    [0.01, 0.03, '0.01~0.03%'],
    [0.03, 999, '0.03%↑ (극단)'],
  ];
  for (const [lo, hi, label] of bands) {
    const sub = all.filter((r) => Math.abs(r.rate) * 100 >= lo && Math.abs(r.rate) * 100 < hi);
    if (!sub.length) { console.log(`${label.padEnd(20)} ${String(0).padStart(5)}`); continue; }
    const dir = sub.reduce((a, r) => a + (r.rate > 0 ? -1 : 1) * r.fwdPct, 0) / sub.length;
    const s = stat(sub, 'netPct');
    const sig = Math.abs(s.t) > 1.96;
    console.log(
      `${label.padEnd(20)} ${String(s.n).padStart(5)}  ${dir.toFixed(3).padStart(9)}  ${(sub.reduce((a, r) => a + r.carryPct, 0) / sub.length).toFixed(4).padStart(7)}  ` +
      `${s.mean.toFixed(3).padStart(7)}  ${s.t.toFixed(2).padStart(5)}  ${s.win.toFixed(1).padStart(9)}%   ${sig ? (s.mean > 0 ? '✅ 유의(+)' : '❌ 유의(-)') : '⚠ 무의미'}`,
    );
  }

  const total = stat(all, 'netPct');
  const carry = stat(all, 'carryPct');
  console.log(`\n=== 합계 ===`);
  console.log(`  전체 ${total.n}건 · 평균 합계손익 ${total.mean.toFixed(4)}% (±${total.se.toFixed(4)}, t=${total.t.toFixed(2)})`);
  console.log(`  캐리만 평균 ${carry.mean.toFixed(4)}% · 방향손익 평균 ${(total.mean - carry.mean).toFixed(4)}%`);
  console.log(`  → ${Math.abs(total.t) > 1.96 ? (total.mean > 0 ? '✅ 통계적으로 유의한 양의 기대값' : '❌ 유의하게 음수') : '⚠ 오차범위 안 — 엣지 근거 없음'}`);
  console.log(`\n  ※ 왕복 테이커 수수료 0.12% 대비: 평균 합계손익 ${total.mean.toFixed(4)}% → ${total.mean > 0.12 ? '수수료 넘김' : '수수료 미달(적자)'}`);
}

main();
