/**
 * 급변 확률 계기판용 측정값 생성 → public/data/precursor-stats.json (앱은 이 파일만 읽는다 — 라이브에서 백테스트하지 않음)
 *
 * 신호 통계 = lib/crashPrecursor SIGNALS(파생 '개미 쏠림'은 30일 한도라 제외, OI 축적은 바이비트 1시간 OI) × 바이낸스 15분봉 365일.
 * 충격봉 통계 = shockEvents/shockStat × 15분봉 730일. 기준은 lib 머리말에 고정(결과 보고 바꾸지 말 것).
 * 실행: npx tsx scripts/precursor-stats.ts  (약 3~5분, 공개 API만) → 커밋하면 배포에 반영. 분기마다 다시 돌려 갱신.
 */
import { writeFileSync } from 'node:fs';
import { buildPoints, sigStat, SIGNALS, shockEvents, shockStat, type Bar, type DerivAt, type StatsFile } from '../lib/crashPrecursor';

const SIG_DAYS = 365, SHOCK_DAYS = 730;
const COINS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function klines(sym: string, days: number): Promise<Bar[]> {
  const out: Bar[] = [];
  let st = Date.now() - days * 86_400_000;
  while (st < Date.now() - 15 * 60_000) {
    let r: unknown = null;
    for (let k = 0; k < 4 && !Array.isArray(r); k++) { r = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=15m&limit=1500&startTime=${st}`).then((x) => x.json()).catch(() => null); if (!Array.isArray(r)) await sleep(800); }
    const rows = r as (string | number)[][];
    if (!Array.isArray(rows) || !rows.length) break;
    for (const k of rows) out.push({ ts: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] });
    st = +rows[rows.length - 1][0] + 15 * 60_000;
    await sleep(120);
  }
  return out.filter((b) => b.ts + 15 * 60_000 <= Date.now());
}

async function bybitOi(sym: string, days: number): Promise<(ts: number) => DerivAt | null> {
  const pts: { ts: number; v: number }[] = [];
  let et = Date.now();
  const start = Date.now() - days * 86_400_000;
  while (et > start) {
    const st = Math.max(start, et - 199 * 3_600_000);
    const j = await fetch(`https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${sym}&intervalTime=1h&limit=200&startTime=${st}&endTime=${et}`).then((r) => r.json()).catch(() => null);
    for (const x of (j?.result?.list ?? []) as { timestamp: string; openInterest: string }[]) pts.push({ ts: +x.timestamp, v: +x.openInterest });
    et = st - 1;
    await sleep(120);
  }
  const s = [...new Map(pts.map((p) => [p.ts, p])).values()].sort((a, b) => a.ts - b.ts);
  return (ts) => {
    let lo = 0, hi = s.length - 1, i = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (s[m].ts <= ts) { i = m; lo = m + 1; } else hi = m - 1; }
    if (i < 6 || ts - s[i].ts > 2 * 3_600_000) return null;
    return { crowd: null, oiChg6h: (s[i].v / s[i - 6].v - 1) * 100 };
  };
}

async function main() {
  const out: StatsFile = { generatedAt: new Date().toISOString(), days: { signals: SIG_DAYS, shock: SHOCK_DAYS }, coins: {}, pooledShockDown: null!, pooledShockUp: null! };
  const pool = { down: [] as ReturnType<typeof shockEvents>, up: [] as ReturnType<typeof shockEvents> };
  for (const sym of COINS) {
    const bars = await klines(sym, SHOCK_DAYS);
    const recent = bars.filter((b) => b.ts >= Date.now() - SIG_DAYS * 86_400_000);
    const pts = buildPoints(recent, await bybitOi(sym, SIG_DAYS));
    const signals: StatsFile['coins'][string]['signals'] = {};
    for (const s of SIGNALS.filter((x) => !x.needsCrowd)) {
      const st = sigStat(s.needsOi ? pts.filter((p) => p.oiBuild != null) : pts, s.fn);
      signals[s.key] = { n: st.n, dnRate: st.dnRate, upRate: st.upRate, baseDn: st.baseDn, baseUp: st.baseUp, zDn: st.zDn, zUp: st.zUp, verdictDn: st.verdictDn, verdictUp: st.verdictUp };
    }
    const ev = shockEvents(bars);
    const dn = ev.filter((e) => e.dir === 'down'), up = ev.filter((e) => e.dir === 'up');
    pool.down.push(...dn); pool.up.push(...up);
    out.coins[sym] = { signals, shockDown: shockStat(dn), shockUp: shockStat(up) };
    console.log(sym, 'ok', Object.entries(signals).map(([k, v]) => `${k}:${v.verdictDn}/${v.verdictUp}`).join(' '), `shock↓ ${out.coins[sym].shockDown.verdict}`);
  }
  out.pooledShockDown = shockStat(pool.down.sort((a, b) => a.ts - b.ts));
  out.pooledShockUp = shockStat(pool.up.sort((a, b) => a.ts - b.ts));
  writeFileSync('public/data/precursor-stats.json', JSON.stringify(out, (_k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)) + '\n');
  console.log('public/data/precursor-stats.json 저장 · 합산 하락 충격', out.pooledShockDown.verdict);
}
main().catch((e) => { console.error(e); process.exit(1); });
