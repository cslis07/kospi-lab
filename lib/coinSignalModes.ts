// coin-signal에서 이식한 SCALP·SWING·POSITION 3모드 진입 엔진 (AccuracyV3 기반)
// Direction(-100~+100) / Entry Quality(0~100) / Confidence(0~100) / Event Risk(0~100)
// 상태: TRADE / WATCH / NO_TRADE / PAUSED  +  ULTRA 승격, 추격 감쇠 포함
import type { Candle } from './coinAnalysis';
export type { Candle };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---------- 지표 ----------
function emaSeries(arr: number[], p: number): number[] {
  if (arr.length < p) return [];
  const k = 2 / (p + 1);
  const out: number[] = [];
  let prev = arr.slice(0, p).reduce((a, b) => a + b, 0) / p;
  out.push(prev);
  for (let i = p; i < arr.length; i++) { prev = arr[i] * k + prev * (1 - k); out.push(prev); }
  return out;
}
function ema(arr: number[], p: number): number | null {
  const s = emaSeries(arr, p);
  return s.length ? s[s.length - 1] : null;
}
function rsi(closes: number[], p = 14): number | null {
  if (closes.length < p + 1) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= p; i++) { const d = closes[i] - closes[i - 1]; if (d > 0) gain += d; else loss -= d; }
  let ag = gain / p, al = loss / p;
  for (let i = p + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (p - 1) + Math.max(d, 0)) / p;
    al = (al * (p - 1) + Math.max(-d, 0)) / p;
  }
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}
function macdHist(closes: number[]): { hist: number; rising: boolean } | null {
  if (closes.length < 40) return null;
  const e12 = emaSeries(closes, 12), e26 = emaSeries(closes, 26);
  const off = e12.length - e26.length;
  const macd = e26.map((v, i) => e12[i + off] - v);
  const sig = emaSeries(macd, 9);
  if (!sig.length) return null;
  const h = macd[macd.length - 1] - sig[sig.length - 1];
  const hPrev = macd.length > 1 && sig.length > 1 ? macd[macd.length - 2] - sig[sig.length - 2] : h;
  return { hist: h, rising: h > hPrev };
}
function atr(candles: Candle[], p = 14): number | null {
  if (candles.length < p + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], pc = candles[i - 1];
    trs.push(Math.max(c.h - c.l, Math.abs(c.h - pc.c), Math.abs(c.l - pc.c)));
  }
  let a = trs.slice(0, p).reduce((x, y) => x + y, 0) / p;
  for (let i = p; i < trs.length; i++) a = (a * (p - 1) + trs[i]) / p;
  return a;
}
function vwapDay(candles: Candle[]): number | null {
  const dayStart = new Date().setUTCHours(0, 0, 0, 0);
  let pv = 0, vv = 0;
  for (const c of candles) { if (c.ts < dayStart) continue; const tp = (c.h + c.l + c.c) / 3; pv += tp * c.v; vv += c.v; }
  if (vv === 0) for (const c of candles.slice(-96)) { const tp = (c.h + c.l + c.c) / 3; pv += tp * c.v; vv += c.v; }
  return vv ? pv / vv : null;
}
interface Piv { highs: { i: number; p: number }[]; lows: { i: number; p: number }[] }
function pivots(candles: Candle[], look = 3): Piv {
  const highs: { i: number; p: number }[] = [], lows: { i: number; p: number }[] = [];
  for (let i = look; i < candles.length - look; i++) {
    let isH = true, isL = true;
    for (let j = 1; j <= look; j++) {
      if (candles[i].h <= candles[i - j].h || candles[i].h <= candles[i + j].h) isH = false;
      if (candles[i].l >= candles[i - j].l || candles[i].l >= candles[i + j].l) isL = false;
    }
    if (isH) highs.push({ i, p: candles[i].h });
    if (isL) lows.push({ i, p: candles[i].l });
  }
  return { highs, lows };
}
function nearestLevels(piv: Piv, price: number) {
  const res = piv.highs.map(x => x.p).filter(p => p > price).sort((a, b) => a - b);
  const sup = piv.lows.map(x => x.p).filter(p => p < price).sort((a, b) => b - a);
  return { resistance: res[0] ?? null, resistance2: res[1] ?? null, support: sup[0] ?? null, support2: sup[1] ?? null };
}
function structureScore(piv: Piv): number {
  const h = piv.highs.slice(-2), l = piv.lows.slice(-2);
  let s = 0;
  if (h.length === 2) s += h[1].p > h[0].p ? 0.5 : -0.5;
  if (l.length === 2) s += l[1].p > l[0].p ? 0.5 : -0.5;
  return s;
}
// 테이커 매수-매도 누적(가능하면 qv 기반 근사) — kospi-lab 캔들엔 taker 분해가 없어 단순 방향성으로 대체
function cvdApprox(candles: Candle[]): { slopeNorm: number } | null {
  if (candles.length < 10) return null;
  const recent = candles.slice(-40);
  let cum = 0;
  const series = recent.map(c => { const dir = c.c >= c.o ? 1 : -1; cum += dir * c.v; return cum; });
  const half = Math.floor(series.length / 2);
  const slope = series[series.length - 1] - series[half];
  const total = recent.reduce((a, c) => a + c.v, 0);
  return { slopeNorm: total ? slope / total : 0 };
}

// ---------- 프레임 분석 ----------
export interface Frame {
  price: number; e20: number | null; e50: number | null; e200: number | null;
  rsi: number | null; macd: { hist: number; rising: boolean } | null; atr: number | null;
  vwap: number | null; levels: ReturnType<typeof nearestLevels>; struct: number;
  trend: number; mom: number; cvd: { slopeNorm: number } | null; closes: number[];
}
function analyzeFrame(candles: Candle[]): Frame {
  const closes = candles.map(c => c.c);
  const price = closes[closes.length - 1];
  const e20 = ema(closes, 20), e50 = ema(closes, 50), e200 = ema(closes, 200);
  const r = rsi(closes, 14), m = macdHist(closes), a = atr(candles, 14);
  const piv = pivots(candles, 3);
  const lv = nearestLevels(piv, price);
  const struct = structureScore(piv);
  const vw = vwapDay(candles);
  const cvd = cvdApprox(candles);
  let trend = 0;
  if (e20 && e50) { trend += price > e20 ? 0.25 : -0.25; trend += e20 > e50 ? 0.25 : -0.25; if (e200) trend += price > e200 ? 0.15 : -0.15; }
  trend += struct * 0.35;
  trend = clamp(trend, -1, 1);
  let mom = 0;
  if (r != null) mom += clamp((r - 50) / 30, -1, 1) * 0.6;
  if (m) mom += (m.hist > 0 ? 0.25 : -0.25) + (m.rising ? 0.15 : -0.15);
  mom = clamp(mom, -1, 1);
  return { price, e20, e50, e200, rsi: r, macd: m, atr: a, vwap: vw, levels: lv, struct, trend, mom, cvd, closes };
}

// ---------- 수급/거시 점수 ----------
export interface Derivs { funding: number | null; oiChgPct: number | null; takerRatio: number | null; lsRatio: number | null }
function derivScore(dv: Derivs | null, priceChgPct: number | null): { score: number; notes: string[] } {
  if (!dv) return { score: 0, notes: [] };
  let s = 0; const notes: string[] = [];
  if (dv.oiChgPct != null && priceChgPct != null) {
    if (priceChgPct > 0.1 && dv.oiChgPct > 0.5) { s += 0.35; notes.push(`가격↑+OI↑ 신규 롱 유입 (OI ${dv.oiChgPct.toFixed(1)}%)`); }
    else if (priceChgPct < -0.1 && dv.oiChgPct > 0.5) { s -= 0.35; notes.push(`가격↓+OI↑ 신규 숏 유입 (OI +${dv.oiChgPct.toFixed(1)}%)`); }
    else if (priceChgPct < -0.1 && dv.oiChgPct < -0.5) { s += 0.1; notes.push('가격↓+OI↓ 롱 청산성 하락'); }
    else if (priceChgPct > 0.1 && dv.oiChgPct < -0.5) { s -= 0.1; notes.push('가격↑+OI↓ 숏커버성 상승(지속성 약함)'); }
  }
  if (dv.funding != null) {
    const fPct = dv.funding * 100;
    if (fPct > 0.03) { s -= 0.3; notes.push(`펀딩 +${fPct.toFixed(3)}% 롱 과열`); }
    else if (fPct < -0.03) { s += 0.3; notes.push(`펀딩 ${fPct.toFixed(3)}% 숏 과열`); }
  }
  if (dv.takerRatio != null) {
    if (dv.takerRatio > 1.05) { s += 0.2; notes.push(`테이커 매수 우위 (${dv.takerRatio.toFixed(2)})`); }
    else if (dv.takerRatio < 0.95) { s -= 0.2; notes.push(`테이커 매도 우위 (${dv.takerRatio.toFixed(2)})`); }
  }
  return { score: clamp(s, -1, 1), notes };
}

export interface MacroCtx { d10?: number | null; d2?: number | null; d30?: number | null; brentChg3d?: number | null; dxyChg3d?: number | null }
function macroScore(mc: MacroCtx | null): { score: number; notes: string[] } {
  let s = 0; const notes: string[] = [];
  if (mc) {
    const d = (mc.d10 || 0) + (mc.d2 || 0) * 0.5 + (mc.d30 || 0) * 0.5;
    if (d > 0.04) { s -= 0.5; notes.push(`미 국채금리 상승 (${mc.d10 && mc.d10 >= 0 ? '+' : ''}${mc.d10}bp급)`); }
    else if (d < -0.04) { s += 0.5; notes.push('미 국채금리 하락'); }
    if ((mc.brentChg3d || 0) > 4) { s -= 0.4; notes.push(`Brent 3일 +${mc.brentChg3d}% 급등`); }
    if ((mc.dxyChg3d || 0) > 1) { s -= 0.3; notes.push('달러 강세'); }
    else if ((mc.dxyChg3d || 0) < -1) { s += 0.3; notes.push('달러 약세'); }
  }
  return { score: clamp(s, -1, 1), notes };
}

function eventRisk(atrPctNow: number | null, atrPctAvg: number | null, dv: Derivs | null, eventHoursUntil: number | null): { risk: number; notes: string[] } {
  let risk = 10; const notes: string[] = [];
  if (eventHoursUntil != null && eventHoursUntil < 24 && eventHoursUntil > -6) { risk += 45; notes.push('중대 이벤트 24시간 이내'); }
  else if (eventHoursUntil != null && eventHoursUntil < 72) { risk += 20; notes.push('중대 이벤트 3일 이내'); }
  if (atrPctAvg && atrPctNow && atrPctNow > atrPctAvg * 1.8) { risk += 25; notes.push('변동성 급증(ATR 스파이크)'); }
  if (dv && dv.funding != null && Math.abs(dv.funding * 100) > 0.05) { risk += 15; notes.push('펀딩 극단'); }
  return { risk: clamp(risk, 0, 100), notes };
}

// ---------- Entry Zone / SL / TP ----------
type Mode = 'scalp' | 'swing' | 'position';
function priceZones(dir: number, base: Frame, price: number, mode: Mode) {
  const a = base.atr || price * 0.005;
  const lv = base.levels;
  const maxDist = mode === 'scalp' ? 2.0 : mode === 'swing' ? 4 : 8;
  if (dir >= 0) {
    const cand = [base.vwap, base.e20, lv.support].filter((x): x is number => x != null && x < price * 1.002);
    let anchor = cand.length ? cand.reduce((x, y) => x + y, 0) / cand.length : price - 0.5 * a;
    anchor = Math.max(anchor, price - maxDist * a);
    const zoneLo = anchor - 0.3 * a, zoneHi = anchor + 0.25 * a;
    const slBase = Math.min(lv.support ?? anchor - a, zoneLo);
    const sl = slBase - 0.6 * a;
    const entry = (zoneLo + zoneHi) / 2;
    const tp1 = lv.resistance ?? entry + 1.5 * a;
    const tp2 = Math.max(entry + 2 * (entry - sl), lv.resistance2 ?? entry + 3 * a);
    return { zone: [zoneLo, zoneHi] as [number, number], sl, tp1, tp2, entry };
  } else {
    const cand = [base.vwap, base.e20, lv.resistance].filter((x): x is number => x != null && x > price * 0.998);
    let anchor = cand.length ? cand.reduce((x, y) => x + y, 0) / cand.length : price + 0.5 * a;
    anchor = Math.min(anchor, price + maxDist * a);
    const zoneLo = anchor - 0.25 * a, zoneHi = anchor + 0.3 * a;
    const slBase = Math.max(lv.resistance ?? anchor + a, zoneHi);
    const sl = slBase + 0.6 * a;
    const entry = (zoneLo + zoneHi) / 2;
    const tp1 = lv.support ?? entry - 1.5 * a;
    const tp2 = Math.min(entry - 2 * (sl - entry), lv.support2 ?? entry - 3 * a);
    return { zone: [zoneLo, zoneHi] as [number, number], sl, tp1, tp2, entry };
  }
}

interface EqResult { eq: number; rr: number; distAtr: number; chasing: boolean; parts: Record<string, number> }
function entryQuality(dir: number, price: number, base: Frame, trig: Frame, zones: ReturnType<typeof priceZones>, dv: Derivs | null, evRisk: number): EqResult {
  if (Math.abs(dir) < 5) return { eq: 20, rr: 0, distAtr: 0, chasing: false, parts: {} };
  const a = base.atr || price * 0.005;
  const side = dir > 0 ? 1 : -1;
  const zoneMid = (zones.zone[0] + zones.zone[1]) / 2;
  const distAtr = ((price - zoneMid) * side) / a;
  let posPts: number;
  if (price >= zones.zone[0] && price <= zones.zone[1]) posPts = 25;
  else if (distAtr > 0) posPts = clamp(25 - distAtr * 16, 0, 25);
  else posPts = clamp(25 + distAtr * 8, 5, 25);

  let trigPts = 8;
  const lastC = trig.closes[trig.closes.length - 1], prevC = trig.closes[trig.closes.length - 2];
  if (lastC != null && prevC != null && (lastC - prevC) * side > 0) trigPts += 6;
  if (trig.vwap && (trig.price - trig.vwap) * side > 0) trigPts += 6;
  if (trig.cvd && trig.cvd.slopeNorm * side > 0.01) trigPts += 5;
  trigPts = clamp(trigPts, 0, 25);

  const risk = Math.abs(zones.entry - zones.sl), reward = Math.abs(zones.tp1 - zones.entry);
  const rr = risk > 0 ? reward / risk : 0;
  const rrPts = clamp((rr - 0.5) * 13, 0, 20);

  let flowPts = 5;
  if (dv && dv.takerRatio != null) flowPts += clamp((dv.takerRatio - 1) * side * 100, -5, 7);
  if (dv && dv.oiChgPct != null) flowPts += (dv.oiChgPct * side > 0 ? 3 : 0);
  flowPts = clamp(flowPts, 0, 15);

  const atrPct = (a / price) * 100;
  const volPts = atrPct > 0.1 && atrPct < 2.5 ? 10 : atrPct < 4 ? 5 : 0;
  const evPts = evRisk < 30 ? 5 : evRisk < 60 ? 2 : 0;

  let eq = posPts + trigPts + rrPts + flowPts + volPts + evPts;
  let chasePenalty = 1;
  if (distAtr > 0.5) chasePenalty = clamp(1 - (distAtr - 0.5) * 0.34, 0.25, 1);
  eq = Math.round(clamp(eq * chasePenalty, 0, 100));
  return { eq, rr: +rr.toFixed(2), distAtr: +distAtr.toFixed(2), chasing: distAtr > 0.9,
    parts: { posPts: Math.round(posPts), trigPts, rrPts: Math.round(rrPts), flowPts: Math.round(flowPts), volPts, evPts } };
}

function pctChg(closes: number[], n: number): number | null {
  if (!closes || closes.length < n + 1) return null;
  const a = closes[closes.length - 1 - n], b = closes[closes.length - 1];
  return a ? ((b - a) / a) * 100 : null;
}
const fmt6 = (v: number | null) => v == null ? null : +v.toPrecision(6);

export interface ModeSignal {
  direction: number; dirLabel: 'LONG' | 'SHORT' | 'WAIT';
  entryQuality: number; confidence: number; eventRisk: number;
  state: 'TRADE' | 'WATCH' | 'NO_TRADE' | 'PAUSED'; ultra: boolean; rr: number;
  entryZone: [number | null, number | null]; invalidation: number | null; tp1: number | null; tp2: number | null;
  rsi: number | null; vwap: number | null; ema20: number | null; ema50: number | null;
  support: number | null; resistance: number | null; atr: number | null; reasons: string[];
}

interface Frames { m5: Frame; m15: Frame; h1: Frame; h4: Frame; d1: Frame }

function judgeMode(mode: Mode, frames: Frames, dv: Derivs | null, macro: { score: number; notes: string[] },
  newsB: number, etfB: number, crossDirs: number[], eventHoursUntil: number | null): ModeSignal {
  const instB = clamp(newsB + (etfB || 0) * 0.7, -1, 1);
  type Comp = [string, number, () => number];
  const cfgMap: Record<Mode, { comps: Comp[]; baseFrame: keyof Frames; trigFrame: keyof Frames; hiFrame: keyof Frames }> = {
    scalp: {
      comps: [
        ['5분 트리거', 0.30, () => clamp(frames.m5.trend * 0.5 + frames.m5.mom * 0.3 + (frames.m5.cvd ? clamp(frames.m5.cvd.slopeNorm * 8, -1, 1) : 0) * 0.2, -1, 1)],
        ['파생수급', 0.25, () => derivScore(dv, pctChg(frames.m15.closes, 8)).score],
        ['15분 방향', 0.20, () => clamp(frames.m15.trend * 0.6 + frames.m15.mom * 0.4, -1, 1)],
        ['거시환경', 0.15, () => macro.score],
        ['뉴스', 0.10, () => newsB],
      ], baseFrame: 'm15', trigFrame: 'm5', hiFrame: 'h1',
    },
    swing: {
      comps: [
        ['4H·1D 구조', 0.30, () => clamp(frames.h4.trend * 0.5 + frames.d1.trend * 0.3 + frames.h4.mom * 0.2, -1, 1)],
        ['거시·유동성', 0.20, () => macro.score],
        ['파생수급', 0.15, () => derivScore(dv, pctChg(frames.h4.closes, 6)).score],
        ['1H 모멘텀', 0.15, () => clamp(frames.h1.trend * 0.5 + frames.h1.mom * 0.5, -1, 1)],
        ['수급·기관 (ETF+뉴스)', 0.20, () => instB],
      ], baseFrame: 'h4', trigFrame: 'h1', hiFrame: 'd1',
    },
    position: {
      comps: [
        ['거시 레짐', 0.30, () => macro.score],
        ['1D 장기구조', 0.25, () => clamp(frames.d1.trend * 0.7 + frames.d1.mom * 0.3, -1, 1)],
        ['200일선 위치', 0.20, () => frames.d1.e200 ? (frames.d1.price > frames.d1.e200 ? 0.7 : -0.7) : 0],
        ['수급·뉴스 (ETF포함)', 0.15, () => instB],
        ['파생 포지션', 0.10, () => derivScore(dv, pctChg(frames.d1.closes, 5)).score],
      ], baseFrame: 'd1', trigFrame: 'h4', hiFrame: 'd1',
    },
  };
  const cfg = cfgMap[mode];
  const contribs = cfg.comps.map(([name, w, fn]) => { const v = fn(); return { name, w, v, contrib: v * w }; });
  let direction = Math.round(clamp(contribs.reduce((s, c) => s + c.contrib, 0) * 100 / 0.62, -100, 100));

  const base = frames[cfg.baseFrame], trig = frames[cfg.trigFrame], hi = frames[cfg.hiFrame];
  const price = frames.m5.price;
  if (hi.trend * direction < 0 && Math.abs(hi.trend) > 0.4) direction = Math.round(direction * 0.55);

  const zones = priceZones(direction, base, price, mode);
  const atrPctNow = base.atr ? (base.atr / price) * 100 : null;
  const ev = eventRisk(atrPctNow, atrPctNow ? atrPctNow * 0.8 : null, dv, eventHoursUntil);
  const eqRes = entryQuality(direction, price, base, trig, zones, dv, ev.risk);

  const side = direction > 0 ? 1 : direction < 0 ? -1 : 0;
  let agree = 0, total = 0;
  for (const c of contribs) { if (Math.abs(c.v) < 0.08) continue; total++; if (c.v * side > 0) agree++; }
  let conf = total ? Math.round((agree / total) * 70 + Math.min(Math.abs(direction), 60) * 0.5) : 30;
  let crossNote: string | null = null;
  if (crossDirs && crossDirs.length && side !== 0) {
    const agreeCross = crossDirs.filter(d => d * side > 0).length;
    if (agreeCross === crossDirs.length) { conf += 8; crossNote = `교차거래소 방향 일치`; }
    else if (agreeCross === 0) { conf -= 15; crossNote = '교차거래소 방향 불일치 (신뢰도 하향)'; }
  }
  conf = clamp(conf, 0, 100);

  const reasons: string[] = [];
  for (const c of contribs.slice().sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib))) {
    if (Math.abs(c.v) < 0.05) continue;
    reasons.push(`${c.name}: ${c.v > 0 ? '롱↑' : '숏↓'} (${(c.v * 100).toFixed(0)})`);
  }
  for (const n of derivScore(dv, pctChg(base.closes, 8)).notes) reasons.push(n);
  for (const n of macro.notes) reasons.push(n);
  if (crossNote) reasons.push(crossNote);
  if (base.rsi != null) {
    if (base.rsi > 72) reasons.push(`RSI ${base.rsi.toFixed(0)} 과매수 — 추격 롱 주의`);
    else if (base.rsi < 28) reasons.push(`RSI ${base.rsi.toFixed(0)} 과매도 — 추격 숏 주의`);
  }

  const absDir = Math.abs(direction);
  const dirLabel: ModeSignal['dirLabel'] = absDir >= 25 ? (direction > 0 ? 'LONG' : 'SHORT') : 'WAIT';
  let state: ModeSignal['state'];
  if (ev.risk >= 70) { state = 'PAUSED'; reasons.unshift(...ev.notes.map(n => `이벤트: ${n}`)); }
  else if (dirLabel === 'WAIT') state = 'NO_TRADE';
  else if (eqRes.eq >= 62 && absDir >= 40 && conf >= 55 && ev.risk < 60) state = 'TRADE';
  else if (eqRes.eq >= 40 && absDir >= 30) state = 'WATCH';
  // 방향은 뚜렷한데 현재가가 추격 구간이라 Entry가 낮은 경우: 거부가 아니라 '눌림 대기(WATCH)'
  else if (absDir >= 35 && (eqRes.chasing || eqRes.distAtr > 0.3)) state = 'WATCH';
  else state = 'NO_TRADE';
  const ultra = state === 'TRADE' && absDir >= 60 && eqRes.eq >= 75 && conf >= 70;

  if (dirLabel !== 'WAIT' && eqRes.chasing) {
    const zoneMid = (zones.zone[0] + zones.zone[1]) / 2;
    reasons.unshift(`⚠ 현재가 추격 금지 (진입존 ${eqRes.distAtr}ATR ${side > 0 ? '위' : '아래'}) — ${fmt6(zoneMid)} 눌림 대기`);
  }

  return {
    direction, dirLabel, entryQuality: eqRes.eq, confidence: conf, eventRisk: ev.risk, state, ultra, rr: eqRes.rr,
    entryZone: [fmt6(zones.zone[0]), fmt6(zones.zone[1])], invalidation: fmt6(zones.sl), tp1: fmt6(zones.tp1), tp2: fmt6(zones.tp2),
    rsi: base.rsi != null ? +base.rsi.toFixed(1) : null, vwap: fmt6(base.vwap), ema20: fmt6(base.e20), ema50: fmt6(base.e50),
    support: fmt6(base.levels.support), resistance: fmt6(base.levels.resistance), atr: fmt6(base.atr),
    reasons: reasons.slice(0, 5),
  };
}

export interface BuildModesInput {
  candles: { c5m: Candle[]; c15m: Candle[]; c1h: Candle[]; c4h: Candle[]; c1d: Candle[] };
  derivs?: Derivs | null;
  macro?: MacroCtx | null;
  newsBias?: number;      // -1..+1
  etfBias?: number;       // -1..+1 (BTC/ETH만)
  crossDirs?: number[];   // 교차거래소 방향(-1/0/1)
  eventHoursUntil?: number | null;
  dataHealth?: number;
}
export interface ModesResult { scalp: ModeSignal; swing: ModeSignal; position: ModeSignal }

export function buildModes(inp: BuildModesInput): ModesResult {
  const { c5m, c15m, c1h, c4h, c1d } = inp.candles;
  const frames: Frames = {
    m5: analyzeFrame(c5m), m15: analyzeFrame(c15m), h1: analyzeFrame(c1h),
    h4: analyzeFrame(c4h.length >= 30 ? c4h : c1h), d1: analyzeFrame(c1d.length >= 30 ? c1d : c1h),
  };
  const macro = macroScore(inp.macro ?? null);
  const dv = inp.derivs ?? null;
  const nb = inp.newsBias ?? 0, eb = inp.etfBias ?? 0;
  const cross = inp.crossDirs ?? [];
  const evH = inp.eventHoursUntil ?? null;
  const modes: ModesResult = {
    scalp: judgeMode('scalp', frames, dv, macro, nb, eb, cross, evH),
    swing: judgeMode('swing', frames, dv, macro, nb, eb, cross, evH),
    position: judgeMode('position', frames, dv, macro, nb, eb, cross, evH),
  };
  if ((inp.dataHealth ?? 100) < 50) for (const m of Object.values(modes)) { m.state = 'PAUSED'; m.reasons.unshift('데이터 상태 불량 — 신호 일시정지'); }
  return modes;
}
