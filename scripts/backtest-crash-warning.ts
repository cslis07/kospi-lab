/**
 * 폭락 조기 경보 검증 — 사용자 문서(ETH 10.24-25 폭락 분석)의 가설을 그 문서가 제안한 성적표로 잰다.
 * 정의·기준은 lib/crashWarning 머리말(사전 고정). 바이낸스 USDT 선물 5분봉 DAYS일, 4코인.
 * 실행: npx tsx scripts/backtest-crash-warning.ts [일수=730] [--json]   (--json: public/data/crash-warning-stats.json 저장)
 * 캔들은 OS 임시폴더에 캐시(다시 돌릴 때 재다운로드 안 함).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeFlags, btcBreakFn, scorecard, WARNINGS, type Bar, type Scorecard } from '../lib/crashWarning';

const DAYS = Number(process.argv.find((a) => /^\d+$/.test(a)) || 730);
const COINS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CACHE = join(tmpdir(), 'kospi-lab-klines5m');

async function klines5m(sym: string): Promise<Bar[]> {
  mkdirSync(CACHE, { recursive: true });
  const f = join(CACHE, `${sym}-${DAYS}-${new Date().toISOString().slice(0, 10)}.json`);
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const out: Bar[] = [];
  let st = Date.now() - DAYS * 86_400_000;
  while (st < Date.now() - 300_000) {
    let r: unknown = null;
    for (let k = 0; k < 8 && !Array.isArray(r); k++) { r = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=5m&limit=1500&startTime=${st}`).then((x) => x.json()).catch(() => null); if (!Array.isArray(r)) await sleep(3000 * (k + 1)); }
    const rows = r as (string | number)[][];
    if (!Array.isArray(rows)) throw new Error(`${sym} 5분봉 조회 실패(요청 제한) — 잠시 뒤 다시`);
    if (!rows.length) break;
    for (const k of rows) out.push({ ts: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] });
    st = +rows[rows.length - 1][0] + 300_000;
    await sleep(250);
  }
  const done = out.filter((b) => b.ts + 300_000 <= Date.now());
  // 기간의 95% 이상 받았을 때만 캐시(중간에 끊긴 데이터로 측정하지 않게)
  if (done.length < DAYS * 288 * 0.95) throw new Error(`${sym} 5분봉 ${done.length}개 — 기간 대비 부족`);
  writeFileSync(f, JSON.stringify(done));
  return done;
}

const f1 = (x: number | null) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(1));
const V = { significant: '유의', noise: '우연', thin: '표본부족' } as const;

async function main() {
  const btc = await klines5m('BTCUSDT');
  const btcBreak = btcBreakFn(btc);
  const result: Record<string, Scorecard[]> = {};
  for (const sym of COINS) {
    const b5 = sym === 'BTCUSDT' ? btc : await klines5m(sym);
    const flags = computeFlags(b5, sym === 'BTCUSDT' ? undefined : btcBreak);
    const cards = WARNINGS.filter((w) => !(sym === 'BTCUSDT' && w.key === 'btcBreak')).map((w) => scorecard(w.key, b5, flags, w.fn));
    result[sym] = cards;
    console.log(`\n== ${sym} 5분봉 ${b5.length} · 폭락(60분 −3%) ${cards[0].crashes}회 · 대조군 적중 ${f1(cards[0].base)}%`);
    for (const c of cards) {
      const w = WARNINGS.find((x) => x.key === c.key)!;
      console.log(`  ${w.label}\n    경고 ${c.warnings} · 적중 ${c.hits}(${f1(c.precision)}%, 대조 ${f1(c.base)}%, ${f1(c.lift)}배, z ${f1(c.z)}, 앞 ${f1(c.firstLift)}배 뒤 ${f1(c.secondLift)}배) · 오경보 ${c.falseAlarms} · 포착 ${c.caught}/${c.crashes}(${f1(c.recall)}%) · 선행 중앙 ${f1(c.leadMedMin)}분 → ${V[c.verdict]}`);
    }
  }
  if (process.argv.includes('--json')) {
    writeFileSync('public/data/crash-warning-stats.json', JSON.stringify({ generatedAt: new Date().toISOString(), days: DAYS, coins: result }, (_k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)) + '\n');
    console.log('\npublic/data/crash-warning-stats.json 저장');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
