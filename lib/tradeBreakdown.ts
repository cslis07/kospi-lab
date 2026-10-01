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
}

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

/** 시간대별(KST 4시간 단위) — 이른 시간부터 */
export function byHourBand(items: BreakItem[], thinAt = THIN_SAMPLE): BreakRow[] {
  return bucket(items, (i) => {
    const { hour } = kstParts(i.ts);
    const idx = HOUR_BANDS.findIndex((b) => hour >= b.from && hour < b.to);
    return { key: `h${idx}`, label: HOUR_BANDS[idx].label, order: idx };
  }, thinAt).sort((a, b) => a.order - b.order);
}

/** 종목별 — 건수 많은 순, 같으면 합계 큰 순 */
export function bySymbol(items: BreakItem[], thinAt = THIN_SAMPLE): BreakRow[] {
  return bucket(items, (i) => ({ key: i.symbol, label: i.label || i.symbol, order: 0 }), thinAt)
    .sort((a, b) => b.count - a.count || b.sum - a.sum);
}
