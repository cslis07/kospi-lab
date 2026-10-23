// 코인 신호 적중률 추적 + 텔레그램 알림 (GitHub Actions 크론)
// coin-signal에서 이식. buildModes를 직접 호출(앱 인증 게이트 무관), Bitget 데이터 사용.
// TRADE/ULTRA 스냅샷 저장 → TP/SL 자동판정 → data/coin-signals.json + 텔레그램 발신(시크릿 있을 때만)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { buildModes, type Candle } from '../lib/coinSignalModes.ts';
import { getEtfFlows, etfBiasFor } from '../lib/etfFlow.ts';
import { bitgetKeysConfigured } from '../lib/bitget.ts';
import { runGuard } from '../lib/guard.ts';

const BITGET = 'https://api.bitget.com';
const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'SOLUSDT'];
const MODES = ['scalp'] as const;   // 스윙 신호 알림 제외(사용자 요청) — 스캘프만 추적·발신
const HORIZON_H: Record<string, number> = { scalp: 6, swing: 72 };
const DATA = 'data/coin-signals.json';
const MAX_CLOSED = 300;
// kospi-lab 전용 텔레그램(있으면 사용) → 없으면 공용으로 폴백. posteady 등과 채팅방 분리용.
const TG_TOKEN = process.env.KL_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.KL_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

async function candles(sym: string, g: string, limit: number): Promise<Candle[]> {
  const u = `${BITGET}/api/v2/mix/market/candles?symbol=${sym}&productType=USDT-FUTURES&granularity=${g}&limit=${limit}`;
  const j = await (await fetch(u, { signal: AbortSignal.timeout(9000) })).json();
  return (j.data as string[][]).map((r) => ({ ts: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5], qv: +r[6] }));
}
async function fundingRate(sym: string): Promise<number> {
  try {
    const j = await (await fetch(`${BITGET}/api/v2/mix/market/current-fund-rate?symbol=${sym}&productType=USDT-FUTURES`, { signal: AbortSignal.timeout(8000) })).json();
    return Number(j?.data?.[0]?.fundingRate ?? 0);
  } catch { return 0; }
}
async function takerRatio(sym: string): Promise<number | null> {
  try {
    const j = await (await fetch(`${BITGET}/api/v2/mix/market/taker-buy-sell?symbol=${sym}&productType=USDT-FUTURES&period=5m`, { signal: AbortSignal.timeout(8000) })).json();
    const rows = (j?.data ?? []) as { buyVolume: string; sellVolume: string }[];
    const last6 = rows.slice(-6);
    const b = last6.reduce((a, r) => a + Number(r.buyVolume), 0);
    const s = last6.reduce((a, r) => a + Number(r.sellVolume), 0);
    return s > 0 ? b / s : null;
  } catch { return null; }
}

async function telegram(text: string) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
  } catch (e) { console.error('telegram fail', (e as Error).message); }
}
function fp(sym: string, v: number) {
  const d = sym === 'BTCUSDT' ? 0 : sym === 'ETHUSDT' ? 1 : sym === 'SOLUSDT' ? 2 : 4;
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

interface Snap { id: string; sym: string; mode: string; dir: number; dirLabel: string; entry: number; tp: number; sl: number; ts: number; price0: number; ultra: boolean; conf: number; eq: number }
interface Closed extends Snap { closeTs: number; closePrice: number; outcome: 'WIN' | 'LOSS' | 'EXPIRE'; r: number }
interface DB { updated: string | null; open: Snap[]; closed: Closed[]; stats: Record<string, { n: number; winRate: number | null; avgR: number | null }>; watch?: Record<string, number> }

function computeStats(closed: Closed[]) {
  const by: Record<string, { n: number; win: number; rSum: number }> = { scalp: { n: 0, win: 0, rSum: 0 }, swing: { n: 0, win: 0, rSum: 0 }, all: { n: 0, win: 0, rSum: 0 } };
  for (const c of closed) for (const k of [c.mode, 'all']) { by[k].n++; if (c.outcome === 'WIN') by[k].win++; by[k].rSum += c.r || 0; }
  const out: DB['stats'] = {};
  for (const [k, v] of Object.entries(by)) out[k] = { n: v.n, winRate: v.n ? Math.round((v.win / v.n) * 100) : null, avgR: v.n ? +(v.rSum / v.n).toFixed(2) : null };
  return out;
}

async function main() {
  let db: DB = { updated: null, open: [], closed: [], stats: {} };
  if (existsSync(DATA)) { try { db = JSON.parse(await readFile(DATA, 'utf8')); } catch { console.error('parse fail, reset'); } }
  db.open ??= []; db.closed ??= [];

  const etf = await getEtfFlows().catch(() => null);
  const sigs: Record<string, { price: number; modes: ReturnType<typeof buildModes> }> = {};
  for (const sym of SYMBOLS) {
    try {
      const [c5m, c15m, c1h, c4h, c1d] = await Promise.all([
        candles(sym, '5m', 300), candles(sym, '15m', 300), candles(sym, '1H', 300), candles(sym, '4H', 250), candles(sym, '1D', 250),
      ]);
      const [funding, taker] = await Promise.all([fundingRate(sym), takerRatio(sym)]);
      const modes = buildModes({
        candles: { c5m, c15m, c1h, c4h, c1d },
        derivs: { funding, oiChgPct: null, takerRatio: taker, lsRatio: null },
        etfBias: etfBiasFor(etf, sym.replace('USDT', '')),
      });
      sigs[sym] = { price: c5m[c5m.length - 1].c, modes };
    } catch (e) { console.error('signal fail', sym, (e as Error).message); }
  }

  const now = Date.now();
  const stillOpen: Snap[] = [];
  for (const s of db.open) {
    const P = sigs[s.sym]?.price;
    if (P == null) { stillOpen.push(s); continue; }
    const hitTp = s.dir === 1 ? P >= s.tp : P <= s.tp;
    const hitSl = s.dir === 1 ? P <= s.sl : P >= s.sl;
    let outcome: Closed['outcome'] | null = hitTp ? 'WIN' : hitSl ? 'LOSS' : (now - s.ts > HORIZON_H[s.mode] * 3600e3 ? 'EXPIRE' : null);
    if (!outcome) { stillOpen.push(s); continue; }
    const riskDist = Math.abs(s.entry - s.sl) || 1;
    const r = outcome === 'WIN' ? +(Math.abs(s.tp - s.entry) / riskDist).toFixed(2) : outcome === 'LOSS' ? -1 : +(((P - s.entry) * s.dir) / riskDist).toFixed(2);
    db.closed.unshift({ ...s, closeTs: now, closePrice: P, outcome, r });
    const emoji = outcome === 'WIN' ? '✅' : outcome === 'LOSS' ? '❌' : '⏱';
    if (s.mode !== 'swing') await telegram(`${emoji} <b>${s.sym.replace('USDT', '')} ${s.mode.toUpperCase()} ${s.dirLabel} 종료: ${outcome}</b>\nR ${r} · 진입 ${fp(s.sym, s.entry)} → 현재 ${fp(s.sym, P)}`);
  }
  db.open = stillOpen;

  const openKey = new Set(db.open.map((s) => s.sym + s.mode));
  for (const sym of SYMBOLS) {
    const sig = sigs[sym]; if (!sig) continue;
    for (const mode of MODES) {
      const m = sig.modes[mode];
      if (!m || m.state !== 'TRADE' || openKey.has(sym + mode) || m.tp1 == null || m.invalidation == null) continue;
      const entry = ((m.entryZone[0] ?? sig.price) + (m.entryZone[1] ?? sig.price)) / 2;
      db.open.push({ id: `${sym}-${mode}-${now}`, sym, mode, dir: m.direction >= 0 ? 1 : -1, dirLabel: m.dirLabel, entry, tp: m.tp1, sl: m.invalidation, ts: now, price0: sig.price, ultra: !!m.ultra, conf: m.confidence, eq: m.entryQuality });
      openKey.add(sym + mode);
      const tag = m.ultra ? '🌟 ULTRA' : '📊 TRADE';
      await telegram(`${tag} <b>${sym.replace('USDT', '')} ${mode.toUpperCase()} ${m.dirLabel}</b> (${m.direction})\n진입 ${fp(sym, m.entryZone[0] ?? sig.price)}~${fp(sym, m.entryZone[1] ?? sig.price)}\nTP ${fp(sym, m.tp1)} · SL ${fp(sym, m.invalidation)}\nEntry ${m.entryQuality} · Conf ${m.confidence} · R:R ${m.rr}`);
    }
  }

  // ── 포지션 가드: 손절 미설정·추세 역행·복구 매매·청산 근접·계획 손절/목표·서킷브레이커 → 텔레그램 ──
  // 로직은 lib/guard.ts 공용. 정시 실행은 Supabase pg_cron → /api/guard(5분), 이 크론은 보조(실제 3~5시간 간격).
  // 발화 기록을 Supabase guard-state로 공유해 두 경로가 같은 알림을 두 번 보내지 않는다. 주간 복기는 일요일 모닝 브리핑으로 이전.
  if (bitgetKeysConfigured()) {
    try {
      const g = await runGuard();
      console.log(`guard positions=${g.positions} alerts=${g.alerts.length} sent=${g.sent}`);
    } catch (e) { console.error('guard fail', (e as Error).message); }
  }

  db.closed = db.closed.slice(0, MAX_CLOSED);
  db.stats = computeStats(db.closed);
  db.updated = new Date().toISOString();
  await mkdir('data', { recursive: true });
  await writeFile(DATA, JSON.stringify(db, null, 2));
  console.log(`open=${db.open.length} closed=${db.closed.length} winRate(all)=${db.stats.all?.winRate}%`);
}

main().catch((e) => { console.error(e); process.exit(1); });
