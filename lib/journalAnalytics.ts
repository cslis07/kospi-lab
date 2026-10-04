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

// ────────────────────────── 손익비·Profit Factor·기대값 ──────────────────────────

export interface EdgeSummary {
  n: number;                      // 값이 있는 매매 수
  wins: number;                   // 값 > 0
  losses: number;                 // 값 < 0 (0 = 본전은 둘 다 아님)
  winRate: number | null;         // % = 승 ÷ (승 + 패)
  avgWin: number | null;          // 평균 익절(양수)
  avgLoss: number | null;         // 평균 손절(양수 크기)
  /** 손익비 = 평균 익절 ÷ 평균 손절 */
  payoff: number | null;
  /** Profit Factor = 총이익 ÷ 총손실(크기). 1 초과 = 순이익. 손실이 없으면 null(정의 불가) */
  profitFactor: number | null;
  /** 기대값 = 건당 평균 결과(본전 포함) */
  expectancy: number | null;
  /** 이 손익비에서 본전이 되는 승률(%) = 평균 손절 ÷ (평균 익절 + 평균 손절) */
  breakevenWinRate: number | null;
  grossWin: number;
  grossLoss: number;              // 크기(양수)
}

/**
 * 결과값(USDT 손익 또는 R) 목록 → 손익비·Profit Factor·기대값 요약(참고: Edgewonk·TraderSync).
 * 승률·평균·기대값이 같은 정의를 쓰도록 이 함수 하나로 계산한다(targetPlan.measureEdge 도 이걸 쓴다).
 */
export function edgeSummary(values: number[]): EdgeSummary {
  const vs = values.filter((v) => Number.isFinite(v));
  const win = vs.filter((v) => v > 0), loss = vs.filter((v) => v < 0);
  const grossWin = win.reduce((a, v) => a + v, 0);
  const grossLoss = Math.abs(loss.reduce((a, v) => a + v, 0));
  const avgWin = win.length ? grossWin / win.length : null;
  const avgLoss = loss.length ? grossLoss / loss.length : null;
  const decided = win.length + loss.length;
  return {
    n: vs.length, wins: win.length, losses: loss.length,
    winRate: decided ? (win.length / decided) * 100 : null,
    avgWin, avgLoss,
    payoff: avgWin != null && avgLoss ? avgWin / avgLoss : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    expectancy: vs.length ? vs.reduce((a, v) => a + v, 0) / vs.length : null,
    breakevenWinRate: avgWin != null && avgLoss != null && avgWin + avgLoss > 0 ? (avgLoss / (avgWin + avgLoss)) * 100 : null,
    grossWin, grossLoss,
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

// ────────────────────────── 연패 직후 매매(틸트 확인) ──────────────────────────

export interface StreakTradeIn {
  openTs: number;
  closeTs: number;
  value: number;            // 순손익
  notional?: number | null; // 진입 규모(수량 × 진입가) — 연패 뒤 사이즈를 키웠나
}
export interface AfterStreakRow {
  key: string;
  label: string;
  prior: number;            // 직전 연속 손실 수(cap 이상은 cap)
  count: number;
  wins: number;
  winRate: number | null;   // % = 승 ÷ (승 + 패)
  sum: number;
  avg: number | null;       // 건당 기대값
  avgNotional: number | null;
  thin: boolean;
}

/**
 * 연패 직후 매매의 성적(참고: Edgewonk 'Tiltmeter'). 각 매매에 대해 **그 진입 시점까지 청산된** 매매만 보고
 * 가장 최근부터 연속 손실 수를 센다(본전·이익에서 끊김) — 동시에 들고 있던 포지션의 결과는 진입 때 몰랐으므로 넣지 않는다.
 * 앞선 청산 매매가 하나도 없는 매매(맥락 없음)는 뺀다. 3연패 이상은 한 줄로(cap).
 */
export function afterLossStreaks(trades: StreakTradeIn[], cap = 3, thinAt = 5): AfterStreakRow[] {
  const byClose = [...trades].filter((t) => Number.isFinite(t.value)).sort((a, b) => a.closeTs - b.closeTs);
  const rows: AfterStreakRow[] = Array.from({ length: cap + 1 }, (_, k) => ({
    key: `ls${k}`, prior: k,
    label: k === 0 ? '직전 이익·본전 뒤' : k === cap ? `${cap}연패 이상 뒤` : `${k}연패 뒤`,
    count: 0, wins: 0, winRate: null, sum: 0, avg: null, avgNotional: null, thin: true,
  }));
  const losses = new Array(rows.length).fill(0);
  const notionalSum = new Array(rows.length).fill(0), notionalN = new Array(rows.length).fill(0);
  for (const t of byClose) {
    const known = byClose.filter((p) => p !== t && p.closeTs <= t.openTs);
    if (!known.length) continue;
    let streak = 0;
    for (let i = known.length - 1; i >= 0 && known[i].value < 0; i--) streak++;
    const k = Math.min(streak, cap);
    const r = rows[k];
    r.count++; r.sum += t.value;
    if (t.value > 0) r.wins++; else if (t.value < 0) losses[k]++;
    if (t.notional != null && Number.isFinite(t.notional) && t.notional > 0) { notionalSum[k] += t.notional; notionalN[k]++; }
  }
  rows.forEach((r, k) => {
    const decided = r.wins + losses[k];
    r.winRate = decided ? (r.wins / decided) * 100 : null;
    r.avg = r.count ? r.sum / r.count : null;
    r.avgNotional = notionalN[k] ? notionalSum[k] / notionalN[k] : null;
    r.thin = r.count < thinAt;
  });
  return rows.filter((r) => r.count > 0);
}

// ────────────────────────── 하루 매매 횟수별 성적(과매매) ──────────────────────────

export interface DayCountTrade { ts: number; value: number } // ts = 진입 시각
export interface TradesPerDayRow {
  key: string;
  label: string;
  order: number;
  days: number;             // 이 빈도에 해당하는 날 수
  count: number;            // 그 날들의 매매 수
  wins: number;
  winRate: number | null;   // % (승/(승+패))
  sum: number;
  avg: number | null;       // 매매 건당 기대값
  thin: boolean;            // 날 수 5 미만
}

/** 하루 매매 횟수 버킷 경계(이상~미만, 마지막은 상한 없음) */
export const TRADES_PER_DAY_BANDS: { from: number; to: number; label: string }[] = [
  { from: 1, to: 3, label: '하루 1~2회' },
  { from: 3, to: 5, label: '하루 3~4회' },
  { from: 5, to: Infinity, label: '하루 5회+' },
];

/**
 * 하루 매매 횟수별 성적(참고: TraderSync '과매매'). 진입 시각(KST)으로 그 날의 매매 수를 세고,
 * 각 매매를 '그날 매매가 몇 번이었나' 버킷에 넣어 묶는다 → 많이 한 날의 매매가 실제로 더 나빴는지 본다.
 */
export function tradesPerDay(trades: DayCountTrade[], thinAt = 5): TradesPerDayRow[] {
  const byDate = new Map<string, DayCountTrade[]>();
  for (const t of trades) {
    const k = kstDateKey(t.ts);
    const arr = byDate.get(k);
    if (arr) arr.push(t); else byDate.set(k, [t]);
  }
  const bandOf = (n: number) => TRADES_PER_DAY_BANDS.findIndex((b) => n >= b.from && n < b.to);
  const agg = new Map<number, { days: Set<string>; items: DayCountTrade[] }>();
  for (const [date, list] of byDate) {
    const b = bandOf(list.length);
    if (b < 0) continue;
    const a = agg.get(b) ?? { days: new Set<string>(), items: [] as DayCountTrade[] };
    a.days.add(date); a.items.push(...list);
    agg.set(b, a);
  }
  return [...agg.entries()].sort((x, y) => x[0] - y[0]).map(([b, a]) => {
    const vals = a.items.map((i) => i.value).filter((v) => Number.isFinite(v));
    const wins = vals.filter((v) => v > 0).length, losses = vals.filter((v) => v < 0).length;
    const decided = wins + losses;
    const sum = vals.reduce((s, v) => s + v, 0);
    return {
      key: `tpd${b}`, label: TRADES_PER_DAY_BANDS[b].label, order: b,
      days: a.days.size, count: a.items.length, wins,
      winRate: decided ? (wins / decided) * 100 : null,
      sum, avg: a.items.length ? sum / a.items.length : null,
      thin: a.days.size < thinAt,
    };
  });
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
