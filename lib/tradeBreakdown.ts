/**
 * 매매 손익 분해 — 요일·시간대·종목별(참고: Edgewonk·TraderSync 의 '언제·무엇에서 벌고 잃나' 표). 순수함수(테스트 대상).
 *
 * 시각은 전부 **KST** 기준(서버·브라우저 시간대와 무관). 값(value)이 없는 매매는 건수·승률에만 넣고 합계·평균에서 뺀다
 * (결과만 적고 R/손익을 안 적은 매매가 0으로 섞여 평균을 끌어내리지 않게).
 * 표본이 작은 칸(기본 5건 미만)은 thin=true — 화면에서 흐리게 표시해 '우연'을 패턴으로 읽지 않게 한다.
 */

export interface BreakRow {
  key: string;
  label: string;
  order: number;
  count: number;          // 결과가 확정된 매매 수
  wins: number;
  winRate: number | null; // %
  valued: number;         // 값(손익/R)이 있는 매매 수
  sum: number;
  avg: number | null;
  thin: boolean;          // 표본 부족
}

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
/** 4시간 단위 시간대(KST) — 국내 정규장(09~15:30)·미국장(22:30~05)이 갈리게 */
export const HOUR_BANDS: { from: number; to: number; label: string }[] = [
  { from: 0, to: 4, label: '00~04시' }, { from: 4, to: 8, label: '04~08시' }, { from: 8, to: 12, label: '08~12시' },
  { from: 12, to: 16, label: '12~16시' }, { from: 16, to: 20, label: '16~20시' }, { from: 20, to: 24, label: '20~24시' },
];
export const THIN_SAMPLE = 5;

/** ts(ms) → KST 요일(0=일)·시(0~23) */
export function kstParts(ts: number): { wd: number; hour: number } {
  const d = new Date(ts + 9 * 3600_000);
  return { wd: d.getUTCDay(), hour: d.getUTCHours() };
}

export interface BreakItem {
  ts: number;
  symbol: string;
  label?: string;          // 종목 표시명(없으면 symbol)
  value: number | null;    // 손익 또는 R
  win: boolean | null;     // null = 본전(승률 분모에는 포함, 승리 아님)
  /** 보유 시간(청산 − 진입, ms). 모르면 없음 — 보유시간 분해에서 빠진다 */
  holdMs?: number | null;
  /** 방향. 모르면(관망·주식 매수/축소 등) 없음 — 방향 분해에서 빠진다 */
  side?: 'long' | 'short' | null;
  /** 거래소에 손절 주문을 걸어 뒀는지(복구된 손절가 유무). 모르면 없음 — 손절 분해에서 빠진다 */
  hasStop?: boolean | null;
  /** 진입 규모(수량 × 진입가). 모르면 없음 — 규모 분해에서 빠진다 */
  notional?: number | null;
}

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
/** 보유 시간 구간 — 스캘핑(15분 미만)부터 포지션(1주 이상)까지(참고: TraderSync 'Hold Time') */
export const HOLD_BANDS: { to: number; label: string }[] = [
  { to: 15 * MIN, label: '~15분 스캘핑' },
  { to: HOUR, label: '15분~1시간' },
  { to: 4 * HOUR, label: '1~4시간 단타' },
  { to: DAY, label: '4~24시간 데이' },
  { to: 7 * DAY, label: '1~7일 스윙' },
  { to: Infinity, label: '7일+ 포지션' },
];
export const holdBandIndex = (ms: number) => HOLD_BANDS.findIndex((b) => ms < b.to);

function bucket(items: BreakItem[], keyOf: (i: BreakItem) => { key: string; label: string; order: number }, thinAt: number): BreakRow[] {
  const map = new Map<string, BreakRow>();
  for (const it of items) {
    const k = keyOf(it);
    let r = map.get(k.key);
    if (!r) { r = { key: k.key, label: k.label, order: k.order, count: 0, wins: 0, winRate: null, valued: 0, sum: 0, avg: null, thin: true }; map.set(k.key, r); }
    r.count++;
    if (it.win) r.wins++;
    if (it.value != null && Number.isFinite(it.value)) { r.valued++; r.sum += it.value; }
  }
  for (const r of map.values()) {
    r.winRate = r.count ? (r.wins / r.count) * 100 : null;
    r.avg = r.valued ? r.sum / r.valued : null;
    r.thin = r.count < thinAt;
  }
  return [...map.values()];
}

/** 요일별 — 월요일부터 일요일 순. 매매가 없는 요일은 행을 만들지 않는다 */
export function byWeekday(items: BreakItem[], thinAt = THIN_SAMPLE): BreakRow[] {
  return bucket(items, (i) => { const { wd } = kstParts(i.ts); return { key: `wd${wd}`, label: `${WEEKDAYS[wd]}요일`, order: wd === 0 ? 7 : wd }; }, thinAt)
    .sort((a, b) => a.order - b.order);
}

/* ── 요일 × 시간대 교차 히트맵(참고: TraderSync 'Day & Time') ───────────────
 * "어느 요일 어느 시간대에 벌고 잃었나"를 한눈에. value(순손익)가 있는 매매만 합계에 넣는다. */
export interface HeatCell { wd: number; band: number; n: number; net: number; wins: number; winRate: number | null }
export interface Heatmap {
  cells: HeatCell[];     // 매매가 1건 이상인 (요일,시간대) 칸만
  weekdays: number[];    // 등장한 요일(월→일 순)
  bands: number[];       // 등장한 시간대 인덱스(이른 시간부터)
  maxAbsNet: number;     // 색 농도 기준(칸 순손익 절댓값 최대)
  best: HeatCell | null; // 표본 THIN_SAMPLE 이상 중 순손익 최대
  worst: HeatCell | null;// 표본 THIN_SAMPLE 이상 중 순손익 최소
}
const wdOrder = (wd: number) => (wd === 0 ? 7 : wd);
export function weekdayHourHeatmap(items: BreakItem[], thinAt = THIN_SAMPLE): Heatmap {
  const map = new Map<string, BreakItem[]>();
  for (const it of items) {
    const { wd, hour } = kstParts(it.ts);
    const band = HOUR_BANDS.findIndex((b) => hour >= b.from && hour < b.to);
    if (band < 0) continue;
    const k = `${wd}-${band}`;
    const arr = map.get(k); if (arr) arr.push(it); else map.set(k, [it]);
  }
  const cells: HeatCell[] = [];
  for (const [k, list] of map) {
    const [wd, band] = k.split('-').map(Number);
    const valued = list.filter((i) => Number.isFinite(i.value));
    const net = valued.reduce((a, i) => a + (i.value as number), 0);
    const wins = list.filter((i) => i.win === true).length;
    const decided = list.filter((i) => i.win !== null).length;
    cells.push({ wd, band, n: list.length, net, wins, winRate: decided ? (wins / decided) * 100 : null });
  }
  const weekdays = [...new Set(cells.map((c) => c.wd))].sort((a, b) => wdOrder(a) - wdOrder(b));
  const bands = [...new Set(cells.map((c) => c.band))].sort((a, b) => a - b);
  const maxAbsNet = cells.reduce((m, c) => Math.max(m, Math.abs(c.net)), 0);
  const eligible = cells.filter((c) => c.n >= thinAt);
  const best = eligible.length ? eligible.reduce((a, c) => (c.net > a.net ? c : a)) : null;
  const worst = eligible.length ? eligible.reduce((a, c) => (c.net < a.net ? c : a)) : null;
  return { cells, weekdays, bands, maxAbsNet, best, worst };
}

/** 시간대별(KST 4시간 단위) — 이른 시간부터 */
export function byHourBand(items: BreakItem[], thinAt = THIN_SAMPLE): BreakRow[] {
  return bucket(items, (i) => {
    const { hour } = kstParts(i.ts);
    const idx = HOUR_BANDS.findIndex((b) => hour >= b.from && hour < b.to);
    return { key: `h${idx}`, label: HOUR_BANDS[idx].label, order: idx };
  }, thinAt).sort((a, b) => a.order - b.order);
}

/** 보유 시간별 — 짧은 구간부터. 보유 시간을 모르는(또는 0 이하) 매매는 뺀다 */
export function byHoldBand(items: BreakItem[], thinAt = THIN_SAMPLE): BreakRow[] {
  const known = items.filter((i) => i.holdMs != null && i.holdMs > 0);
  return bucket(known, (i) => { const idx = holdBandIndex(i.holdMs!); return { key: `hb${idx}`, label: HOLD_BANDS[idx].label, order: idx }; }, thinAt)
    .sort((a, b) => a.order - b.order);
}

/** 방향별(롱·숏) — 롱 먼저. 방향을 모르는 매매는 뺀다(참고: TraderSync 'Long vs Short') */
export function bySide(items: BreakItem[], thinAt = THIN_SAMPLE): BreakRow[] {
  const known = items.filter((i) => i.side === 'long' || i.side === 'short');
  return bucket(known, (i) => (i.side === 'long' ? { key: 'long', label: '롱', order: 0 } : { key: 'short', label: '숏', order: 1 }), thinAt)
    .sort((a, b) => a.order - b.order);
}

/** 손절 주문 유무별 — 걸어 둔 매매 먼저. 모르는 매매는 뺀다(참고: Edgewonk) */
export function byStopPresence(items: BreakItem[], thinAt = THIN_SAMPLE): BreakRow[] {
  const known = items.filter((i) => i.hasStop === true || i.hasStop === false);
  return bucket(known, (i) => (i.hasStop
    ? { key: 'stop', label: '손절 걸어둠', order: 0 }
    : { key: 'nostop', label: '손절 없이', order: 1 }), thinAt)
    .sort((a, b) => a.order - b.order);
}

/** 진입 규모 분위수(작은 25% ~ 큰 25%)별 — 계좌 규모와 무관하게 '내 매매 중 크게 건 쪽'을 본다(참고: TraderSync) */
export function byNotionalQuartile(items: BreakItem[], thinAt = THIN_SAMPLE): BreakRow[] {
  const vals = items.map((i) => i.notional).filter((x): x is number => x != null && x > 0).sort((a, b) => a - b);
  if (vals.length < 4) return [];                      // 분위수로 나눌 만큼 안 모임
  const q = (f: number) => vals[Math.min(vals.length - 1, Math.floor(vals.length * f))];
  const q1 = q(0.25), q2 = q(0.5), q3 = q(0.75);
  const band = (n: number) => (n < q1 ? 0 : n < q2 ? 1 : n < q3 ? 2 : 3);
  const money = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));
  const edges = [`~${money(q1)}`, `${money(q1)}~${money(q2)}`, `${money(q2)}~${money(q3)}`, `${money(q3)}~`];
  const names = ['작은(하위25%)', '중하', '중상', '큰(상위25%)'];
  return bucket(items.filter((i) => i.notional != null && i.notional > 0), (i) => {
    const b = band(i.notional!);
    return { key: `nq${b}`, label: `${names[b]} ${edges[b]}`, order: b };
  }, thinAt).sort((a, b) => a.order - b.order);
}

/** 종목별 — 건수 많은 순, 같으면 합계 큰 순 */
export function bySymbol(items: BreakItem[], thinAt = THIN_SAMPLE): BreakRow[] {
  return bucket(items, (i) => ({ key: i.symbol, label: i.label || i.symbol, order: 0 }), thinAt)
    .sort((a, b) => b.count - a.count || b.sum - a.sum);
}
