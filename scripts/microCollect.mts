/**
 * 미시 데이터 수집기 — 호가 깊이·청산·거래소별 미결제약정을 15분마다 쌓는다.
 *   npx tsx scripts/microCollect.mts        (MICRO_DIR=data/micro · MICRO_SAMPLES=3 · MICRO_GAP_MS=15000)
 * 왜: 적중률 연구(scripts/accuracy-lab.ts)에서 가격·거래량·펀딩으로는 표본 밖 50~53%였다. 아직 시험 못 한 재료가
 * 호가·청산·거래소별 OI인데, 무료 공개 API엔 과거 이력이 없어 지금부터 직접 쌓는 수밖에 없다.
 * 실행은 .github/workflows/micro-collect.yml(15분) → micro-data 브랜치 data/micro/YYYY-MM-DD.jsonl(UTC 날짜).
 *
 * 줄 형식(JSONL):
 *   {"k":"snap","t":ms,"s":"BTC","n":표본수,"ob":{거래소:{"m":중간가,"sp":스프레드bp,"b":[..],"a":[..]}},"oi":{거래소:코인수량},"fr":{거래소:8시간환산펀딩%}}
 *     b·a = 중간가에서 ±0.05·0.1·0.25·0.5·1% 안의 매수·매도 잔량(코인 수량). 호가창이 그 구간까지 안 닿으면 null.
 *     n개 표본(15초 간격)의 평균. 비트겟·하이퍼리퀴드는 가격 묶음 호가창이라 넓은 구간 경계가 묶음 단위만큼 거칠다.
 *   {"k":"liq","t":버킷시작ms,"s":"BTC","v":"okx","l":롱청산코인,"sh":숏청산코인,"nl":건수,"ns":건수,"mx":최대한건}
 *     15분 버킷, 청산이 없던 버킷도 0으로 남긴다. 청산 원본을 REST로 주는 곳이 OKX뿐이라 OKX만.
 * 한계: 바이낸스·바이비트는 미국 IP 차단이라 GitHub 러너에선 호가가 비고(OI·펀딩은 배포된 /api/coin/derivs 로 받음),
 *   한국에서 직접 돌리면 채워진다. 호가 스냅샷은 15분에 한 번(3표본)이라 그 사이 변화는 모른다.
 * 실거래 주문·API 키 없음. 방향 신호 아님 — 쌓인 뒤 표본 밖 검증을 통과해야 쓴다.
 */
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type BandDepth, type LiqEvent, BUCKET_MS, toLevels, bandDepth, mergeResolutions, avgDepth, liqBuckets, r6, utcDay } from '../lib/microData';

const COINS = ['BTC', 'ETH', 'SOL', 'XRP'];
const DIR = process.env.MICRO_DIR || 'data/micro';
const SAMPLES = Math.max(1, Number(process.env.MICRO_SAMPLES) || 3);
const GAP_MS = Number(process.env.MICRO_GAP_MS) || 15_000;
const BASE = process.env.MICRO_BASE || 'https://kospi-lab.vercel.app';
const LIQ_FIRST_MS = 6 * 3600_000;   // 첫 실행 때 거슬러 받을 범위
const LIQ_MAX_GAP_MS = 48 * 3600_000; // 이보다 오래 멈췄으면 그 사이는 포기
const LIQ_MAX_PAGES = 80;

const HEAD = { 'User-Agent': 'Mozilla/5.0', 'content-type': 'application/json' };
async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: HEAD, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`${r.status} ${url.slice(8, 60)}`);
  return r.json() as Promise<T>;
}
async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: HEAD, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`${r.status} ${url.slice(8, 60)}`);
  return r.json() as Promise<T>;
}
const quiet = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Rows = unknown[][];
const VENUES = ['binance', 'bybit', 'okx', 'bitget', 'hyperliquid'] as const;
type Venue = (typeof VENUES)[number];

/** 거래소별 호가 깊이 한 표본 */
const depthOf: Record<Venue, (base: string, ctVal: number) => Promise<BandDepth | null>> = {
  binance: async (b) => { const d = await get<{ bids: Rows; asks: Rows }>(`https://fapi.binance.com/fapi/v1/depth?symbol=${b}USDT&limit=1000`); return bandDepth({ bids: toLevels(d.bids), asks: toLevels(d.asks) }); },
  bybit: async (b) => { const d = (await get<{ result: { b: Rows; a: Rows } }>(`https://api.bybit.com/v5/market/orderbook?category=linear&symbol=${b}USDT&limit=500`)).result; return bandDepth({ bids: toLevels(d.b), asks: toLevels(d.a) }); },
  okx: async (b, ctVal) => { const d = (await get<{ data: { bids: Rows; asks: Rows }[] }>(`https://www.okx.com/api/v5/market/books-full?instId=${b}-USDT-SWAP&sz=5000`)).data[0]; return bandDepth({ bids: toLevels(d.bids, ctVal), asks: toLevels(d.asks, ctVal) }); },
  bitget: async (b) => mergeResolutions(await Promise.all(['scale0', 'scale1', 'scale2'].map((p) => quiet(
    get<{ data: { bids: Rows; asks: Rows } }>(`https://api.bitget.com/api/v2/mix/market/merge-depth?productType=usdt-futures&symbol=${b}USDT&precision=${p}&limit=max`).then((d) => bandDepth({ bids: toLevels(d.data.bids), asks: toLevels(d.data.asks) })))))),
  hyperliquid: async (b) => mergeResolutions(await Promise.all([null, 4, 3].map((n) => quiet(
    post<{ levels: [unknown[], unknown[]] }>('https://api.hyperliquid.xyz/info', { type: 'l2Book', coin: b, ...(n ? { nSigFigs: n } : {}) }).then((d) => bandDepth({ bids: toLevels(d.levels[0]), asks: toLevels(d.levels[1]) })))))),
};

async function okxCtVals(): Promise<Record<string, number>> {
  const d = await get<{ data: { instId: string; ctVal: string }[] }>('https://www.okx.com/api/v5/public/instruments?instType=SWAP');
  const out: Record<string, number> = {};
  for (const c of COINS) { const v = Number(d.data.find((x) => x.instId === `${c}-USDT-SWAP`)?.ctVal); if (v > 0) out[c] = v; }
  return out;
}

/** 배포된 앱의 거래소별 OI·펀딩(icn1 이라 바이낸스·바이비트도 받음) */
async function derivs(base: string): Promise<{ oi: Record<string, number | null>; fr: Record<string, number | null> }> {
  const oi: Record<string, number | null> = {}, fr: Record<string, number | null> = {};
  let d: { venues?: { venue: string; ok: boolean; oiCoins?: number | null; per8hPct?: number | null }[] } | null = null;
  for (let i = 0; i < 2 && !d?.venues; i++) d = await quiet(get(`${BASE}/api/coin/derivs?symbol=${base}USDT`));
  for (const v of d?.venues ?? []) if (v.ok) { oi[v.venue] = r6(v.oiCoins); fr[v.venue] = r6(v.per8hPct); }
  return { oi, fr };
}

/** OKX 청산 체결을 최신부터 from 까지 거슬러 받는다. reached = 실제로 닿은 가장 오래된 시각 */
async function okxLiqs(base: string, ctVal: number, from: number): Promise<{ events: LiqEvent[]; reached: number }> {
  const events: LiqEvent[] = [];
  let after = '', reached = Date.now();
  for (let p = 0; p < LIQ_MAX_PAGES; p++) {
    const d = await get<{ data: { details: { side: string; sz: string; ts: string }[] }[] }>(
      `https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&instFamily=${base}-USDT&state=filled&limit=100${after ? `&after=${after}` : ''}`);
    const det = d.data?.[0]?.details ?? [];
    if (!det.length) { reached = from; break; } // 더 오래된 기록 없음 = 그 사이 청산 없음
    for (const x of det) events.push({ ts: Number(x.ts), side: x.side === 'sell' ? 'long' : 'short', coins: Number(x.sz) * ctVal });
    reached = Number(det[det.length - 1].ts);
    if (reached <= from) break;
    after = det[det.length - 1].ts;
    await sleep(120);
  }
  return { events, reached };
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  const statePath = join(DIR, 'state.json');
  const state: { liqThrough: Record<string, number> } = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { liqThrough: {} };
  const lines = new Map<string, string[]>();
  const put = (ts: number, row: unknown) => { const k = utcDay(ts); if (!lines.has(k)) lines.set(k, []); lines.get(k)!.push(JSON.stringify(row)); };

  const ctVals = await okxCtVals().catch(() => ({} as Record<string, number>));

  // 1) 호가 깊이 — SAMPLES 번, GAP_MS 간격
  const samples: Record<string, Record<Venue, (BandDepth | null)[]>> = {};
  for (const c of COINS) samples[c] = { binance: [], bybit: [], okx: [], bitget: [], hyperliquid: [] };
  for (let i = 0; i < SAMPLES; i++) {
    if (i) await sleep(GAP_MS);
    await Promise.all(COINS.flatMap((c) => VENUES.map(async (v) => {
      samples[c][v].push(v === 'okx' && !ctVals[c] ? null : await quiet(depthOf[v](c, ctVals[c])));
    })));
  }

  // 2) OI·펀딩
  const dv = await Promise.all(COINS.map((c) => derivs(c)));

  const now = Date.now();
  const report: string[] = [];
  COINS.forEach((c, i) => {
    const ob: Record<string, unknown> = {};
    for (const v of VENUES) { const d = avgDepth(samples[c][v]); if (d) ob[v] = { m: r6(d.mid), sp: r6(d.spreadBps), b: d.b.map(r6), a: d.a.map(r6) }; }
    put(now, { k: 'snap', t: now, s: c, n: SAMPLES, ob, oi: dv[i].oi, fr: dv[i].fr });
    report.push(`${c} 호가 ${Object.keys(ob).length}/5 · OI ${Object.values(dv[i].oi).filter((x) => x != null).length}/5`);
  });

  // 3) 청산(OKX) — 마지막으로 채운 버킷 뒤부터 방금 끝난 버킷까지
  const end = Math.floor(now / BUCKET_MS) * BUCKET_MS;
  for (const c of COINS) {
    if (!ctVals[c]) { report.push(`${c} 청산 건너뜀(계약 크기 없음)`); continue; }
    let from = state.liqThrough[c] ?? end - LIQ_FIRST_MS;
    if (from < end - LIQ_MAX_GAP_MS) from = end - LIQ_MAX_GAP_MS;
    if (from >= end) continue;
    try {
      const { events, reached } = await okxLiqs(c, ctVals[c], from);
      if (reached > from) from = Math.ceil(reached / BUCKET_MS) * BUCKET_MS; // 다 못 거슬러 올라감 → 닿은 곳부터만
      const bk = liqBuckets(events, from, end);
      for (const b of bk) put(b.t, { k: 'liq', t: b.t, s: c, v: 'okx', l: r6(b.l), sh: r6(b.sh), nl: b.nl, ns: b.ns, mx: r6(b.mx) });
      state.liqThrough[c] = end;
      report.push(`${c} 청산 버킷 ${bk.length}개(롱 ${bk.reduce((s, b) => s + b.nl, 0)}건·숏 ${bk.reduce((s, b) => s + b.ns, 0)}건)`);
    } catch (e) { report.push(`${c} 청산 실패(다음 실행에서 이어 받음): ${(e as Error).message}`); }
  }

  for (const [day, rows] of lines) appendFileSync(join(DIR, `${day}.jsonl`), rows.join('\n') + '\n');
  writeFileSync(statePath, JSON.stringify(state) + '\n');
  console.log(`${new Date(now).toISOString()} · ${report.join(' · ')}`);
  if (COINS.every((c) => !VENUES.some((v) => samples[c][v].some(Boolean)))) throw new Error('호가를 한 곳에서도 못 받음');
}

main().catch((e) => { console.error('microCollect fail', e); process.exit(1); });
