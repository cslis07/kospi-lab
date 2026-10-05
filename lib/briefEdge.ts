/**
 * 모닝 브리핑 "과거 통계" — 거시 요인이 크게 움직인 다음 날, 각 시장이 실제로 어땠나를 **측정**한다.
 *
 * 이 앱의 원칙: 예측 확률은 지어내지 않는다. 숫자는 과거 실측이고, 대조군(평소 상승 비율)과 함께 보여 준다.
 * 판정 기준은 사전에 고정(튜닝 금지):
 *   - 요인 변화의 상위 20% 날 = '급등', 하위 20% 날 = '급락'
 *   - 표본 30건 이상 + |z| ≥ 2.58(약 1% 수준 — 요인×방향×시장 24개를 한꺼번에 보므로 5%보다 엄격하게)
 *     + 기간을 반으로 나눠도 같은 방향 → '유의', 아니면 '우연 범위'
 * '유의'여도 과거 3년의 경향일 뿐 다음 날을 보장하지 않는다.
 *
 * 시점 정렬(미래 정보 누설 방지): 요인은 미국 거래일 t 의 종가 변화, 결과는 t **다음** 거래일의 수익률.
 *   한국 증시는 미국 장 마감 뒤에 열리고, BTC 일봉(UTC)은 미국 마감 약 4시간 뒤 시작한다.
 * 순수 함수(changes·nextReturns·edgeRows·bucketOf)는 tests/brief.test.ts 로 고정.
 */
import { indexDaily } from '@/lib/naverIndex';
import type { BriefMarket } from '@/lib/brief';

export interface Obs { date: string; value: number; open?: number }   // 날짜 오름차순. open = 시가(있으면 장중 수익률도 잰다)
export interface Change { date: string; ch: number }

export interface FactorDef { key: string; label: string; series: string; mode: 'diff' | 'pct'; unit: string }
export const FACTORS: FactorDef[] = [
  { key: 'us10y', label: '美 10년물 금리', series: 'DGS10', mode: 'diff', unit: '%p' },
  { key: 'vix', label: 'VIX', series: 'VIXCLS', mode: 'pct', unit: '%' },
  { key: 'wti', label: 'WTI 유가', series: 'DCOILWTICO', mode: 'pct', unit: '%' },
  { key: 'nasdaq', label: '나스닥 종합', series: 'NASDAQCOM', mode: 'pct', unit: '%' },
];
export const TARGET: Record<BriefMarket, { label: string; series: string | null }> = {
  coin: { label: '비트코인', series: 'CBBTCUSD' },
  us: { label: 'S&P 500', series: 'SP500' },
  kr: { label: '코스피', series: null }, // 네이버 일봉
};

export const MIN_N = 30;
export const Z_CUT = 2.58;

/** 일간 변화 — diff: 값 차이(금리 %p), pct: 변화율 % */
export function changes(obs: Obs[], mode: 'diff' | 'pct'): Change[] {
  const out: Change[] = [];
  for (let i = 1; i < obs.length; i++) {
    const a = obs[i - 1].value, b = obs[i].value;
    if (!Number.isFinite(a) || !Number.isFinite(b) || (mode === 'pct' && a === 0)) continue;
    out.push({ date: obs[i].date, ch: mode === 'diff' ? b - a : (b / a - 1) * 100 });
  }
  return out;
}

/** 분위수(선형 보간) */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * 요인 날짜 t 마다 "t 보다 뒤인 첫 결과 거래일"의 수익률(%)을 붙인다.
 * 그 결과일의 수익률 = 결과일 종가 ÷ 직전 결과 거래일 종가 − 1.
 */
export interface Pair { date: string; ch: number; ret: number; intra?: number }
export function nextReturns(factor: Change[], target: Obs[]): Pair[] {
  const out: Pair[] = [];
  let j = 1;
  for (const f of factor) {
    while (j < target.length && target[j].date <= f.date) j++;
    if (j >= target.length) break;
    const prev = target[j - 1].value, cur = target[j].value;
    if (prev > 0 && Number.isFinite(cur)) {
      const open = target[j].open;
      // 장중 수익률(시가→종가) — 시가 갭은 이미 반영된 몫이라, '보고 나서 시가에 들어가도 남는가'를 따로 본다
      out.push({ date: f.date, ch: f.ch, ret: (cur / prev - 1) * 100, intra: open && open > 0 ? (cur / open - 1) * 100 : undefined });
    }
  }
  return out;
}

export type Bucket = 'surge' | 'drop' | 'normal';
export interface EdgeRow {
  factor: string;         // FactorDef.key
  label: string;
  bucket: 'surge' | 'drop';
  threshold: number;      // 급등/급락 경계(요인 변화)
  unit: string;
  n: number;
  upRate: number;         // 이런 날 다음 거래일 상승 비율 %
  baseRate: number;       // 평소 상승 비율 %(대조군)
  diff: number;           // upRate − baseRate (%p)
  z: number;
  meanRet: number;        // 이런 날 다음 거래일 평균 수익률 %
  baseMean: number;
  /** 기간 전반·후반 모두 같은 방향인가 */
  consistent: boolean;
  /** 시가→종가(장중) 기준 — 시가 데이터가 있는 시장만. 갭을 뺀 뒤에도 차이가 남는지 */
  intra?: { upRate: number; baseRate: number; diff: number; z: number; verdict: 'significant' | 'noise' };
  verdict: 'significant' | 'noise' | 'thin';   // thin = 표본 부족
}

const upShare = (rs: { ret: number }[]) => (rs.length ? (rs.filter((r) => r.ret > 0).length / rs.length) * 100 : NaN);
const mean = (rs: { ret: number }[]) => (rs.length ? rs.reduce((a, r) => a + r.ret, 0) / rs.length : NaN);

/** 한 요인의 급등·급락 두 줄 통계 */
export function edgeRows(def: Pick<FactorDef, 'key' | 'label' | 'unit'>, pairs: Pair[]): EdgeRow[] {
  if (pairs.length < 50) return [];
  const sorted = pairs.map((p) => p.ch).sort((a, b) => a - b);
  const hi = quantile(sorted, 0.8), lo = quantile(sorted, 0.2);
  const baseRate = upShare(pairs), baseMean = mean(pairs);
  const half = Math.floor(pairs.length / 2);
  const first = pairs.slice(0, half), second = pairs.slice(half);
  const row = (bucket: 'surge' | 'drop'): EdgeRow => {
    const pick = (list: typeof pairs) => list.filter((p) => (bucket === 'surge' ? p.ch >= hi : p.ch <= lo));
    const ev = pick(pairs);
    const upRate = upShare(ev);
    const p0 = baseRate / 100;
    const z = ev.length && p0 > 0 && p0 < 1 ? (upRate / 100 - p0) / Math.sqrt((p0 * (1 - p0)) / ev.length) : 0;
    const d1 = upShare(pick(first)) - upShare(first), d2 = upShare(pick(second)) - upShare(second);
    const consistent = Number.isFinite(d1) && Number.isFinite(d2) && Math.sign(d1) === Math.sign(d2) && d1 !== 0;
    const verdict: EdgeRow['verdict'] = ev.length < MIN_N ? 'thin' : Math.abs(z) >= Z_CUT && consistent ? 'significant' : 'noise';
    let intra: EdgeRow['intra'];
    const withIntra = pairs.filter((p) => p.intra != null);
    if (withIntra.length >= 50) {
      const up = (l: Pair[]) => (l.length ? (l.filter((p) => (p.intra as number) > 0).length / l.length) * 100 : NaN);
      const evI = ev.filter((p) => p.intra != null);
      const b = up(withIntra), u = up(evI), q0 = b / 100;
      const zi = evI.length && q0 > 0 && q0 < 1 ? (u / 100 - q0) / Math.sqrt((q0 * (1 - q0)) / evI.length) : 0;
      intra = { upRate: u, baseRate: b, diff: u - b, z: zi, verdict: evI.length >= MIN_N && Math.abs(zi) >= Z_CUT ? 'significant' : 'noise' };
    }
    return {
      factor: def.key, label: def.label, bucket, threshold: bucket === 'surge' ? hi : lo, unit: def.unit,
      n: ev.length, upRate, baseRate, diff: upRate - baseRate, z, meanRet: mean(ev), baseMean, consistent, verdict, intra,
    };
  };
  return [row('surge'), row('drop')];
}

/** 최근 변화가 급등/급락 구간에 드는가 */
export function bucketOf(ch: number | null | undefined, rows: EdgeRow[]): Bucket {
  if (ch == null || !Number.isFinite(ch)) return 'normal';
  const s = rows.find((r) => r.bucket === 'surge'), d = rows.find((r) => r.bucket === 'drop');
  if (s && ch >= s.threshold) return 'surge';
  if (d && ch <= d.threshold) return 'drop';
  return 'normal';
}

/* ── 데이터 로더(네트워크) ───────────────────────────── */
async function fredSeries(id: string, limit = 800): Promise<Obs[]> {
  const key = process.env.FRED_API_KEY;
  if (!key) return [];
  const res = await fetch(
    `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&sort_order=desc&limit=${limit}`,
    { next: { revalidate: 21600 }, signal: AbortSignal.timeout(9000) },
  );
  if (!res.ok) return [];
  const j = await res.json();
  return ((j?.observations ?? []) as { date: string; value: string }[])
    .filter((o) => o.value !== '.')
    .map((o) => ({ date: o.date, value: Number(o.value) }))
    .filter((o) => Number.isFinite(o.value))
    .reverse();
}

export interface EdgeReport {
  market: BriefMarket;
  target: string;
  from: string | null;
  to: string | null;
  days: number;             // 대조군 표본(일)
  baseRate: number | null;  // 평소 상승 비율 %
  rows: EdgeRow[];
  /** 요인별 최근 확정 변화와 구간(급등/급락/평소) */
  latest: { factor: string; date: string; ch: number; bucket: Bucket }[];
  note?: string;
}

export async function buildEdgeReport(market: BriefMarket): Promise<EdgeReport> {
  const t = TARGET[market];
  const [target, ...factorObs] = await Promise.all([
    t.series ? fredSeries(t.series) : indexDaily('domestic', 'KOSPI', 1150).then((rows) => rows.map((r) => ({ date: r.d, value: r.c, open: r.o }))),
    ...FACTORS.map((f) => fredSeries(f.series)),
  ]);
  const rows: EdgeRow[] = [];
  const latest: EdgeReport['latest'] = [];
  let from: string | null = null, to: string | null = null, days = 0, baseRate: number | null = null;
  FACTORS.forEach((f, i) => {
    const ch = changes(factorObs[i] ?? [], f.mode);
    const pairs = nextReturns(ch, target);
    const r = edgeRows(f, pairs);
    rows.push(...r);
    if (pairs.length > days) { days = pairs.length; from = pairs[0].date; to = pairs[pairs.length - 1].date; baseRate = r[0]?.baseRate ?? null; }
    const last = ch[ch.length - 1];
    if (last && r.length) latest.push({ factor: f.key, date: last.date, ch: last.ch, bucket: bucketOf(last.ch, r) });
  });
  return {
    market, target: t.label, from, to, days, baseRate, rows, latest,
    note: rows.length ? undefined : '과거 데이터를 불러오지 못했습니다(FRED 키·네트워크 확인).',
  };
}
