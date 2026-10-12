/**
 * 지표 서프라이즈(결과−예측) → 다음 거래일 시장 반응 — 순수 계산.
 * "예측을 얼마나 벗어났나(서프라이즈)"로 발표를 나누고, 그때 자산의 하루 변동률을 모은다.
 * 방향 예측이 아니라 '과거 경향' 측정 — 표본이 적으면 우연이고, 상관이지 인과가 아니다(앱 원칙).
 *
 * 반응일 오프셋: 美 지표는 한국시간 밤(美 개장 전) 발표라 그날 美장·BTC에 반영(offset 0),
 * 코스피는 이미 마감이라 다음 거래일에 반영(offset 1).
 */

export interface ReleaseLite { date: string; actual: string | null; forecast: string | null }
export interface PricePoint { date: string; close: number }
export interface ReactionStat { n: number; avgPct: number; medianPct: number; posRate: number }
export interface ReactionResult { up: ReactionStat; down: ReactionStat; flat: ReactionStat; control: ReactionStat }

export function toNum(s: string | null | undefined): number | null {
  if (s == null) return null;
  const v = parseFloat(String(s).replace(/,/g, '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(v) ? v : null;
}

function stat(returns: number[]): ReactionStat {
  const n = returns.length;
  if (n === 0) return { n: 0, avgPct: 0, medianPct: 0, posRate: 0 };
  const avg = returns.reduce((a, b) => a + b, 0) / n;
  const sorted = [...returns].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const median = n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const pos = returns.filter((r) => r > 0).length;
  return { n, avgPct: avg, medianPct: median, posRate: (pos / n) * 100 };
}

/**
 * @param releases 발표 내역(결과·예측 문자열)
 * @param series   자산 일별 종가(정렬 무관)
 * @param offset   반응 세션 오프셋(0=발표일 당일, 1=다음 거래일)
 */
export function computeReaction(releases: ReleaseLite[], series: PricePoint[], offset = 0): ReactionResult {
  const asc = [...series].filter((p) => Number.isFinite(p.close)).sort((a, b) => a.date.localeCompare(b.date));
  const dates = asc.map((p) => p.date);
  const closes = asc.map((p) => p.close);
  const n = dates.length;

  // 대조군: 전체 기간의 하루 변동률
  const ctrl: number[] = [];
  for (let i = 1; i < n; i++) ctrl.push(((closes[i] - closes[i - 1]) / closes[i - 1]) * 100);

  // date <= D 인 마지막 인덱스(이분탐색)
  const lastIdxLE = (d: string) => {
    let lo = 0, hi = n - 1, res = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (dates[m] <= d) { res = m; lo = m + 1; } else hi = m - 1; }
    return res;
  };

  const up: number[] = [], down: number[] = [], flat: number[] = [];
  for (const r of releases) {
    const a = toNum(r.actual), f = toNum(r.forecast);
    if (a == null || f == null) continue;      // 결과·예측 둘 다 있어야 서프라이즈 계산
    const t0 = lastIdxLE(r.date);
    if (t0 < 0) continue;
    const t = t0 + offset;
    if (t < 1 || t >= n) continue;
    const ret = ((closes[t] - closes[t - 1]) / closes[t - 1]) * 100;
    const s = a - f;
    if (s > 0) up.push(ret); else if (s < 0) down.push(ret); else flat.push(ret);
  }
  return { up: stat(up), down: stat(down), flat: stat(flat), control: stat(ctrl) };
}
