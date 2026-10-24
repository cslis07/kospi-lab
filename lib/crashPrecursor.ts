/**
 * 급변 전조 — "조용한 압축 뒤 한쪽으로 터지는" 구간을 사실(가격·거래 통계)로 잡는다. 순수 함수.
 *
 * 출발점: 2026-10-24 23:15 KST 4코인 동시 급락(ETH −4%대). 직전 12시간 15분봉 변동폭 0.07~0.30%(극단 압축·주말),
 * 고점이 낮아지는 완만한 하락, 개미 계정 롱 비율 상승, 하루 저점 이탈 순간 거래량 30배·OI 급감(롱 강제청산 연쇄).
 *
 * ⚠ 사건 하나로 규칙을 만들면 과적합이다. 그래서 scripts/backtest-crash-precursor.ts 가 아래 신호를
 *   **결과 보기 전에 고정한 기준**으로 1년치(가격)·30일치(파생)에 대조군과 함께 잰다.
 *   통과한 신호만 화면·알림에서 '측정됨'으로 쓰고, 나머지는 '측정상 효과 없음'으로 표시한다.
 *
 * 판정 기준(사전 고정, 튜닝 금지):
 *   결과 = 다음 4시간(15분봉 16개) 안 최대 하락/상승이 그 코인 직전 30일 4시간 최대 움직임 상위 20% 문턱 이상.
 *   신호 에피소드 = 신호 시각이 직전 신호와 6시간 이상 떨어진 첫 시각(겹친 표본으로 z 부풀리기 방지).
 *   유효 = 에피소드 ≥ 30 · |z| ≥ 2.58(평소 대비 비율 차) · 기간 앞/뒤 절반 같은 방향.
 */

export interface Bar { ts: number; o: number; h: number; l: number; c: number; v: number }

export const BARS_6H = 24;          // 15분봉
export const BARS_4H = 16;
export const LOOKBACK_HOURS = 720;  // 30일(시간 단위 평가점)
export const COMPRESSION_PCT = 0.15;
export const MIN_EPISODES = 30;
export const Z_CUT = 2.58;
export const EPISODE_GAP_H = 6;

/** 직전 n봉 변동폭(%) = (최고가−최저가)/종가 */
export function rangePct(bars: Bar[], end: number, n: number): number | null {
  if (end - n + 1 < 0) return null;
  let hi = -Infinity, lo = Infinity;
  for (let i = end - n + 1; i <= end; i++) { hi = Math.max(hi, bars[i].h); lo = Math.min(lo, bars[i].l); }
  return ((hi - lo) / bars[end].c) * 100;
}

/** 값 x 의 과거 분포 내 백분위(0~1, 작을수록 낮음) */
export function pctRank(hist: number[], x: number): number | null {
  if (hist.length < 50) return null;
  let below = 0;
  for (const h of hist) if (h < x) below++;
  return below / hist.length;
}

/** 하락 기울기: 6시간 전보다 낮고, 최근 3시간 고점이 그 전 3시간 고점보다 낮음 */
export function downDrift(bars: Bar[], end: number): boolean {
  if (end < BARS_6H) return false;
  const half = BARS_6H / 2;
  let hiA = -Infinity, hiB = -Infinity;
  for (let i = end - BARS_6H + 1; i <= end - half; i++) hiA = Math.max(hiA, bars[i].h);
  for (let i = end - half + 1; i <= end; i++) hiB = Math.max(hiB, bars[i].h);
  return bars[end].c < bars[end - BARS_6H].c && hiB < hiA;
}
export function upDrift(bars: Bar[], end: number): boolean {
  if (end < BARS_6H) return false;
  const half = BARS_6H / 2;
  let loA = Infinity, loB = Infinity;
  for (let i = end - BARS_6H + 1; i <= end - half; i++) loA = Math.min(loA, bars[i].l);
  for (let i = end - half + 1; i <= end; i++) loB = Math.min(loB, bars[i].l);
  return bars[end].c > bars[end - BARS_6H].c && loB > loA;
}

/** 24시간 저점까지 거리(15분 ATR 배수) — 작을수록 지지 시험 중 */
export function distToLowAtr(bars: Bar[], end: number): number | null {
  if (end < 96) return null;
  let lo = Infinity;
  for (let i = end - 95; i <= end; i++) lo = Math.min(lo, bars[i].l);
  let tr = 0;
  for (let i = end - 13; i <= end; i++) tr += Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c));
  const a = tr / 14;
  return a > 0 ? (bars[end].c - lo) / a : null;
}

/** 다음 4시간 최대 하락·상승(%) — 결과(미래) */
export function forwardMove(bars: Bar[], end: number, n = BARS_4H): { dn: number; up: number } | null {
  if (end + n >= bars.length) return null;
  const c = bars[end].c;
  let hi = -Infinity, lo = Infinity;
  for (let i = end + 1; i <= end + n; i++) { hi = Math.max(hi, bars[i].h); lo = Math.min(lo, bars[i].l); }
  return { dn: ((c - lo) / c) * 100, up: ((hi - c) / c) * 100 };
}

export interface Point {
  ts: number;
  comp: number | null;      // 6h 변동폭 백분위
  down: boolean; up: boolean;
  nearLow: boolean;
  crowd?: boolean | null;   // 파생(개미 롱 쏠림 증가) — 있는 구간만
  oiBuild?: boolean | null; // 파생(박스권 레버리지 축적: OI 6h ≥ +1% · 가격 6h ±0.5% 안)
  bigDn: boolean; bigUp: boolean;
}

/** 시간 단위 평가점 생성(마지막 15분봉 마감 시각마다). 결과 문턱은 직전 30일 4h 최대움직임 80분위(미래 정보 없음) */
export interface DerivAt { crowd: boolean | null; oiChg6h: number | null }
export const OI_BUILD_PCT = 1, FLAT_PRICE_PCT = 0.5;

export function buildPoints(bars: Bar[], derivAt?: (ts: number) => DerivAt | null): Point[] {
  const out: Point[] = [];
  const rngHist: number[] = [], moveHist: number[] = [];
  for (let i = 96; i < bars.length; i += 4) {
    const r = rangePct(bars, i, BARS_6H);
    const fm = forwardMove(bars, i);
    if (r == null) continue;
    const comp = pctRank(rngHist.slice(-LOOKBACK_HOURS), r);
    const thr = moveHist.length >= 200 ? quantile(moveHist.slice(-LOOKBACK_HOURS), 0.8) : null;
    if (fm && thr != null && comp != null) {
      const d = distToLowAtr(bars, i);
      out.push({
        ts: bars[i].ts + 15 * 60_000, comp, down: downDrift(bars, i), up: upDrift(bars, i), nearLow: d != null && d <= 2,
        ...derivFields(derivAt?.(bars[i].ts + 15 * 60_000), ((bars[i].c / bars[i - BARS_6H].c) - 1) * 100),
        bigDn: fm.dn >= thr, bigUp: fm.up >= thr,
      });
    }
    rngHist.push(r);
    // 결과 문턱용 과거 분포는 '이미 끝난' 4시간 창만(i−16 시점의 결과 = 지금 시점까지의 가격)
    const past = i - BARS_4H;
    if (past >= 0) { const pm = forwardMove(bars, past); if (pm) moveHist.push(Math.max(pm.dn, pm.up)); }
  }
  return out;
}

function derivFields(d: DerivAt | null | undefined, priceChg6h: number): Pick<Point, 'crowd' | 'oiBuild'> {
  if (d === undefined) return {};
  if (d === null) return { crowd: null, oiBuild: null };
  return { crowd: d.crowd, oiBuild: d.oiChg6h == null ? null : d.oiChg6h >= OI_BUILD_PCT && Math.abs(priceChg6h) < FLAT_PRICE_PCT };
}

export function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** 신호 에피소드: 직전 신호와 gap 시간 이상 떨어진 첫 시각만 */
export function episodes(points: Point[], sig: (p: Point) => boolean, gapH = EPISODE_GAP_H): Point[] {
  const out: Point[] = [];
  let last = -Infinity;
  for (const p of points) {
    if (!sig(p)) continue;
    if (p.ts - last >= gapH * 3_600_000) out.push(p);
    last = p.ts;
  }
  return out;
}

export interface SigStat {
  n: number;                  // 에피소드 수
  dnRate: number; upRate: number;     // 에피소드 중 급락/급등 비율 %
  baseDn: number; baseUp: number;     // 전체 평가점 기준(대조군) %
  zDn: number; zUp: number;
  firstDn: number; secondDn: number;  // 앞/뒤 절반 급락 비율 − 대조군 (%p)
  firstUp: number; secondUp: number;
  verdictDn: 'significant' | 'noise' | 'thin';
  verdictUp: 'significant' | 'noise' | 'thin';
}

const rate = (xs: Point[], k: 'bigDn' | 'bigUp') => (xs.length ? (xs.filter((x) => x[k]).length / xs.length) * 100 : NaN);
const zOf = (p: number, p0: number, n: number) => (n && p0 > 0 && p0 < 100 ? (p / 100 - p0 / 100) / Math.sqrt((p0 / 100) * (1 - p0 / 100) / n) : 0);

export function sigStat(points: Point[], sig: (p: Point) => boolean): SigStat {
  const ep = episodes(points, sig);
  const baseDn = rate(points, 'bigDn'), baseUp = rate(points, 'bigUp');
  const dnRate = rate(ep, 'bigDn'), upRate = rate(ep, 'bigUp');
  const mid = points.length ? points[Math.floor(points.length / 2)].ts : 0;
  const a = ep.filter((p) => p.ts < mid), b = ep.filter((p) => p.ts >= mid);
  const pa = points.filter((p) => p.ts < mid), pb = points.filter((p) => p.ts >= mid);
  const firstDn = rate(a, 'bigDn') - rate(pa, 'bigDn'), secondDn = rate(b, 'bigDn') - rate(pb, 'bigDn');
  const firstUp = rate(a, 'bigUp') - rate(pa, 'bigUp'), secondUp = rate(b, 'bigUp') - rate(pb, 'bigUp');
  const zDn = zOf(dnRate, baseDn, ep.length), zUp = zOf(upRate, baseUp, ep.length);
  const v = (z: number, f: number, s: number): SigStat['verdictDn'] =>
    ep.length < MIN_EPISODES ? 'thin' : Math.abs(z) >= Z_CUT && Number.isFinite(f) && Number.isFinite(s) && Math.sign(f) === Math.sign(s) && Math.sign(f) === Math.sign(z) ? 'significant' : 'noise';
  return { n: ep.length, dnRate, upRate, baseDn, baseUp, zDn, zUp, firstDn, secondDn, firstUp, secondUp, verdictDn: v(zDn, firstDn, secondDn), verdictUp: v(zUp, firstUp, secondUp) };
}

/** 사전 등록 신호 — 이름은 화면·보고서에 그대로 쓴다 */
export const SIGNALS: { key: string; label: string; fn: (p: Point) => boolean; needsCrowd?: boolean; needsOi?: boolean }[] = [
  { key: 'comp', label: '변동성 압축(6h 변동폭 30일 하위 15%)', fn: (p) => p.comp != null && p.comp <= COMPRESSION_PCT },
  { key: 'compDown', label: '압축 + 하락 기울기(고점 낮아짐)', fn: (p) => p.comp != null && p.comp <= COMPRESSION_PCT && p.down },
  { key: 'compDownLow', label: '압축 + 하락 기울기 + 24h 저점 근접(2 ATR)', fn: (p) => p.comp != null && p.comp <= COMPRESSION_PCT && p.down && p.nearLow },
  { key: 'compUp', label: '압축 + 상승 기울기(저점 높아짐)', fn: (p) => p.comp != null && p.comp <= COMPRESSION_PCT && p.up },
  { key: 'compCrowd', label: '압축 + 개미 롱 쏠림 증가(30일분)', fn: (p) => p.comp != null && p.comp <= COMPRESSION_PCT && p.crowd === true, needsCrowd: true },
  // (2026-10-25 추가 — 30일분 결과 보기 전 등록) 파생 단독
  { key: 'crowd', label: '개미 롱 쏠림 증가(계정 롱숏 7일 +1σ·2h 상승)', fn: (p) => p.crowd === true, needsCrowd: true },
  { key: 'crowdDown', label: '개미 롱 쏠림 + 하락 기울기', fn: (p) => p.crowd === true && p.down, needsCrowd: true },
  { key: 'oiBuild', label: '박스권 레버리지 축적(OI 6h +1%↑·가격 ±0.5%)', fn: (p) => p.oiBuild === true, needsOi: true },
  { key: 'oiBuildCrowd', label: '레버리지 축적 + 개미 롱 쏠림', fn: (p) => p.oiBuild === true && p.crowd === true, needsCrowd: true },
];

/* ── 충격봉 이후 — 첫 급락(급등) 봉 다음에 추가 하락이 더 잦았나, 반등이 더 잦았나 ────────────
 * (2026-10-25 등록, 결과 보기 전 고정) 10-24 23:00~23:15 첫 다리(거래량 30배·저점 마감) 뒤 30분~1시간 추가 급락이 있었다.
 * 충격봉 = 15분봉 거래량 ≥ 직전 20봉 중앙값의 8배 · 봉 변동폭 ≥ 직전 14봉 평균 변동폭의 3배 · 종가가 봉 하단 25%(하락) / 상단 25%(상승).
 * 결과 = 다음 2시간(8봉) 안에 충격봉 종가에서 '충격봉 변동폭의 1배' 이상 같은 방향으로 더 감(continue) / 반대로 1배 이상 되돌림(revert).
 * 비교: P(continue) vs P(revert) — 둘 다 아닌 경우도 센다. 판정은 에피소드 ≥30 · 이항(continue vs revert 50:50) |z|≥2.58 · 앞/뒤 절반 같은 방향.
 */
export interface ShockEvent { ts: number; dir: 'down' | 'up'; cont: boolean; rev: boolean }

export function shockEvents(bars: Bar[], volMult = 8, rngMult = 3, n = 8): ShockEvent[] {
  const out: ShockEvent[] = [];
  let last = -Infinity;
  for (let i = 21; i + n < bars.length; i++) {
    const b = bars[i];
    const vols = bars.slice(i - 20, i).map((x) => x.v).sort((a, c) => a - c);
    const medV = vols[10];
    const avgR = bars.slice(i - 14, i).reduce((s, x) => s + (x.h - x.l), 0) / 14;
    const r = b.h - b.l;
    if (!(medV > 0 && avgR > 0) || b.v < volMult * medV || r < rngMult * avgR) continue;
    const pos = (b.c - b.l) / r;
    const dir = pos <= 0.25 ? 'down' : pos >= 0.75 ? 'up' : null;
    if (!dir || b.ts - last < EPISODE_GAP_H * 3_600_000) continue;
    last = b.ts;
    let hi = -Infinity, lo = Infinity;
    for (let k = i + 1; k <= i + n; k++) { hi = Math.max(hi, bars[k].h); lo = Math.min(lo, bars[k].l); }
    const cont = dir === 'down' ? b.c - lo >= r : hi - b.c >= r;
    const rev = dir === 'down' ? hi - b.c >= r : b.c - lo >= r;
    out.push({ ts: b.ts, dir, cont, rev });
  }
  return out;
}

export interface ShockStat { n: number; cont: number; rev: number; neither: number; z: number; first: number; second: number; verdict: 'continue' | 'revert' | 'noise' | 'thin' }
/** continue vs revert 비교(둘 다/둘 다 아님은 z에서 제외). first/second = 앞/뒤 절반의 (cont − rev) 비율 %p */
export function shockStat(ev: ShockEvent[]): ShockStat {
  const cont = ev.filter((e) => e.cont && !e.rev).length, rev = ev.filter((e) => e.rev && !e.cont).length;
  const m = cont + rev;
  const z = m ? (cont - m / 2) / Math.sqrt(m / 4) : 0;
  const half = Math.floor(ev.length / 2);
  const diff = (xs: ShockEvent[]) => (xs.length ? ((xs.filter((e) => e.cont && !e.rev).length - xs.filter((e) => e.rev && !e.cont).length) / xs.length) * 100 : NaN);
  const first = diff(ev.slice(0, half)), second = diff(ev.slice(half));
  const verdict: ShockStat['verdict'] = ev.length < MIN_EPISODES ? 'thin'
    : Math.abs(z) >= Z_CUT && Math.sign(first) === Math.sign(second) && Math.sign(first) === Math.sign(z) ? (z > 0 ? 'continue' : 'revert') : 'noise';
  return { n: ev.length, cont, rev, neither: ev.length - cont - rev, z, first, second, verdict };
}

/* ── 실시간 판정(앱·가드) — 백테스트와 같은 정의를 지금 시각에 적용 ───────────────────
 * 6h 변동폭은 15분봉 24개의 최고·최저 = 정시에 맞춘 1시간봉 6개의 최고·최저와 같다 → 라이브는 1시간봉(최대 41일)으로 계산.
 * 하락 기울기(3h 반씩 고점 비교·6h 전 종가)도 1시간봉으로 동일. 24h 저점 거리·충격봉은 15분봉.
 */
export interface LiveState {
  comp: number | null;          // 6h 변동폭 백분위(직전 최대 30일)
  rng6h: number | null;         // 6h 변동폭 %
  down: boolean; up: boolean; nearLow: boolean;
  oiBuild: boolean | null;      // OI 6h 변화가 있을 때만
  shock: { ts: number; dir: 'down' | 'up'; rangePct: number; volX: number } | null;   // 최근 2시간 안 마지막 충격봉
  signals: string[];            // 지금 켜진 사전 등록 신호 key
}

/** 마감된 1시간봉(오름차순)으로 6h 변동폭 시계열 — 시점마다 직전 6개 */
function hourlyRanges(h1: Bar[]): number[] {
  const out: number[] = [];
  for (let i = 5; i < h1.length; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let k = i - 5; k <= i; k++) { hi = Math.max(hi, h1[k].h); lo = Math.min(lo, h1[k].l); }
    out.push(((hi - lo) / h1[i].c) * 100);
  }
  return out;
}

/** 최근 lookback 봉 안의 마지막 충격봉(정의는 shockEvents 와 같음, 미래 결과 없이) */
export function latestShock(m15: Bar[], lookback = 8, volMult = 8, rngMult = 3): LiveState['shock'] {
  for (let i = m15.length - 1; i >= Math.max(21, m15.length - lookback); i--) {
    const b = m15[i];
    const vols = m15.slice(i - 20, i).map((x) => x.v).sort((a, c) => a - c);
    const medV = vols[10];
    const avgR = m15.slice(i - 14, i).reduce((s, x) => s + (x.h - x.l), 0) / 14;
    const r = b.h - b.l;
    if (!(medV > 0 && avgR > 0) || b.v < volMult * medV || r < rngMult * avgR) continue;
    const pos = (b.c - b.l) / r;
    const dir = pos <= 0.25 ? 'down' : pos >= 0.75 ? 'up' : null;
    if (dir) return { ts: b.ts, dir, rangePct: (r / b.c) * 100, volX: b.v / medV };
  }
  return null;
}

export function liveState(h1: Bar[], m15: Bar[], oiChg6h: number | null): LiveState {
  const rs = hourlyRanges(h1);
  const cur = rs.at(-1) ?? null;
  const comp = cur == null ? null : pctRank(rs.slice(-LOOKBACK_HOURS - 1, -1), cur);
  const n = h1.length;
  let down = false, up = false;
  if (n >= 7) {
    const hiA = Math.max(...h1.slice(n - 6, n - 3).map((b) => b.h)), hiB = Math.max(...h1.slice(n - 3).map((b) => b.h));
    const loA = Math.min(...h1.slice(n - 6, n - 3).map((b) => b.l)), loB = Math.min(...h1.slice(n - 3).map((b) => b.l));
    down = h1[n - 1].c < h1[n - 7].c && hiB < hiA;
    up = h1[n - 1].c > h1[n - 7].c && loB > loA;
  }
  const d = m15.length > 100 ? distToLowAtr(m15, m15.length - 1) : null;
  const priceChg6h = n >= 7 ? (h1[n - 1].c / h1[n - 7].c - 1) * 100 : 0;
  const oiBuild = oiChg6h == null ? null : oiChg6h >= OI_BUILD_PCT && Math.abs(priceChg6h) < FLAT_PRICE_PCT;
  const st: LiveState = { comp, rng6h: cur, down, up, nearLow: d != null && d <= 2, oiBuild, shock: latestShock(m15), signals: [] };
  const pt: Point = { ts: 0, comp, down, up, nearLow: st.nearLow, oiBuild, crowd: null, bigDn: false, bigUp: false };
  st.signals = SIGNALS.filter((s) => !s.needsCrowd && s.fn(pt)).map((s) => s.key);
  return st;
}

/* ── 측정 결과 파일(public/data/precursor-stats.json, scripts/precursor-stats.ts 가 생성) ─────────── */
export interface StatsFile {
  generatedAt: string;
  days: { signals: number; shock: number };
  coins: Record<string, {
    signals: Record<string, { n: number; dnRate: number; upRate: number; baseDn: number; baseUp: number; zDn: number; zUp: number; verdictDn: SigStat['verdictDn']; verdictUp: SigStat['verdictUp'] }>;
    shockDown: ShockStat; shockUp: ShockStat;
  }>;
  pooledShockDown: ShockStat; pooledShockUp: ShockStat;
}
