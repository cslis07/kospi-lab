/**
 * 급변 전조 측정 — lib/crashPrecursor 의 사전 등록 신호가 '다음 4시간 급락/급등' 확률을 실제로 바꾸나.
 *
 * 2026-10-24 ETH 급락(4코인 동시) 직전 모습(극단 압축·고점 하락·개미 롱 쏠림)을 일반화해 1년치로 잰다.
 * 판정 기준·신호는 lib/crashPrecursor 머리말에 고정(결과 보고 바꾸지 말 것). 대조군 = 같은 코인 전체 평가점.
 *
 * 데이터: 바이낸스 USDT 선물 15분봉(DAYS일) + 계정 롱숏 비율 5분(최근 30일, 거래소 제공 한도).
 * 실행: npx tsx scripts/backtest-crash-precursor.ts [일수=365] [--bybit-oi]
 *   --bybit-oi: 파생 신호 중 OI(박스권 레버리지 축적)만 바이비트 1시간 OI 로 1년치 검증
 */
import { buildPoints, sigStat, SIGNALS, type Bar, type DerivAt } from '../lib/crashPrecursor';

const DAYS = Number(process.argv[2] || 365);
const COINS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function get(u: string) {
  for (let k = 0; k < 4; k++) {
    const r = await fetch(u).then((x) => x.json()).catch(() => null);
    if (Array.isArray(r)) return r;
    await sleep(800 * (k + 1));
  }
  throw new Error('fetch fail ' + u);
}

async function klines(sym: string): Promise<Bar[]> {
  const out: Bar[] = [];
  let st = Date.now() - DAYS * 86_400_000;
  while (st < Date.now() - 15 * 60_000) {
    const r = await get(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=15m&limit=1500&startTime=${st}`);
    if (!r.length) break;
    for (const k of r) out.push({ ts: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] });
    st = r.at(-1)[0] + 15 * 60_000;
    await sleep(120);
  }
  // 아직 안 끝난 마지막 봉 제외
  return out.filter((b) => b.ts + 15 * 60_000 <= Date.now());
}

/** 바이낸스 선물 통계(5분, 최근 ~30일) — startTime+endTime 으로 페이지를 넘겨야 과거가 온다 */
async function series(path: string, sym: string, key: string): Promise<{ ts: number; v: number }[]> {
  const out: { ts: number; v: number }[] = [];
  let st = Date.now() - 29 * 86_400_000;
  while (st < Date.now()) {
    const et = st + 500 * 300_000;
    const r = await get(`https://fapi.binance.com/futures/data/${path}?symbol=${sym}&period=5m&limit=500&startTime=${st}&endTime=${et}`);
    for (const x of r) out.push({ ts: x.timestamp, v: +x[key] });
    st = et + 1;
    await sleep(150);
  }
  return [...new Map(out.map((p) => [p.ts, p])).values()].sort((x, y) => x.ts - y.ts);
}

/** 개미 롱 쏠림 증가(계정 롱숏 ≥ 직전 7일 평균+1σ, 2시간 전보다 높음) + OI 6시간 변화 */
async function derivFn(sym: string): Promise<(ts: number) => DerivAt | null> {
  const [ls, oi] = [await series('globalLongShortAccountRatio', sym, 'longShortRatio'), await series('openInterestHist', sym, 'sumOpenInterest')];
  const idx = (arr: { ts: number }[], ts: number) => { let lo = 0, hi = arr.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m].ts <= ts) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; };
  return (ts: number) => {
    const i = idx(ls, ts), j = idx(oi, ts);
    if (i < 2016 + 24 || j < 72) return null;
    if (ts - ls[i].ts > 15 * 60_000) return null;
    const win = ls.slice(i - 2016, i).map((p) => p.v);
    const m = win.reduce((a, b) => a + b, 0) / win.length;
    const sd = Math.sqrt(win.reduce((a, b) => a + (b - m) ** 2, 0) / win.length);
    return { crowd: ls[i].v >= m + sd && ls[i].v > ls[i - 24].v, oiChg6h: (oi[j].v / oi[j - 72].v - 1) * 100 };
  };
}


/** --bybit-oi: 바이비트 OI 1시간(1년치) — 박스권 레버리지 축적 신호만 장기 검증(바이낸스 파생은 30일 한도). 가격은 바이낸스 15분봉 그대로 */
async function bybitOiFn(sym: string): Promise<(ts: number) => DerivAt | null> {
  const pts: { ts: number; v: number }[] = [];
  let et = Date.now();
  const start = Date.now() - DAYS * 86_400_000;
  while (et > start) {
    const st = Math.max(start, et - 199 * 3_600_000);
    const j = await fetch(`https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${sym}&intervalTime=1h&limit=200&startTime=${st}&endTime=${et}`).then((r) => r.json()).catch(() => null);
    for (const x of j?.result?.list ?? []) pts.push({ ts: +x.timestamp, v: +x.openInterest });
    et = st - 1;
    await sleep(120);
  }
  const s = [...new Map(pts.map((p) => [p.ts, p])).values()].sort((a, b) => a.ts - b.ts);
  return (ts: number) => {
    let lo = 0, hi = s.length - 1, i = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (s[m].ts <= ts) { i = m; lo = m + 1; } else hi = m - 1; }
    if (i < 6 || ts - s[i].ts > 2 * 3_600_000) return null;
    return { crowd: null, oiChg6h: (s[i].v / s[i - 6].v - 1) * 100 };
  };
}
const BYBIT = process.argv.includes('--bybit-oi');

const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '–');
const V = { significant: '유의', noise: '우연', thin: '표본부족' } as const;

async function main() {
const all: Record<string, ReturnType<typeof buildPoints>> = {};
for (const sym of COINS) {
  const [bars, deriv] = [await klines(sym), BYBIT ? await bybitOiFn(sym) : await derivFn(sym)];
  const pts = buildPoints(bars, deriv);
  all[sym] = pts;
  console.log(`\n== ${sym} 15분봉 ${bars.length}개 · 평가점 ${pts.length}(시간) · 대조군 급락 ${f1(pts.filter((p) => p.bigDn).length / pts.length * 100)}% / 급등 ${f1(pts.filter((p) => p.bigUp).length / pts.length * 100)}%`);
  for (const s of SIGNALS) {
    const scope = s.needsCrowd ? pts.filter((p) => p.crowd != null) : s.needsOi ? pts.filter((p) => p.oiBuild != null) : pts;
    const st = sigStat(scope, s.fn);
    console.log(`  ${s.label}\n    n=${st.n} · 급락 ${f1(st.dnRate)}% (평소 ${f1(st.baseDn)}, z ${f1(st.zDn)}, 앞 ${f1(st.firstDn)}p 뒤 ${f1(st.secondDn)}p) → ${V[st.verdictDn]} · 급등 ${f1(st.upRate)}% (평소 ${f1(st.baseUp)}, z ${f1(st.zUp)}, 앞 ${f1(st.firstUp)}p 뒤 ${f1(st.secondUp)}p) → ${V[st.verdictUp]}`);
  }
}

// 4코인 합산(코인 내 에피소드 → 합침; 같은 시각 4코인은 같이 움직여 독립 아님 — 참고용)
const pooled = Object.values(all).flat().sort((a, b) => a.ts - b.ts);
console.log(`\n== 4코인 합산(참고 — 코인 간 상관 높아 독립 표본 아님) 평가점 ${pooled.length}`);
for (const s of SIGNALS) {
  const scope = s.needsCrowd ? pooled.filter((p) => p.crowd != null) : s.needsOi ? pooled.filter((p) => p.oiBuild != null) : pooled;
  const parts = COINS.map((c) => sigStat(s.needsCrowd ? all[c].filter((p) => p.crowd != null) : s.needsOi ? all[c].filter((p) => p.oiBuild != null) : all[c], s.fn));
  const n = parts.reduce((a, p) => a + p.n, 0);
  const w = (k: 'dnRate' | 'upRate' | 'baseDn' | 'baseUp') => parts.reduce((a, p) => a + (Number.isFinite(p[k]) ? p[k] * p.n : 0), 0) / Math.max(1, n);
  console.log(`  ${s.label}: 에피소드 ${n} · 급락 ${f1(w('dnRate'))}% vs 평소 ${f1(w('baseDn'))}% · 급등 ${f1(w('upRate'))}% vs 평소 ${f1(w('baseUp'))}% (평가점 ${scope.length})`);
}
}

main().catch((e) => { console.error(e); process.exit(1); });
