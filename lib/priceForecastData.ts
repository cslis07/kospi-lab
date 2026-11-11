/**
 * CPI·PPI 예상치 — 서버 전용 수집·저장(계산은 lib/priceForecast).
 * FRED(지표) · Nowflation 경제 캘린더(시장 예상치, CC BY 4.0 중계) · 뉴스 제목 · Supabase(실행 기록).
 */
import { ALL_FRED, buildForecasts, pickConsensus, latestRunFor, isPriceNews, type SeriesMap, type Pt, type CalEvent, type ForecastRun, type TargetForecast, type Consensus, type TargetKey } from '@/lib/priceForecast';
import { loadNf } from '@/lib/nfLoad';
import { fetchNews } from '@/lib/newsFeeds';
import { sbGet, sbPut } from '@/lib/guard';

const RUNS_ID = 'price-forecast-runs';   // kospi-lab- 접두사가 아니라 기기 동기화엔 안 섞인다
const MAX_RUNS = 60;
const FRED_TTL = 6 * 60 * 60;            // 월간 발표·일별 지표 — 6시간이면 충분

/** 마지막으로 성공한 계열(같은 서버 인스턴스 안) — FRED 가 잠깐 실패해도 직전 값으로 계산한다 */
const lastGood = new Map<string, Pt[]>();

async function fredSeries(id: string): Promise<Pt[]> {
  const key = process.env.FRED_API_KEY;
  if (!key) return [];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(
        `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&observation_start=2010-01-01`,
        { next: { revalidate: FRED_TTL }, signal: AbortSignal.timeout(9000) },
      );
      if (res.ok) {
        const j = (await res.json()) as { observations?: { date: string; value: string }[] };
        const pts = (j.observations ?? [])
          .filter((o) => o.value !== '.' && o.value !== '')
          .map((o) => ({ date: o.date, value: Number(o.value) }))
          .filter((o) => Number.isFinite(o.value));
        if (pts.length) { lastGood.set(id, pts); return pts; }
      } else {
        console.error(`[price-forecast] FRED ${id} ${res.status}`);   // 키는 찍지 않는다
      }
    } catch (e) {
      console.error(`[price-forecast] FRED ${id} ${e instanceof Error ? e.name : 'error'}`);
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  return lastGood.get(id) ?? [];
}

/** 14개 계열 — 한꺼번에 쏘면 FRED 가 일부를 거절하는 일이 있어 4개씩 */
export async function loadSeries(): Promise<SeriesMap> {
  const out: SeriesMap = {};
  const queue = [...ALL_FRED];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let id = queue.shift(); id; id = queue.shift()) out[id] = await fredSeries(id);
  }));
  return out;
}

async function nfJson<T>(name: string): Promise<T | null> {
  try { const t = await loadNf(name); return t ? (JSON.parse(t) as T) : null; } catch { return null; }
}

const kstToday = (now: number) => new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);

export interface ForecastItem extends TargetForecast {
  consensus: Consensus;
  /** 이 대상 월에 대해 저장된 마지막 AI 보정(없으면 null) */
  ai: { ranAt: number; adj: number; final: number | null; reason?: string } | null;
}
export interface ScoreRow { key: TargetKey; month: string; ranAt: number; model: number | null; final: number | null; consensus: number | null; actual: number }
export interface ForecastPayload {
  asOf: number; configured: boolean;
  items: ForecastItem[];
  /** 가장 최근 AI 실행(요약·기사) */
  lastRun: Pick<ForecastRun, 'ranAt' | 'aiModel' | 'summary' | 'articles' | 'newsCount'> | null;
  /** 발표가 끝난 과거 실행 — 우리 예상 vs 시장 vs 실제 */
  scores: ScoreRow[];
  /** CPI 전년비 참고(다른 예측자) */
  refs: { month: string; cleveland?: number; kalshi?: number; nowflation?: number; street?: number } | null;
}

interface RelCal { events?: { kind: string; data_month?: string; street?: number; cleveland?: number; kalshi?: number; nowflation_forecast?: number }[] }

export async function loadRuns(): Promise<ForecastRun[]> {
  return (await sbGet<{ runs: ForecastRun[] }>(RUNS_ID))?.runs ?? [];
}
export async function saveRun(run: ForecastRun): Promise<boolean> {
  const runs = await loadRuns();
  return sbPut(RUNS_ID, { runs: [...runs, run].slice(-MAX_RUNS) }).catch(() => false);
}

export async function buildPayload(now: number = Date.now()): Promise<ForecastPayload> {
  const [series, cal, rel, runs] = await Promise.all([
    loadSeries(),
    nfJson<{ events?: CalEvent[] }>('econcal_window.json'),
    nfJson<RelCal>('release_calendar.json'),
    loadRuns().catch(() => [] as ForecastRun[]),
  ]);
  const fc = buildForecasts(series, kstToday(now));
  const items: ForecastItem[] = fc.map((t) => {
    const run = latestRunFor(runs, t.key, t.month), rt = run?.targets[t.key];
    return {
      ...t, consensus: pickConsensus(cal?.events, t.key, t.month),
      ai: run && rt ? { ranAt: run.ranAt, adj: rt.adj, final: t.mom != null ? t.mom + rt.adj : rt.final, reason: rt.reason } : null,
    };
  });

  // 과거 실행 채점 — 지표·월별 마지막 실행 1건, 실제 발표가 나온 것만
  const actual = new Map<string, number>();
  for (const t of fc) {
    for (const p of t.past) actual.set(`${t.key}:${p.month}`, p.actual);
    if (t.prevMonth && t.prevMom != null) actual.set(`${t.key}:${t.prevMonth}`, t.prevMom);
  }
  const seen = new Set<string>(), scores: ScoreRow[] = [];
  for (const r of [...runs].sort((a, b) => b.ranAt - a.ranAt)) {
    for (const [k, v] of Object.entries(r.targets ?? {}) as [TargetKey, ForecastRun['targets'][TargetKey]][]) {
      const id = `${k}:${v.month}`, a = actual.get(id);
      if (a == null || seen.has(id)) continue;
      seen.add(id);
      scores.push({ key: k, month: v.month, ranAt: r.ranAt, model: v.model, final: v.final, consensus: v.consensus, actual: a });
    }
  }

  const cpiMonth = fc.find((t) => t.key === 'cpi')?.month;
  const ev = rel?.events?.find((e) => e.kind === 'cpi' && e.data_month === cpiMonth);
  const last = [...runs].sort((a, b) => b.ranAt - a.ranAt)[0];
  return {
    asOf: now, configured: !!process.env.FRED_API_KEY, items,
    lastRun: last ? { ranAt: last.ranAt, aiModel: last.aiModel, summary: last.summary, articles: last.articles, newsCount: last.newsCount } : null,
    scores: scores.slice(0, 24),
    refs: ev && cpiMonth ? { month: cpiMonth, cleveland: ev.cleveland, kalshi: ev.kalshi, nowflation: ev.nowflation_forecast, street: ev.street } : null,
  };
}

/** 구글 뉴스 검색 RSS(영문) — 연준 인사 발언·물가 기사 제목 보강. 실패하면 빈 배열 */
async function googleNews(q: string): Promise<{ title: string; source: string; pubDate?: string }[]> {
  try {
    const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSSBot/1.0)' }, cache: 'no-store', signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const out: { title: string; source: string; pubDate?: string }[] = [];
    const clean = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim();
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const pick = (tag: string) => clean(m[1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? '');
      const title = pick('title');
      if (title) out.push({ title, source: pick('source') || 'Google News', pubDate: pick('pubDate') || undefined });
      if (out.length >= 25) break;
    }
    return out;
  } catch { return []; }
}

/** AI 에 줄 물가 관련 기사 제목(최근 7일, 중복 제거, 최대 60건) */
export async function priceHeadlines(now: number = Date.now()): Promise<{ title: string; source: string; date: string }[]> {
  const [feed, g1, g2] = await Promise.all([
    fetchNews(null, 200).catch(() => []),
    googleNews('US inflation CPI PPI when:7d'),
    googleNews('Fed officials rates inflation Waller OR Powell OR Jefferson OR Williams when:7d'),
  ]);
  const all = [
    ...feed.filter((n) => isPriceNews(n.title, n.summary ?? '')).map((n) => ({ title: n.title, source: n.source ?? '', pubDate: n.pubDate })),
    ...g1, ...g2,
  ];
  const seen = new Set<string>(), week = now - 7 * 86_400_000;
  return all
    .map((n) => ({ title: n.title.replace(/\s+/g, ' ').trim(), source: n.source, t: n.pubDate ? new Date(n.pubDate).getTime() : now }))
    .filter((n) => { const k = n.title.toLowerCase().slice(0, 60); if (!n.title || seen.has(k) || !(n.t >= week)) return false; seen.add(k); return true; })
    .sort((a, b) => b.t - a.t).slice(0, 60)
    .map((n) => ({ title: n.title.slice(0, 180), source: n.source, date: new Date(n.t + 9 * 3_600_000).toISOString().slice(5, 10) }));
}
