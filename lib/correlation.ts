/**
 * 보유·관심 자산 상관관계(참고: Finviz Elite·Koyfin correlation, Portfolio Visualizer) — 일간 수익률 피어슨 상관.
 * 거래일이 다른 자산(코인 주말 거래 · 한국/미국 휴장)은 **두 자산 모두 종가가 있는 날짜만** 골라 그 사이 수익률끼리 비교한다
 *   → 코인 주말 움직임은 다음 공통 거래일 수익률에 합쳐져 들어간다(빠지지 않음).
 * 같은 날짜 종가 기준이라 장 마감 시각이 다른 한국·미국 사이 상관은 실제보다 낮게 나올 수 있다(화면 문구로 고지).
 * 공통 거래일이 MIN_N 미만이면 null — 숫자를 만들지 않는다.
 */
export interface Series { id: string; closes: Map<string, number> } // 'YYYY-MM-DD' → 종가
export const MIN_N = 20;

/** 두 시계열의 공통 날짜 수익률 상관 · n = 수익률 개수 */
export function pairCorr(a: Map<string, number>, b: Map<string, number>): { r: number | null; n: number } {
  const dates = [...a.keys()].filter((d) => b.has(d)).sort();
  const ra: number[] = [], rb: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const a0 = a.get(dates[i - 1])!, a1 = a.get(dates[i])!, b0 = b.get(dates[i - 1])!, b1 = b.get(dates[i])!;
    if (a0 <= 0 || b0 <= 0) continue;
    ra.push(a1 / a0 - 1); rb.push(b1 / b0 - 1);
  }
  const n = ra.length;
  if (n < MIN_N) return { r: null, n };
  const ma = ra.reduce((s, v) => s + v, 0) / n, mb = rb.reduce((s, v) => s + v, 0) / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { const x = ra[i] - ma, y = rb[i] - mb; cov += x * y; va += x * x; vb += y * y; }
  if (va === 0 || vb === 0) return { r: null, n };
  return { r: Math.round((cov / Math.sqrt(va * vb)) * 100) / 100, n };
}

export interface CorrMatrix { ids: string[]; r: (number | null)[][]; n: number[][] }

export function corrMatrix(series: Series[]): CorrMatrix {
  const k = series.length;
  const r: (number | null)[][] = Array.from({ length: k }, () => Array(k).fill(null));
  const n: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  for (let i = 0; i < k; i++) {
    r[i][i] = 1; n[i][i] = Math.max(0, series[i].closes.size - 1);
    for (let j = i + 1; j < k; j++) {
      const c = pairCorr(series[i].closes, series[j].closes);
      r[i][j] = r[j][i] = c.r; n[i][j] = n[j][i] = c.n;
    }
  }
  return { ids: series.map((s) => s.id), r, n };
}

/** 같이 움직이는 쌍(|r| ≥ 기준) — 강한 순. 분산 효과가 작은(=사실상 같은 베팅) 조합을 찾는 용도 */
export function strongPairs(m: CorrMatrix, min = 0.7): { a: string; b: string; r: number }[] {
  const out: { a: string; b: string; r: number }[] = [];
  for (let i = 0; i < m.ids.length; i++) for (let j = i + 1; j < m.ids.length; j++) {
    const v = m.r[i][j];
    if (v != null && Math.abs(v) >= min) out.push({ a: m.ids[i], b: m.ids[j], r: v });
  }
  return out.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
}

/** 평균 쌍 상관(대각 제외, null 제외) — 1에 가까울수록 '한 덩어리'로 움직이는 묶음 */
export function avgCorr(m: CorrMatrix, idx?: number[]): number | null {
  const use = idx ?? m.ids.map((_, i) => i);
  const xs: number[] = [];
  for (let a = 0; a < use.length; a++) for (let b = a + 1; b < use.length; b++) { const v = m.r[use[a]][use[b]]; if (v != null) xs.push(v); }
  return xs.length ? Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 100) / 100 : null;
}

/** 상관 → 말(화면용) */
export function corrLabel(r: number | null): string {
  if (r == null) return '자료 부족';
  const a = Math.abs(r);
  const dir = r >= 0 ? '같은 방향' : '반대 방향';
  if (a >= 0.7) return `강하게 ${dir}`;
  if (a >= 0.4) return `어느 정도 ${dir}`;
  if (a >= 0.2) return `약하게 ${dir}`;
  return '거의 무관';
}
