/**
 * 충격봉 이후 추가 하락 vs 반등 측정 — lib/crashPrecursor shockEvents/shockStat(기준 사전 고정).
 * 바이낸스 USDT 선물 15분봉 DAYS일, 4코인. 실행: npx tsx scripts/backtest-shock.ts [일수=730]
 */
import { shockEvents, shockStat, type Bar } from '../lib/crashPrecursor';

const DAYS = Number(process.argv[2] || 730);
const COINS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function klines(sym: string): Promise<Bar[]> {
  const out: Bar[] = [];
  let st = Date.now() - DAYS * 86_400_000;
  while (st < Date.now() - 15 * 60_000) {
    let r: any[] | null = null;
    for (let k = 0; k < 4 && !Array.isArray(r); k++) { r = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=15m&limit=1500&startTime=${st}`).then((x) => x.json()).catch(() => null); if (!Array.isArray(r)) await sleep(800); }
    if (!r?.length) break;
    for (const k of r) out.push({ ts: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] });
    st = r.at(-1)[0] + 15 * 60_000;
    await sleep(120);
  }
  return out.filter((b) => b.ts + 15 * 60_000 <= Date.now());
}

const pct = (a: number, n: number) => (n ? `${((a / n) * 100).toFixed(0)}%` : '–');
async function main() {
  const pooled: Record<'down' | 'up', ReturnType<typeof shockEvents>> = { down: [], up: [] };
  for (const sym of COINS) {
    const ev = shockEvents(await klines(sym));
    for (const d of ['down', 'up'] as const) {
      const e = ev.filter((x) => x.dir === d); pooled[d].push(...e);
      const s = shockStat(e);
      console.log(`${sym} ${d === 'down' ? '하락' : '상승'} 충격봉 n=${s.n} · 추가 ${pct(s.cont, s.n)} · 되돌림 ${pct(s.rev, s.n)} · 둘다아님 ${pct(s.neither, s.n)} · z ${s.z.toFixed(1)} (앞 ${s.first.toFixed(0)}p 뒤 ${s.second.toFixed(0)}p) → ${s.verdict}`);
    }
  }
  for (const d of ['down', 'up'] as const) {
    const e = pooled[d].sort((a, b) => a.ts - b.ts), s = shockStat(e);
    console.log(`4코인 합산 ${d === 'down' ? '하락' : '상승'} n=${s.n} · 추가 ${pct(s.cont, s.n)} · 되돌림 ${pct(s.rev, s.n)} · z ${s.z.toFixed(1)} → ${s.verdict} (코인 간 상관 — 참고)`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
