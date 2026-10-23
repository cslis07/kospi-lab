/**
 * 모의 선행테스트(모의매매테스트.md) 자동 판정 — 순수 함수.
 *
 * 사전 기록(data/paper-trades.json)을 1시간봉으로 판정해 사람 손 판정·사후 해석 여지를 없앤다.
 * 판정 규칙(문서 규칙 2·3과 같음, 애매한 경우는 보수적으로):
 *  - 시장가(market): 기록 시각 이후 첫 봉 시가가 아니라 **기록한 진입가**로 체결로 본다.
 *  - 지정가(limit): 롱은 저가 ≤ 진입가, 숏은 고가 ≥ 진입가인 첫 봉에서 체결. voidAt 전까지 미체결이면 무효(성적 제외).
 *  - 같은 봉에서 손절·목표가 둘 다 닿으면 **손절 먼저**로 본다(봉 안 순서 모름).
 *  - 지정가 체결 봉에선 손절만 본다(체결 전 목표에 닿았을 수도 있어 목표는 다음 봉부터).
 *  - 끝까지 둘 다 안 닿으면 미결(open) — 마지막 종가로 평가 R.
 *  - R = (청산−진입)/|진입−손절|, 방향 반영. 수수료·슬리피지 미반영.
 */

export type Side = 'long' | 'short';
export interface Candle { ts: number; o: number; h: number; l: number; c: number }

export interface PaperTrade {
  id: string; round: number; coin: string; side: Side;
  type: 'market' | 'limit';
  entry: number; stop: number; target: number;
  /** 기록(사전 결정) 시각 ISO */
  openedAt: string;
  /** 지정가 무효 시각 ISO(보통 다음 라운드). 없으면 무기한 대기 */
  voidAt?: string;
  conviction?: string;
  /** 변수 기록표 — 조건별 성적 집계 키 */
  conditions: Record<string, string>;
}
export interface PaperSkip {
  round: number; coin: string; price: number; at: string;
  /** 엔진이 냈던 방향(가정 추적용) */
  engine?: Side | 'wait';
  reason: string;
  /** 판정 끝 시각(보통 다음 라운드). 없으면 지금까지 */
  until?: string;
}
export interface PaperLog { trades: PaperTrade[]; skips: PaperSkip[] }

export type Status = 'pending' | 'void' | 'win' | 'loss' | 'open';
export interface Judged {
  trade: PaperTrade; status: Status; r: number | null;
  filledAt?: number; exitAt?: number; exitPrice?: number;
  /** 체결 후 가장 유리했던 가격·불리했던 가격 */
  best?: number; worst?: number;
}

export const riskOf = (t: Pick<PaperTrade, 'entry' | 'stop'>) => Math.abs(t.entry - t.stop);
export const rOf = (t: Pick<PaperTrade, 'entry' | 'stop' | 'side'>, exit: number) =>
  ((t.side === 'long' ? exit - t.entry : t.entry - exit) / riskOf(t));

/** candles는 오름차순, 각 봉 ts=시작 시각(1시간봉). now 이후 봉은 무시 */
export function judgeTrade(t: PaperTrade, candles: Candle[], now: number = Date.now()): Judged {
  const open = Date.parse(t.openedAt);
  const voidAt = t.voidAt ? Date.parse(t.voidAt) : Infinity;
  // 기록 시각 이후에 시작하는 봉만 — 기록 전 가격이 섞인 봉은 제외
  const bars = candles.filter((b) => b.ts >= open && b.ts <= now).sort((a, b) => a.ts - b.ts);
  const long = t.side === 'long';
  const hitStop = (b: Candle) => (long ? b.l <= t.stop : b.h >= t.stop);
  const hitTarget = (b: Candle) => (long ? b.h >= t.target : b.l <= t.target);

  let i = 0; let filledAt: number | undefined;
  if (t.type === 'market') filledAt = bars[0]?.ts ?? open;
  else {
    for (; i < bars.length; i++) {
      if (bars[i].ts >= voidAt) break;
      if (long ? bars[i].l <= t.entry : bars[i].h >= t.entry) { filledAt = bars[i].ts; break; }
    }
    if (filledAt == null) {
      const ended = now >= voidAt || (bars.length > 0 && bars[bars.length - 1].ts + 3_600_000 > voidAt);
      return { trade: t, status: ended ? 'void' : 'pending', r: null };
    }
  }
  let best = t.entry, worst = t.entry;
  for (let k = i; k < bars.length; k++) {
    const b = bars[k];
    const fillBar = t.type === 'limit' && k === i;
    best = long ? Math.max(best, b.h) : Math.min(best, b.l);
    worst = long ? Math.min(worst, b.l) : Math.max(worst, b.h);
    if (hitStop(b)) return { trade: t, status: 'loss', r: -1, filledAt, exitAt: b.ts, exitPrice: t.stop, best, worst };
    if (!fillBar && hitTarget(b)) return { trade: t, status: 'win', r: rOf(t, t.target), filledAt, exitAt: b.ts, exitPrice: t.target, best, worst };
  }
  const last = bars[bars.length - 1];
  const mark = last?.c ?? t.entry;
  return { trade: t, status: 'open', r: rOf(t, mark), filledAt, exitPrice: mark, best, worst };
}

export interface SkipCheck { skip: PaperSkip; highPct: number; lowPct: number; lastPct: number; engineWouldWin: boolean | null }
export function checkSkip(s: PaperSkip, candles: Candle[], now: number = Date.now()): SkipCheck | null {
  const from = Date.parse(s.at), to = s.until ? Date.parse(s.until) : now;
  const bars = candles.filter((b) => b.ts >= from && b.ts < to);
  if (!bars.length) return null;
  const hi = Math.max(...bars.map((b) => b.h)), lo = Math.min(...bars.map((b) => b.l));
  const pct = (x: number) => ((x - s.price) / s.price) * 100;
  const lastPct = pct(bars[bars.length - 1].c);
  const engineWouldWin = s.engine === 'long' ? lastPct > 0 : s.engine === 'short' ? lastPct < 0 : null;
  return { skip: s, highPct: pct(hi), lowPct: pct(lo), lastPct, engineWouldWin };
}

export interface Summary { n: number; wins: number; losses: number; open: number; voided: number; pending: number; sumR: number; winRate: number | null }
export function summarize(js: Judged[]): Summary {
  const s: Summary = { n: 0, wins: 0, losses: 0, open: 0, voided: 0, pending: 0, sumR: 0, winRate: null };
  for (const j of js) {
    if (j.status === 'void') { s.voided++; continue; }
    if (j.status === 'pending') { s.pending++; continue; }
    s.n++; s.sumR += j.r ?? 0;
    if (j.status === 'win') s.wins++; else if (j.status === 'loss') s.losses++; else s.open++;
  }
  const decided = s.wins + s.losses;
  s.winRate = decided ? s.wins / decided : null;
  return s;
}

/** 조건별 성적 — 확정(win/loss)만 승률에, open은 R 합에만 */
export interface CondRow { key: string; value: string; n: number; wins: number; losses: number; sumR: number; winRate: number | null }
export function byCondition(js: Judged[]): CondRow[] {
  const map = new Map<string, CondRow>();
  for (const j of js) {
    if (j.status === 'void' || j.status === 'pending') continue;
    for (const [key, value] of Object.entries(j.trade.conditions)) {
      const id = `${key}\u0000${value}`;
      const row = map.get(id) ?? { key, value, n: 0, wins: 0, losses: 0, sumR: 0, winRate: null };
      row.n++; row.sumR += j.r ?? 0;
      if (j.status === 'win') row.wins++; else if (j.status === 'loss') row.losses++;
      map.set(id, row);
    }
  }
  const rows = [...map.values()];
  for (const r of rows) { const d = r.wins + r.losses; r.winRate = d ? r.wins / d : null; }
  return rows.sort((a, b) => (a.key === b.key ? b.n - a.n : a.key.localeCompare(b.key)));
}

/** 50% 대비 단측 이항검정 p값(승수 ≥ wins) — n≥30 전엔 화면에서 '결론 불가'로만 쓴다 */
export function binomTailP(wins: number, n: number, p = 0.5): number {
  if (n <= 0) return 1;
  const lg = [0]; for (let i = 1; i <= n; i++) lg[i] = lg[i - 1] + Math.log(i);
  let tail = 0;
  for (let k = wins; k <= n; k++) tail += Math.exp(lg[n] - lg[k] - lg[n - k] + k * Math.log(p) + (n - k) * Math.log(1 - p));
  return Math.min(1, tail);
}

export const MIN_N = 30;
export const verdictText = (n: number, winRate: number | null, p: number) =>
  n < MIN_N ? `결론 불가 (n=${n} < ${MIN_N})` : p < 0.05 ? `50% 대비 유의 (p=${p.toFixed(3)})` : `우연 범위 (p=${p.toFixed(3)})`;
