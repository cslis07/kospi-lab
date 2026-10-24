/**
 * 폭락 조기 경보 — 사용자 문서 「ETH 2026.10.24-25 폭락 분석 전체 기록」의 가설을 그 문서가 제안한 방식대로 검증·적용한다.
 *
 * 문서 가설(사전 등록, 2026-10-25 — 결과 보기 전 고정, 이후 튜닝 금지):
 *   mtf        일봉·4H·1H 종가가 모두 EMA20 아래(완료된 봉만)                         — 「롱 하면 안 되는 장」 환경 필터
 *   h1VolBreak 1H 거래량 ≥ 직전 20개 평균 4배 + 종가 < EMA20                          — 문서 2장 '첫 번째 사전 경고'
 *   core       mtf + 15분봉이 직전 6h 저점 아래 마감 + 그 15분 안 5분봉 거래량 ≥ 3배    — 문서가 가장 높게 평가한 조합
 *   failReclaim 최근 2h 안 15분 지지 이탈 후 그 가격을 15분 종가로 못 되찾고 이탈 후 저점을 다시 깸 — '반등 실패'
 *   btcBreak   (BTC 아닌 코인) BTC 15분봉이 직전 6h 저점 아래 마감(최근 30분)           — 'BTC 동반 이탈'
 *   check4     30초 체크리스트 5개 중 4개↑: 1H 고점 낮아짐·15분 지지 이탈·5분 거래량 3배·반등 실패·BTC 이탈
 *
 * 문서의 검증 설계 그대로:
 *   폭락 = 이후 60분 안 저가가 시작 시점 종가 대비 −3% 이하(5분봉 기준, 시작 시점은 6h 간격으로 묶음).
 *   경고 적중 = 경고 시점 종가에서 15분 뒤~75분 안에 −3% 도달(최소 15분 선행 — 문서: '급락 시작 최소 15분 전 신호').
 *   성적표 = 적중률(적중 경고/전체 경고) · 포착률(15분 이상 전에 경고가 있었던 폭락/전체 폭락) · 오경보 수 · 평균 선행시간.
 *   대조군 = 아무 5분 시점의 같은 적중 확률(기저율). 유의 = 경고 에피소드 ≥30 · |z|≥2.58 · 앞/뒤 절반 모두 기저율보다 높음.
 * 확률은 과거 빈도이고 매매 신호가 아니다(문서도 '가설적 규칙, 기계적 매매 금지'라고 명시).
 */

export interface Bar { ts: number; o: number; h: number; l: number; c: number; v: number }

export const CRASH_PCT = 3;
export const CRASH_WIN_MIN = 60;
export const LEAD_MIN = 15;
export const MIN_EP = 30;
export const Z_CUT = 2.58;
export const EP_GAP_MS = 6 * 3_600_000;

/** 5분봉 → 상위 시간봉(UTC 정렬). 마지막 미완성 봉은 버린다 */
export function aggregate(b5: Bar[], minutes: number): Bar[] {
  const ms = minutes * 60_000, out: Bar[] = [];
  let cur: Bar | null = null, cnt = 0;
  for (const b of b5) {
    const k = Math.floor(b.ts / ms) * ms;
    if (!cur || cur.ts !== k) {
      if (cur && cnt === minutes / 5) out.push(cur);
      cur = { ts: k, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }; cnt = 1;
    } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; cnt++; }
  }
  if (cur && cnt === minutes / 5) out.push(cur);
  return out;
}

export function ema(values: number[], p = 20): number[] {
  const k = 2 / (p + 1), out: number[] = [];
  let e = 0;
  values.forEach((v, i) => { e = i < p ? (e * i + v) / (i + 1) : v * k + e * (1 - k); out.push(e); });
  return out;
}

/** 시점 t(밀리초)에 완료된 마지막 봉 인덱스(봉 시작 + 길이 ≤ t) */
function lastDone(bars: Bar[], ms: number, t: number, from: number): number {
  let i = from;
  while (i + 1 < bars.length && bars[i + 1].ts + ms <= t) i++;
  return bars[i] && bars[i].ts + ms <= t ? i : -1;
}

export interface Flags {
  ts: number;          // 판정 시각(5분봉 마감)
  close: number;
  mtf: boolean; h1VolBreak: boolean; core: boolean; failReclaim: boolean; btcBreak: boolean | null;
  lowerHighs1h: boolean; break15: boolean; vol5: boolean;
  checklist: number;   // 0~5 (BTC 항목은 BTC 자신이면 제외 → 0~4)
}

interface TF { bars: Bar[]; ema: number[]; ms: number }
const tf = (b5: Bar[], m: number): TF => { const bars = aggregate(b5, m); return { bars, ema: ema(bars.map((x) => x.c)), ms: m * 60_000 }; };

/** 15분봉 i 가 직전 24개(6h) 저점 아래 마감? 그 저점 반환 */
function breakLevel(b15: Bar[], i: number): number | null {
  if (i < 24) return null;
  let lo = Infinity;
  for (let k = i - 24; k < i; k++) lo = Math.min(lo, b15[k].l);
  return b15[i].c < lo ? lo : null;
}

/**
 * 5분봉 마감마다 문서 신호 판정. btcBreakAt: BTC 15분 이탈 여부(시각 → boolean, BTC 자신은 undefined).
 * 반환은 5분 간격 전체(백테스트) — 라이브는 마지막 원소만 쓰면 된다.
 */
export function computeFlags(b5: Bar[], btcBreakAt?: (t: number) => boolean | null): Flags[] {
  const d1 = tf(b5, 1440), h4 = tf(b5, 240), h1 = tf(b5, 60), m15 = tf(b5, 15);
  const out: Flags[] = [];
  let pd = 0, p4 = 0, p1 = 0, p15 = 0;
  const vol5Avg = (i: number) => { let s = 0; for (let k = i - 20; k < i; k++) s += b5[k].v; return s / 20; };
  for (let i = 20; i < b5.length; i++) {
    const t = b5[i].ts + 300_000;
    const id = lastDone(d1.bars, d1.ms, t, pd), i4 = lastDone(h4.bars, h4.ms, t, p4), i1 = lastDone(h1.bars, h1.ms, t, p1), i15 = lastDone(m15.bars, m15.ms, t, p15);
    pd = Math.max(0, id); p4 = Math.max(0, i4); p1 = Math.max(0, i1); p15 = Math.max(0, i15);
    if (id < 20 || i4 < 20 || i1 < 24 || i15 < 32) continue;
    const below = (x: TF, j: number) => x.bars[j].c < x.ema[j];
    const mtf = below(d1, id) && below(h4, i4) && below(h1, i1);
    let v1 = 0; for (let k = i1 - 20; k < i1; k++) v1 += h1.bars[k].v;
    const h1VolBreak = h1.bars[i1].v >= 4 * (v1 / 20) && below(h1, i1);
    // 1H 고점 낮아짐: 최근 3개 1H 최고가 < 그 전 3개 최고가
    const hiB = Math.max(...h1.bars.slice(i1 - 2, i1 + 1).map((x) => x.h)), hiA = Math.max(...h1.bars.slice(i1 - 5, i1 - 2).map((x) => x.h));
    const lowerHighs1h = hiB < hiA;
    // 15분 지지 이탈: 방금 완료된 15분봉(이 5분봉이 그 15분의 마지막일 때만 새로 판정 — 아니면 직전 완료봉 기준 유지)
    const lvl = breakLevel(m15.bars, i15);
    const break15 = lvl != null;
    // 그 15분 안 5분봉 거래량 3배(이 5분봉 포함 최근 3개 중 하나)
    let vol5 = false;
    for (let k = Math.max(20, i - 2); k <= i; k++) if (b5[k].v >= 3 * vol5Avg(k)) vol5 = true;
    const core = mtf && break15 && vol5;
    // 반등 실패: 최근 8개(2h) 15분봉 중 이탈봉 j 가 있고, 이후 15분 종가가 이탈 레벨을 못 되찾았으며, 지금 15분 종가 < j 이후 저점(새 저점)
    let failReclaim = false;
    for (let j = Math.max(25, i15 - 8); j < i15; j++) {
      const L = breakLevel(m15.bars, j);
      if (L == null) continue;
      let reclaimed = false, lowAfter = m15.bars[j].l;
      for (let k = j + 1; k < i15; k++) { if (m15.bars[k].c >= L) reclaimed = true; lowAfter = Math.min(lowAfter, m15.bars[k].l); }
      if (!reclaimed && i15 > j + 1 && m15.bars[i15].c < lowAfter) { failReclaim = true; break; }
    }
    const btcBreak = btcBreakAt ? btcBreakAt(t) : null;
    const items = [lowerHighs1h, break15, vol5 && break15, failReclaim, ...(btcBreak == null ? [] : [btcBreak])];
    out.push({ ts: t, close: b5[i].c, mtf, h1VolBreak, core, failReclaim, btcBreak, lowerHighs1h, break15, vol5, checklist: items.filter(Boolean).length });
  }
  return out;
}

/** BTC 15분봉 6h 저점 이탈이 최근 30분 안에 있었나(시각 → boolean) */
export function btcBreakFn(btc5: Bar[]): (t: number) => boolean | null {
  const m15 = aggregate(btc5, 15);
  const breaks = m15.map((_, i) => (breakLevel(m15, i) != null ? m15[i].ts + 900_000 : null)).filter((x): x is number => x != null);
  return (t) => {
    if (!m15.length || t < m15[0].ts + 7 * 3_600_000) return null;
    let lo = 0, hi = breaks.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (breaks[m] <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans >= 0 && t - breaks[ans] <= 30 * 60_000;
  };
}

/** 시점 index i(5분봉) 종가에서 [from, to]분 사이 저가가 −pct% 이하로 내려가나 */
export function dropWithin(b5: Bar[], i: number, fromMin: number, toMin: number, pct = CRASH_PCT): boolean | null {
  const a = i + fromMin / 5, z = i + toMin / 5;
  if (z >= b5.length) return null;
  const lvl = b5[i].c * (1 - pct / 100);
  for (let k = a + 1; k <= z; k++) if (b5[k].l <= lvl) return true;
  return false;
}

/** 폭락 시작 시각들: 이후 60분 안 −3%, 6h 간격으로 묶은 첫 시점(5분봉 마감 시각) */
export function crashOnsets(b5: Bar[]): number[] {
  const out: number[] = [];
  let last = -Infinity;
  for (let i = 0; i < b5.length; i++) {
    const d = dropWithin(b5, i, 0, CRASH_WIN_MIN);
    if (d && b5[i].ts - last >= EP_GAP_MS) { out.push(b5[i].ts + 300_000); last = b5[i].ts; }
    else if (d) last = b5[i].ts;
  }
  return out;
}

export interface Scorecard {
  key: string;
  warnings: number;          // 경고 에피소드(6h 간격)
  hits: number;              // 그중 15~75분 안 −3%
  precision: number;         // 적중률 %
  base: number;              // 대조군: 아무 5분 시점의 같은 확률 %
  lift: number;              // precision / base
  z: number;
  firstLift: number; secondLift: number;   // 앞/뒤 절반 lift
  crashes: number; caught: number; recall: number;   // 포착률 %
  falseAlarms: number;
  leadMedMin: number | null; // 포착된 폭락의 첫 경고 → 시작 선행시간 중앙값(분)
  verdict: 'significant' | 'noise' | 'thin';
}

export function scorecard(key: string, b5: Bar[], flags: Flags[], sig: (f: Flags) => boolean): Scorecard {
  const idxOf = new Map(b5.map((b, i) => [b.ts + 300_000, i]));
  // 대조군(모든 5분 시점의 15~75분 적중률)
  let bh = 0, bn = 0;
  const half = flags.length ? flags[Math.floor(flags.length / 2)].ts : 0;
  const baseHalf = [{ h: 0, n: 0 }, { h: 0, n: 0 }];
  for (const f of flags) { const i = idxOf.get(f.ts)!; const d = dropWithin(b5, i, LEAD_MIN, LEAD_MIN + CRASH_WIN_MIN); if (d == null) continue; bn++; if (d) bh++; const bh2 = baseHalf[f.ts < half ? 0 : 1]; bh2.n++; if (d) bh2.h++; }
  const base = bn ? (bh / bn) * 100 : NaN;
  // 경고 에피소드
  const eps: { ts: number; hit: boolean }[] = [];
  let last = -Infinity;
  for (const f of flags) {
    if (!sig(f)) continue;
    if (f.ts - last >= EP_GAP_MS) { const d = dropWithin(b5, idxOf.get(f.ts)!, LEAD_MIN, LEAD_MIN + CRASH_WIN_MIN); if (d != null) eps.push({ ts: f.ts, hit: d }); }
    last = f.ts;
  }
  const hits = eps.filter((e) => e.hit).length;
  const precision = eps.length ? (hits / eps.length) * 100 : NaN;
  const p0 = base / 100;
  const z = eps.length && p0 > 0 && p0 < 1 ? (precision / 100 - p0) / Math.sqrt((p0 * (1 - p0)) / eps.length) : 0;
  const liftOf = (xs: typeof eps, b: { h: number; n: number }) => (xs.length && b.h ? (xs.filter((e) => e.hit).length / xs.length) / (b.h / b.n) : NaN);
  const firstLift = liftOf(eps.filter((e) => e.ts < half), baseHalf[0]), secondLift = liftOf(eps.filter((e) => e.ts >= half), baseHalf[1]);
  // 포착률·선행시간: 폭락 시작 전 [시작−24h, 시작−15분] 안 마지막 경고가 있었나(경고 상태가 이어지는 동안 = 신호 시각)
  const onsets = crashOnsets(b5);
  const sigTimes = flags.filter(sig).map((f) => f.ts);
  let caught = 0; const leads: number[] = [];
  for (const o of onsets) {
    const before = sigTimes.filter((t) => t <= o - LEAD_MIN * 60_000 && t >= o - 2 * 3_600_000);
    if (before.length) { caught++; leads.push((o - before[0]) / 60_000); }
  }
  leads.sort((a, b) => a - b);
  const verdict: Scorecard['verdict'] = eps.length < MIN_EP ? 'thin' : z >= Z_CUT && firstLift > 1 && secondLift > 1 ? 'significant' : 'noise';
  return {
    key, warnings: eps.length, hits, precision, base, lift: precision / base, z, firstLift, secondLift,
    crashes: onsets.length, caught, recall: onsets.length ? (caught / onsets.length) * 100 : NaN,
    falseAlarms: eps.length - hits, leadMedMin: leads.length ? leads[Math.floor(leads.length / 2)] : null, verdict,
  };
}

export const WARNINGS: { key: string; label: string; fn: (f: Flags) => boolean }[] = [
  { key: 'mtf', label: '일봉·4H·1H 모두 EMA20 아래', fn: (f) => f.mtf },
  { key: 'h1VolBreak', label: '1H 거래량 4배 + EMA20 아래 마감', fn: (f) => f.h1VolBreak },
  { key: 'core', label: '상위 약세 + 15분 지지 이탈 + 5분 거래량 3배', fn: (f) => f.core },
  { key: 'failReclaim', label: '지지 이탈 후 되찾기 실패 + 새 저점', fn: (f) => f.failReclaim },
  { key: 'btcBreak', label: 'BTC 15분 지지 이탈(최근 30분)', fn: (f) => f.btcBreak === true },
  { key: 'check4', label: '30초 체크리스트 4개 이상', fn: (f) => f.checklist >= 4 },
];

/* ── 실시간 판정(앱·가드) — computeFlags 와 같은 정의를 거래소에서 받은 시간봉에 바로 적용 ─────────
 * 입력은 '완료된 봉만'(오름차순): 일봉·4H·1H·15분·5분(각 ≥ 25~40개, EMA 수렴 위해 200개 권장) + BTC 15분(BTC 자신이면 생략).
 * 테스트(tests/crashWarning.test.ts)가 같은 5분봉을 집계해 computeFlags 마지막 값과 일치하는지 고정한다.
 */
export interface LiveBars { d1: Bar[]; h4: Bar[]; h1: Bar[]; m15: Bar[]; m5: Bar[]; btc15?: Bar[] | null; now: number }

export function liveFlags(x: LiveBars): Flags | null {
  const { d1, h4, h1, m15, m5 } = x;
  if (d1.length < 21 || h4.length < 21 || h1.length < 25 || m15.length < 33 || m5.length < 23) return null;
  const e = (b: Bar[]) => ema(b.map((k) => k.c));
  const ed = e(d1), e4 = e(h4), e1 = e(h1);
  const id = d1.length - 1, i4 = h4.length - 1, i1 = h1.length - 1, i15 = m15.length - 1, i = m5.length - 1;
  const mtf = d1[id].c < ed[id] && h4[i4].c < e4[i4] && h1[i1].c < e1[i1];
  let v1 = 0; for (let k = i1 - 20; k < i1; k++) v1 += h1[k].v;
  const h1VolBreak = h1[i1].v >= 4 * (v1 / 20) && h1[i1].c < e1[i1];
  const hiB = Math.max(...h1.slice(i1 - 2).map((k) => k.h)), hiA = Math.max(...h1.slice(i1 - 5, i1 - 2).map((k) => k.h));
  const lowerHighs1h = hiB < hiA;
  const break15 = breakLevel(m15, i15) != null;
  const avg5 = (j: number) => { let s = 0; for (let k = j - 20; k < j; k++) s += m5[k].v; return s / 20; };
  let vol5 = false;
  for (let k = i - 2; k <= i; k++) if (m5[k].v >= 3 * avg5(k)) vol5 = true;
  let failReclaim = false;
  for (let j = Math.max(25, i15 - 8); j < i15; j++) {
    const L = breakLevel(m15, j);
    if (L == null) continue;
    let reclaimed = false, lowAfter = m15[j].l;
    for (let k = j + 1; k < i15; k++) { if (m15[k].c >= L) reclaimed = true; lowAfter = Math.min(lowAfter, m15[k].l); }
    if (!reclaimed && i15 > j + 1 && m15[i15].c < lowAfter) { failReclaim = true; break; }
  }
  let btcBreak: boolean | null = null;
  if (x.btc15 && x.btc15.length >= 33) {
    btcBreak = false;
    for (let j = x.btc15.length - 1; j >= 25; j--) {
      const doneAt = x.btc15[j].ts + 900_000;
      if (x.now - doneAt > 30 * 60_000) break;
      if (breakLevel(x.btc15, j) != null) { btcBreak = true; break; }
    }
  }
  const items = [lowerHighs1h, break15, vol5 && break15, failReclaim, ...(btcBreak == null ? [] : [btcBreak])];
  return { ts: m5[i].ts + 300_000, close: m5[i].c, mtf, h1VolBreak, core: mtf && break15 && vol5, failReclaim, btcBreak, lowerHighs1h, break15, vol5, checklist: items.filter(Boolean).length };
}

/** 측정 결과 파일(public/data/crash-warning-stats.json) 형태 */
export interface WarningStatsFile { generatedAt: string; days: number; coins: Record<string, Scorecard[]> }

/* ── 로더(네트워크) — Bitget 공개 캔들. 일봉은 UTC 정렬(1Dutc)이라 백테스트(바이낸스 UTC)와 맞는다 ───── */
const GMS: Record<string, number> = { '1Dutc': 86_400_000, '4H': 14_400_000, '1H': 3_600_000, '15m': 900_000, '5m': 300_000 };
async function bg(symbol: string, g: string, limit: number, now: number): Promise<Bar[]> {
  const j = await fetch(`https://api.bitget.com/api/v2/mix/market/candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=${g}&limit=${limit}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) }).then((r) => r.json());
  if (j?.code !== '00000') throw new Error(`Bitget ${symbol} ${g}`);
  return (j.data as string[][]).map((r) => ({ ts: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }))
    .sort((a, b) => a.ts - b.ts).filter((b) => b.ts + GMS[g] <= now);
}

export async function fetchLiveFlags(symbol: string, now: number = Date.now()): Promise<Flags | null> {
  const [d1, h4, h1, m15, m5, btc15] = await Promise.all([
    bg(symbol, '1Dutc', 200, now), bg(symbol, '4H', 200, now), bg(symbol, '1H', 200, now), bg(symbol, '15m', 200, now), bg(symbol, '5m', 100, now),
    symbol === 'BTCUSDT' ? Promise.resolve(null) : bg('BTCUSDT', '15m', 200, now).catch(() => null),
  ]);
  return liveFlags({ d1, h4, h1, m15, m5, btc15, now });
}
