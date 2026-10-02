/**
 * 매매일지 분석 — 에쿼티 커브·최대낙폭(MDD)·연속 승패 스트릭·일별 손익(달력 히트맵).
 * 참고: TraderSync·Edgewonk 의 '자산 곡선·일별 손익 캘린더'. 전부 순수함수(테스트로 고정).
 *
 * 값(value)은 '실현 손익'(코인선물 netProfit USDT, 수수료·펀딩 반영) 또는 R 배수.
 * 시각은 전부 **KST** 기준(서버·브라우저 시간대와 무관) — csv.ts·tradeBreakdown.ts 와 같은 규칙.
 */

export interface TradeValue {
  ts: number;        // 집계 기준 시각(청산 시각)
  value: number;     // 실현 손익(USDT) 또는 R
}

/** ms → 'YYYY-MM-DD'(KST). csv.ts 의 날짜 규칙과 동일(UTC+9 후 ISO 앞 10자) */
export function kstDateKey(ts: number): string {
  return new Date(ts + 9 * 3600_000).toISOString().slice(0, 10);
}

// ────────────────────────── 에쿼티 커브 + MDD ──────────────────────────

export interface EquityPoint {
  ts: number;
  date: string;      // 'YYYY-MM-DD' KST
  value: number;     // 그 매매의 손익
  cum: number;       // 누적 손익(시작 0)
  peak: number;      // 그 시점까지의 누적 최고
  drawdown: number;  // peak - cum (0 이상)
}

export interface EquityCurve {
  points: EquityPoint[];
  tradeCount: number;
  finalCum: number;      // 최종 누적 손익
  peakCum: number;       // 누적 최고(기준 0 포함)
  maxDrawdown: number;   // 최대낙폭(절대값, value 단위) — 0 이상
  maxDrawdownPct: number | null; // 최고 대비 % (최고가 0 이하면 null)
}

/**
 * 청산 손익을 시간순으로 누적한 자산 곡선과 최대낙폭.
 * 기준선은 0(입금액 정보가 없으므로 순손익 기준). 손실이 먼저 나면 cum 이 음수로, peak 는 0 에 머문다.
 */
export function equityCurve(trades: TradeValue[]): EquityCurve {
  const sorted = [...trades].filter((t) => Number.isFinite(t.value)).sort((a, b) => a.ts - b.ts);
  const points: EquityPoint[] = [];
  let cum = 0;
  let peak = 0;        // 기준 0 포함 — 시작 자산 대비 낙폭
  let maxDd = 0;
  let peakAtMaxDd = 0;
  for (const t of sorted) {
    cum += t.value;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDd) { maxDd = dd; peakAtMaxDd = peak; }
    points.push({ ts: t.ts, date: kstDateKey(t.ts), value: t.value, cum, peak, drawdown: dd });
  }
  return {
    points,
    tradeCount: sorted.length,
    finalCum: cum,
    peakCum: peak,
    maxDrawdown: maxDd,
    maxDrawdownPct: peakAtMaxDd > 0 ? (maxDd / peakAtMaxDd) * 100 : null,
  };
}

// ────────────────────────── 연속 승/패 스트릭 ──────────────────────────

export type TradeResult = 'win' | 'loss' | 'even';

export interface StreakStat {
  maxWin: number;    // 최대 연속 승
  maxLoss: number;   // 최대 연속 패
  /** 현재(가장 최근) 연속 — 양수=연승, 음수=연패, 0=없음/직전 본전 */
  current: number;
}

/**
 * 시간순(오래된 것 → 최신)으로 받은 결과열에서 최대 연승·연패·현재 연속을 센다.
 * 본전(even)은 연속을 끊는다(승도 패도 아님). 미청산은 호출 전에 제외할 것.
 */
export function streaks(seq: TradeResult[]): StreakStat {
  let maxWin = 0, maxLoss = 0, cur = 0;
  for (const r of seq) {
    if (r === 'win') { cur = cur > 0 ? cur + 1 : 1; if (cur > maxWin) maxWin = cur; }
    else if (r === 'loss') { cur = cur < 0 ? cur - 1 : -1; if (-cur > maxLoss) maxLoss = -cur; }
    else cur = 0; // even → 끊김
  }
  return { maxWin, maxLoss, current: cur };
}

/** 손익 값을 결과로 환산(+이익=win, −손실=loss, 0=even) */
export function resultOf(value: number): TradeResult {
  return value > 0 ? 'win' : value < 0 ? 'loss' : 'even';
}

// ────────────────────────── 일별 손익 (달력 히트맵) ──────────────────────────

export interface DaySum { pnl: number; count: number }

/** 날짜별(KST) 실현손익 합계·건수 */
export function aggregateDaily(trades: TradeValue[]): Map<string, DaySum> {
  const map = new Map<string, DaySum>();
  for (const t of trades) {
    if (!Number.isFinite(t.value)) continue;
    const k = kstDateKey(t.ts);
    const cur = map.get(k);
    if (cur) { cur.pnl += t.value; cur.count++; }
    else map.set(k, { pnl: t.value, count: 1 });
  }
  return map;
}

/** 거래가 있는 달 목록('YYYY-MM') — 최신 달 먼저 */
export function monthList(trades: { ts: number }[]): string[] {
  const set = new Set<string>();
  for (const t of trades) set.add(kstDateKey(t.ts).slice(0, 7));
  return [...set].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

export interface DayCell {
  date: string;   // 'YYYY-MM-DD'
  day: number;    // 1~31
  dow: number;    // 0=일 … 6=토 (KST 기준 요일)
  pnl: number | null;  // 거래 없으면 null
  count: number;
}

/**
 * 한 달('YYYY-MM')의 1일~말일을 요일(dow)과 함께 돌려준다 — 달력 그리드용.
 * 'YYYY-MM-DD' 의 요일은 시간대와 무관하므로 UTC 자정으로 계산한다.
 */
export function monthDays(ym: string, byDate: Map<string, DaySum>): DayCell[] {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return [];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // 다음달 0일 = 이번달 말일
  const cells: DayCell[] = [];
  for (let d = 1; d <= last; d++) {
    const date = `${ym}-${String(d).padStart(2, '0')}`;
    const s = byDate.get(date);
    cells.push({ date, day: d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay(), pnl: s ? s.pnl : null, count: s ? s.count : 0 });
  }
  return cells;
}

/** 한 달 요약(거래일수·플러스 일수·순손익 합계) */
export function monthSummary(cells: DayCell[]): { tradedDays: number; upDays: number; downDays: number; sum: number } {
  let tradedDays = 0, upDays = 0, downDays = 0, sum = 0;
  for (const c of cells) {
    if (c.pnl == null) continue;
    tradedDays++;
    sum += c.pnl;
    if (c.pnl > 0) upDays++;
    else if (c.pnl < 0) downDays++;
  }
  return { tradedDays, upDays, downDays, sum };
}
