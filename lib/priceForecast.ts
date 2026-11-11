/**
 * CPI·PPI '우리 예상치' — 순수 계산(테스트 고정). 데이터 수집·AI 호출은 lib/priceForecastData.
 *
 * 방식(2026-11-11 사용자 결정): **수치 모델 + AI 기사 보정**.
 *  1) 수치 모델 = 전월비(계절조정)를 선행 지표로 회귀(OLS). 휘발유·경유·유가·천연가스·달러·임금·기대인플레와
 *     최근 근원 물가 흐름. 발표 전에 이미 나와 있는 값만 쓴다(대상 월의 에너지·달러는 일별·주별이라 월중에도 계산 가능).
 *  2) AI 보정 = 관련 기사 제목을 읽고 ±AI_ADJ_MAX %p 안에서만 조정(이유 기록). 모델 값과 따로 보여 준다.
 *
 * 정직한 한계: 과거 검증(backtest)은 **지금의 수정된 지표**로 그 달을 다시 계산한 것(당시 속보치 아님).
 * 근원 지표는 직전 평균(나이브)보다 조금 나은 정도다. 매매 신호가 아니다.
 */

export interface Pt { date: string; value: number }
export type SeriesMap = Record<string, Pt[]>;
export type TargetKey = 'cpi' | 'coreCpi' | 'ppi' | 'corePpi';

/** FRED 계열 — 월간 지수(계절조정·비조정)와 일별·주별 선행 지표 */
export const FRED_IDS = {
  cpi: 'CPIAUCSL', coreCpi: 'CPILFESL', cpiNsa: 'CPIAUCNS', foodCpi: 'CUSR0000SAF11',
  ppi: 'PPIFIS', corePpi: 'PPIFES', ppiNsa: 'PPIFID',
  gas: 'GASREGW', diesel: 'GASDESW', wti: 'DCOILWTICO', natgas: 'DHHNGSP', usd: 'DTWEXBGS',
  bei: 'T5YIE', wage: 'CES0500000003',
} as const;
export const ALL_FRED = Object.values(FRED_IDS);
/** 일별·주별 계열(대상 월이 진행 중이면 월초~오늘 평균) */
const HIGH_FREQ = new Set<string>([FRED_IDS.gas, FRED_IDS.diesel, FRED_IDS.wti, FRED_IDS.natgas, FRED_IDS.usd, FRED_IDS.bei]);

export const AI_ADJ_MAX = 0.1;   // AI 기사 보정 한도(전월비 %p)
const BT_START = '2017-01';      // 과거 검증 시작 월
const MIN_TRAIN = 48;

export function shiftYm(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** 계열 → 월 평균(월간 계열은 그 값 그대로) + 마지막 관측 */
interface Monthly { m: Map<string, number>; last: Pt | null; lastYm: string | null }
function toMonthly(pts: Pt[] | undefined): Monthly {
  const acc = new Map<string, { s: number; n: number }>();
  for (const p of pts ?? []) {
    if (!Number.isFinite(p.value)) continue;
    const k = p.date.slice(0, 7), a = acc.get(k) ?? { s: 0, n: 0 };
    a.s += p.value; a.n += 1; acc.set(k, a);
  }
  const m = new Map<string, number>();
  for (const [k, a] of acc) m.set(k, a.s / a.n);
  const last = pts?.length ? pts[pts.length - 1] : null;
  return { m, last, lastYm: last ? last.date.slice(0, 7) : null };
}

class Data {
  private mo = new Map<string, Monthly>();
  constructor(private s: SeriesMap) {}
  mon(id: string): Monthly {
    let x = this.mo.get(id);
    if (!x) { x = toMonthly(this.s[id]); this.mo.set(id, x); }
    return x;
  }
  /** 월 수준값 — 그 달 관측이 아직 없고 마지막 관측보다 뒤의 달이면 마지막 관측값을 임시로 쓴다(월초) */
  level(id: string, ym: string): number | null {
    const x = this.mon(id), v = x.m.get(ym);
    if (v != null) return v;
    if (HIGH_FREQ.has(id) && x.last && x.lastYm && ym > x.lastYm && shiftYm(x.lastYm, 1) === ym) return x.last.value;
    return null;
  }
  /** 전월비 % — 한 달이 비면(2025-10 셧다운 미발표 등) 2개월 변화를 월 속도로 환산 */
  mom(id: string, ym: string): number | null {
    const a = this.level(id, ym), b = this.level(id, shiftYm(ym, -1));
    if (a != null && b != null && b !== 0) return (a / b - 1) * 100;
    const b2 = this.level(id, shiftYm(ym, -2));
    if (a != null && b2 != null && b2 > 0) return (Math.sqrt(a / b2) - 1) * 100;
    const a1 = this.level(id, shiftYm(ym, 1));
    if (a == null && a1 != null && b != null && b > 0) return (Math.sqrt(a1 / b) - 1) * 100;
    return null;
  }
  /** 실제 발표된 전월비(양쪽 달이 다 있을 때만) */
  actualMom(id: string, ym: string): number | null {
    const x = this.mon(id), a = x.m.get(ym), b = x.m.get(shiftYm(ym, -1));
    return a != null && b != null && b !== 0 ? (a / b - 1) * 100 : null;
  }
  chg(id: string, ym: string, n: number): number | null {
    const a = this.level(id, ym), b = this.level(id, shiftYm(ym, -n));
    return a != null && b != null && b !== 0 ? (a / b - 1) * 100 : null;
  }
  /** 직전 n개월 전월비 평균(대상 월 제외) */
  avgMom(id: string, ym: string, n: number): number | null {
    let s = 0;
    for (let k = 1; k <= n; k++) { const v = this.mom(id, shiftYm(ym, -k)); if (v == null) return null; s += v; }
    return s / n;
  }
  yoy(id: string, ym: string): number | null {
    const x = this.mon(id), a = x.m.get(ym), b = x.m.get(shiftYm(ym, -12));
    return a != null && b != null && b !== 0 ? (a / b - 1) * 100 : null;
  }
}

interface Feat { key: string; label: string; unit: '%' | '%p'; f: (d: Data, ym: string) => number | null }
const F = FRED_IDS;
const feat = (key: string, label: string, f: Feat['f'], unit: Feat['unit'] = '%'): Feat => ({ key, label, unit, f });

interface TargetCfg { key: TargetKey; label: string; group: 'cpi' | 'ppi'; id: string; nsa?: string; feats: Feat[] }
export const TARGETS: TargetCfg[] = [
  {
    key: 'cpi', label: 'CPI (헤드라인)', group: 'cpi', id: F.cpi, nsa: F.cpiNsa,
    feats: [
      feat('gas', '휘발유 소매가', (d, ym) => d.mom(F.gas, ym)),
      feat('natgas', '천연가스 현물', (d, ym) => d.mom(F.natgas, ym)),
      feat('core3', '근원 CPI 최근 3개월 흐름', (d, ym) => d.avgMom(F.coreCpi, ym, 3)),
      feat('core12', '근원 CPI 최근 12개월 흐름', (d, ym) => d.avgMom(F.coreCpi, ym, 12)),
      feat('food3', '식료품 물가 최근 3개월 흐름', (d, ym) => d.avgMom(F.foodCpi, ym, 3)),
    ],
  },
  {
    key: 'coreCpi', label: '근원 CPI', group: 'cpi', id: F.coreCpi,
    feats: [
      feat('core3', '근원 CPI 최근 3개월 흐름', (d, ym) => d.avgMom(F.coreCpi, ym, 3)),
      feat('core12', '근원 CPI 최근 12개월 흐름', (d, ym) => d.avgMom(F.coreCpi, ym, 12)),
      feat('usd6', '달러 지수 6개월 변화', (d, ym) => d.chg(F.usd, shiftYm(ym, -1), 6)),
      feat('wage3', '시간당 임금 최근 3개월 흐름', (d, ym) => d.avgMom(F.wage, ym, 3)),
      feat('bei', '5년 기대인플레(BEI)', (d, ym) => d.level(F.bei, ym), '%p'),
    ],
  },
  {
    key: 'ppi', label: 'PPI (최종수요)', group: 'ppi', id: F.ppi, nsa: F.ppiNsa,
    feats: [
      feat('gas', '휘발유 소매가', (d, ym) => d.mom(F.gas, ym)),
      feat('diesel', '경유 소매가', (d, ym) => d.mom(F.diesel, ym)),
      feat('wti', 'WTI 유가', (d, ym) => d.mom(F.wti, ym)),
      feat('natgas', '천연가스 현물', (d, ym) => d.mom(F.natgas, ym)),
      feat('usd', '달러 지수', (d, ym) => d.mom(F.usd, ym)),
      feat('cppi3', '근원 PPI 최근 3개월 흐름', (d, ym) => d.avgMom(F.corePpi, ym, 3)),
      feat('cppi12', '근원 PPI 최근 12개월 흐름', (d, ym) => d.avgMom(F.corePpi, ym, 12)),
    ],
  },
  {
    key: 'corePpi', label: '근원 PPI', group: 'ppi', id: F.corePpi,
    feats: [
      feat('cppi3', '근원 PPI 최근 3개월 흐름', (d, ym) => d.avgMom(F.corePpi, ym, 3)),
      feat('cppi12', '근원 PPI 최근 12개월 흐름', (d, ym) => d.avgMom(F.corePpi, ym, 12)),
      feat('usd6', '달러 지수 6개월 변화', (d, ym) => d.chg(F.usd, shiftYm(ym, -1), 6)),
      feat('wti3', 'WTI 유가 3개월 변화', (d, ym) => d.chg(F.wti, ym, 3)),
    ],
  },
];

/** 최소제곱(절편 포함) — 정규방정식을 부분 피벗 가우스 소거로. 풀 수 없으면 null */
export function ols(X: number[][], y: number[]): number[] | null {
  const n = X.length, k = (X[0]?.length ?? 0) + 1;
  if (n < k + 2) return null;
  const A = Array.from({ length: k }, () => new Array<number>(k + 1).fill(0));
  for (let i = 0; i < n; i++) {
    const row = [1, ...X[i]];
    for (let a = 0; a < k; a++) {
      for (let b = 0; b < k; b++) A[a][b] += row[a] * row[b];
      A[a][k] += row[a] * y[i];
    }
  }
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      if (f !== 0) for (let j = c; j <= k; j++) A[r][j] -= f * A[c][j];
    }
  }
  return A.map((r, i) => r[k] / r[i]);
}
const predict = (b: number[], x: number[]) => x.reduce((s, v, i) => s + b[i + 1] * v, b[0]);

export interface Driver { key: string; label: string; x: number; unit: '%' | '%p'; contrib: number }
export interface Backtest { n: number; from: string | null; maeModel: number | null; maeNaive: number | null; within01: number | null }
export interface TargetForecast {
  key: TargetKey; label: string; group: 'cpi' | 'ppi';
  /** 예상 대상 월(YYYY-MM) — 마지막 발표 월의 다음 달 */
  month: string;
  mom: number | null; yoy: number | null;
  /** 직전 발표(전월비·전년비) */
  prevMonth: string | null; prevMom: number | null; prevYoy: number | null;
  /** 평소 수준(학습 기간 평균) + 요인별 기여 = mom */
  base: number | null; drivers: Driver[];
  /** 대상 월이 아직 진행 중(에너지·달러는 월초~asOf 평균) */
  partial: boolean; asOf: string | null;
  backtest: Backtest;
  /** 그 달 발표 전 정보만으로 계산한 과거 예상(검증용) — 최근 24개월 */
  past: { month: string; model: number; actual: number }[];
}

interface Row { ym: string; y: number; x: number[] }

function buildTarget(d: Data, cfg: TargetCfg, today: string): TargetForecast {
  const tm = d.mon(cfg.id);
  const months = [...tm.m.keys()].sort();
  const lastYm = months.at(-1) ?? null;
  const month = lastYm ? shiftYm(lastYm, 1) : today.slice(0, 7);

  const rows: Row[] = [];
  for (const ym of months) {
    const y = d.actualMom(cfg.id, ym);
    if (y == null) continue;
    const x = cfg.feats.map((f) => f.f(d, ym));
    if (x.some((v) => v == null || !Number.isFinite(v))) continue;
    rows.push({ ym, y, x: x as number[] });
  }

  // 과거 검증 — 그 달 직전까지의 자료로만 학습(확장 창)
  const past: TargetForecast['past'] = [];
  let aeM = 0, aeN = 0, nN = 0, hit = 0;
  rows.forEach((r, i) => {
    if (r.ym < BT_START || i < MIN_TRAIN) return;
    const b = ols(rows.slice(0, i).map((t) => t.x), rows.slice(0, i).map((t) => t.y));
    if (!b) return;
    const p = predict(b, r.x);
    past.push({ month: r.ym, model: p, actual: r.y });
    aeM += Math.abs(p - r.y);
    if (Math.abs(Math.round(p * 10) - Math.round(r.y * 10)) <= 1) hit++;
    const nv = d.avgMom(cfg.id, r.ym, 3);
    if (nv != null) { aeN += Math.abs(nv - r.y); nN++; }
  });
  const backtest: Backtest = {
    n: past.length, from: past[0]?.month ?? null,
    maeModel: past.length ? aeM / past.length : null, maeNaive: nN ? aeN / nN : null,
    within01: past.length ? hit / past.length : null,
  };

  // 이번 예상
  const xNow = cfg.feats.map((f) => f.f(d, month));
  const b = rows.length >= MIN_TRAIN ? ols(rows.map((t) => t.x), rows.map((t) => t.y)) : null;
  let mom: number | null = null, base: number | null = null;
  let drivers: Driver[] = [];
  if (b && xNow.every((v) => v != null && Number.isFinite(v))) {
    const x = xNow as number[];
    mom = predict(b, x);
    const mean = cfg.feats.map((_, j) => rows.reduce((s, r) => s + r.x[j], 0) / rows.length);
    base = rows.reduce((s, r) => s + r.y, 0) / rows.length;
    drivers = cfg.feats.map((f, j) => ({ key: f.key, label: f.label, x: x[j], unit: f.unit, contrib: b[j + 1] * (x[j] - mean[j]) }))
      .sort((p, q) => Math.abs(q.contrib) - Math.abs(p.contrib));
  }

  // 전년비 — 계절조정 지수로 이어 붙이고, 비조정(공식 헤드라인 기준)과의 직전 차이를 더한다
  let yoy: number | null = null;
  const prevYoy = lastYm ? d.yoy(cfg.nsa ?? cfg.id, lastYm) : null;
  if (mom != null && lastYm) {
    const cur = tm.m.get(lastYm), ago = tm.m.get(shiftYm(month, -12));
    if (cur != null && ago != null && ago !== 0) {
      const sa = (cur * (1 + mom / 100) / ago - 1) * 100;
      const saPrev = d.yoy(cfg.id, lastYm);
      yoy = sa + (cfg.nsa && prevYoy != null && saPrev != null ? prevYoy - saPrev : 0);
    }
  }

  // 대상 월 진행 여부·입력 기준일(일별·주별 계열 중 가장 늦은 관측)
  const hf = [F.gas, F.diesel, F.wti, F.natgas, F.usd, F.bei].map((id) => d.mon(id).last?.date).filter((x): x is string => !!x).sort();
  return {
    key: cfg.key, label: cfg.label, group: cfg.group, month, mom, yoy,
    prevMonth: lastYm, prevMom: lastYm ? d.actualMom(cfg.id, lastYm) : null, prevYoy,
    base, drivers, partial: month >= today.slice(0, 7), asOf: hf.at(-1) ?? null,
    backtest, past: past.slice(-24),
  };
}

/** 네 지표(CPI·근원 CPI·PPI·근원 PPI) 수치 모델 예상. today = 'YYYY-MM-DD'(KST) */
export function buildForecasts(series: SeriesMap, today: string): TargetForecast[] {
  const d = new Data(series);
  return TARGETS.map((cfg) => buildTarget(d, cfg, today));
}

/* ── 시장 예상치(경제 캘린더) ─────────────────────────────── */
export interface CalEvent { date: string; country: string; event: string; actual: number | null; estimate: number | null; previous: number | null }
export interface ConsLine { estimate: number | null; previous: number | null; actual: number | null }
export interface Consensus { releaseAt: string | null; mom: ConsLine | null; yoy: ConsLine | null }

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EVENT_NAME: Record<TargetKey, { mom: string[]; yoy: string[] }> = {
  cpi: { mom: ['Inflation Rate MoM'], yoy: ['Inflation Rate YoY'] },
  coreCpi: { mom: ['Core Inflation Rate MoM'], yoy: ['Core Inflation Rate YoY'] },
  ppi: { mom: ['Producer Price Index MoM', 'PPI MoM'], yoy: ['Producer Price Index YoY', 'PPI YoY'] },
  corePpi: { mom: ['Core PPI MoM'], yoy: ['Core PPI YoY'] },
};

/** 경제 캘린더에서 대상 월 발표의 시장 예상치·이전치·실제치를 찾는다(이름은 "… (Oct)" 꼴, 시각은 UTC) */
export function pickConsensus(events: CalEvent[] | undefined, key: TargetKey, month: string): Consensus {
  const tag = `(${MON[Number(month.slice(5, 7)) - 1]})`;
  const find = (names: string[]) => (events ?? []).find((e) => e.country === 'US' && names.some((n) => e.event === `${n} ${tag}`));
  const line = (e?: CalEvent): ConsLine | null => (e ? { estimate: e.estimate ?? null, previous: e.previous ?? null, actual: e.actual ?? null } : null);
  const m = find(EVENT_NAME[key].mom), y = find(EVENT_NAME[key].yoy);
  const at = (m ?? y)?.date;
  return { releaseAt: at ? `${at.replace(' ', 'T')}Z` : null, mom: line(m), yoy: line(y) };
}

/* ── AI 기사 보정 ─────────────────────────────────────────── */
export interface AiArticle { title: string; effect: 'up' | 'down' | 'neutral'; why: string }
export interface AiAdjust {
  adjust: Record<TargetKey, number>; reasons: Partial<Record<TargetKey, string>>;
  summary: string; articles: AiArticle[];
}
export const clampAdj = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.max(-AI_ADJ_MAX, Math.min(AI_ADJ_MAX, n)) * 100) / 100;
};

/** AI 응답(JSON 한 덩어리)에서 보정값을 꺼내 한도 안으로 자른다. 못 읽으면 null */
export function parseAiAdjust(text: string): AiAdjust | null {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(text.slice(a, b + 1)); } catch { return null; }
  const adj = (j.adjust ?? {}) as Record<string, unknown>, rs = (j.reasons ?? {}) as Record<string, unknown>;
  const keys: TargetKey[] = ['cpi', 'coreCpi', 'ppi', 'corePpi'];
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const arts = Array.isArray(j.articles) ? j.articles : [];
  return {
    adjust: Object.fromEntries(keys.map((k) => [k, clampAdj(adj[k])])) as Record<TargetKey, number>,
    reasons: Object.fromEntries(keys.map((k) => [k, str(rs[k], 300)]).filter(([, v]) => v)) as AiAdjust['reasons'],
    summary: str(j.summary, 600),
    articles: arts.slice(0, 12).map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const e = o.effect === 'up' || o.effect === 'down' ? o.effect : 'neutral';
      return { title: str(o.title, 200), effect: e, why: str(o.why, 200) } as AiArticle;
    }).filter((x) => x.title),
  };
}

/** 물가 관련 기사만 — 제목·요약에 키워드가 있는 것 */
const NEWS_RE = /\b(CPI|PPI|PCE|inflation|disinflation|tariff|Fed|FOMC|Powell|Waller|rate (?:cut|hike)|interest rate|gasoline|crude|oil price|OPEC|Brent|WTI|dollar|wage|rent|energy price)/i;
const NEWS_RE_KO = /물가|인플레|소비자물가|생산자물가|연준|금리|관세|유가|휘발유|원유|국제유가|달러|파월|월러|임금|OPEC|환율/;
export const isPriceNews = (title: string, summary = '') => NEWS_RE.test(`${title} ${summary}`) || NEWS_RE_KO.test(`${title} ${summary}`);

/** 저장되는 실행 기록 1건(발표 전 예상을 남겨 나중에 실제와 대조) */
export interface RunTarget { month: string; model: number | null; adj: number; final: number | null; consensus: number | null; reason?: string }
export interface ForecastRun {
  ranAt: number; aiModel: string | null;
  targets: Record<TargetKey, RunTarget>;
  summary: string; articles: AiArticle[]; newsCount: number;
}
/** 지표·대상 월별 가장 최근 실행 */
export function latestRunFor(runs: ForecastRun[] | undefined, key: TargetKey, month: string): ForecastRun | null {
  return [...(runs ?? [])].sort((a, b) => b.ranAt - a.ranAt).find((r) => r.targets?.[key]?.month === month) ?? null;
}
