/**
 * 네이버 증권 지수·환율 실시간 헬퍼 (무키, 로컬·Vercel 모두 동작 — m.stock / api.stock 도메인).
 *
 * ⚠️ 차트 함정: `/chart/.../index/{code}?periodType=dayCandle&count=N` 은 count·기간을 **무시**하고 약 5개월치만 준다
 *    (그래서 52주 최저가 틀렸었다). 기간이 필요하면 `/chart/{market}/index/{code}/day?startDateTime=YYYYMMDD&endDateTime=YYYYMMDD`.
 * 분봉은 국내 지수만 `/chart/domestic/index/{code}/minute?startDateTime=YYYYMMDDHHmm&endDateTime=...` (해외 분봉은 빈 배열).
 * 실시간 등락 종목수·투자자·프로그램매매·52주는 `m.stock.naver.com/api/index/{code}/integration` 한 번에.
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  Referer: 'https://m.stock.naver.com/',
  Accept: 'application/json',
};

export const num = (s: unknown): number => {
  if (s == null) return 0;
  const n = Number(String(s).replace(/,/g, '').replace(/[+\s%]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
export const r2 = (n: number) => Math.round(n * 100) / 100;

async function getJson<T = unknown>(url: string, revalidate: number, timeoutMs = 8000): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, next: { revalidate }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** KST 기준 YYYYMMDD (offsetDays 만큼 과거) */
export function kstYmd(offsetDays = 0): string {
  const d = new Date(Date.now() + 9 * 3600_000 - offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

export interface LiveQuote {
  value: number;
  change: number;
  changeRate: number;
  live: boolean;          // 장중(OPEN) 여부 — false 면 '장마감' 표기
  tradedAt: string;       // ISO(현지 시각대 포함) — 마지막 체결 시각
}

/** 국내 지수(KOSPI/KOSDAQ) 실시간 */
export async function krIndexLive(code: 'KOSPI' | 'KOSDAQ'): Promise<LiveQuote | null> {
  const j = await getJson<Record<string, unknown>>(`https://m.stock.naver.com/api/index/${code}/basic`, 5);
  if (!j) return null;
  return {
    value: num(j.closePrice), change: num(j.compareToPreviousClosePrice), changeRate: num(j.fluctuationsRatio),
    live: j.marketStatus === 'OPEN', tradedAt: String(j.localTradedAt ?? ''),
  };
}

/** 해외 지수(.INX / .IXIC / .DJI) 실시간 */
export async function worldIndexLive(code: string): Promise<LiveQuote | null> {
  const j = await getJson<Record<string, unknown>>(`https://api.stock.naver.com/index/${encodeURIComponent(code)}/basic`, 5);
  if (!j) return null;
  return {
    value: num(j.closePrice), change: num(j.compareToPreviousClosePrice), changeRate: num(j.fluctuationsRatio),
    live: j.marketStatus === 'OPEN', tradedAt: String(j.localTradedAt ?? ''),
  };
}

/** 원/달러(하나은행 고시, 실시간) */
export async function usdKrwLive(): Promise<LiveQuote | null> {
  const j = await getJson<{ exchangeInfo?: Record<string, unknown> }>('https://api.stock.naver.com/marketindex/exchange/FX_USDKRW', 5);
  const e = j?.exchangeInfo;
  if (!e) return null;
  const value = num(e.closePrice);
  const change = num(e.fluctuations);
  return {
    value, change, changeRate: num(e.fluctuationsRatio),
    live: e.marketStatus === 'OPEN', tradedAt: String(e.localTradedAt ?? ''),
  };
}

export interface DayRow { d: string; o: number; h: number; l: number; c: number }

/** 일봉 — 기간 지정(정확한 범위). market: domestic | foreign */
export async function indexDaily(market: 'domestic' | 'foreign', code: string, days: number): Promise<DayRow[]> {
  const url = `https://api.stock.naver.com/chart/${market}/index/${encodeURIComponent(code)}/day?startDateTime=${kstYmd(days)}&endDateTime=${kstYmd(0)}`;
  const rows = await getJson<{ localDate: string; openPrice: number; highPrice: number; lowPrice: number; closePrice: number }[]>(url, 300, 10000);
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => typeof r.closePrice === 'number' && r.closePrice > 0)
    .map((r) => ({
      d: `${r.localDate.slice(0, 4)}-${r.localDate.slice(4, 6)}-${r.localDate.slice(6, 8)}`,
      o: r2(r.openPrice), h: r2(r.highPrice), l: r2(r.lowPrice), c: r2(r.closePrice),
    }));
}

export interface MinRow { t: string; o: number; h: number; l: number; c: number }

/** 국내 지수 분봉(하루치). ymd=YYYYMMDD */
export async function indexMinute(code: 'KOSPI' | 'KOSDAQ', ymd: string): Promise<MinRow[]> {
  const url = `https://api.stock.naver.com/chart/domestic/index/${code}/minute?startDateTime=${ymd}0900&endDateTime=${ymd}1530`;
  const rows = await getJson<{ localDateTime: string; currentPrice: number; openPrice: number; highPrice: number; lowPrice: number }[]>(url, 20, 10000);
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => typeof r.currentPrice === 'number' && r.currentPrice > 0)
    .map((r) => ({
      t: `${r.localDateTime.slice(8, 10)}:${r.localDateTime.slice(10, 12)}`,
      o: r2(r.openPrice || r.currentPrice), h: r2(r.highPrice || r.currentPrice), l: r2(r.lowPrice || r.currentPrice), c: r2(r.currentPrice),
    }));
}

export interface IndexIntegration {
  prevClose: number;
  week52High: number | null;
  week52Low: number | null;
  upDown: { up: number; upper: number; flat: number; down: number; lower: number } | null;
  investor: { date: string; foreign: number; institution: number; individual: number } | null;
  program: { date: string; total: number; arbitrage: number; nonArbitrage: number } | null;
}

const fmtBiz = (s: unknown) => { const d = String(s ?? ''); return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d; };

/** 국내 지수 부가정보(실시간 등락 종목수·투자자·프로그램·52주·전일) */
export async function krIndexIntegration(code: 'KOSPI' | 'KOSDAQ'): Promise<IndexIntegration | null> {
  const j = await getJson<Record<string, any>>(`https://m.stock.naver.com/api/index/${code}/integration`, 30); // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!j) return null;
  const infos: { key: string; value: string }[] = j.totalInfos ?? [];
  const info = (k: string) => { const v = infos.find((x) => x.key === k)?.value; return v ? num(v) : null; };
  const ud = j.upDownStockInfo, dt = j.dealTrendInfo, pt = j.programTrendInfo;
  return {
    prevClose: info('전일') ?? 0,
    week52High: info('52주 최고'),
    week52Low: info('52주 최저'),
    upDown: ud ? { up: num(ud.riseCount), upper: num(ud.upperCount), flat: num(ud.steadyCount), down: num(ud.fallCount), lower: num(ud.lowerCount) } : null,
    investor: dt ? { date: fmtBiz(dt.bizdate), foreign: num(dt.foreignValue), institution: num(dt.institutionalValue), individual: num(dt.personalValue) } : null,
    program: pt ? { date: fmtBiz(pt.bizdate), total: num(pt.indexTotalReal), arbitrage: num(pt.indexDifferenceReal), nonArbitrage: num(pt.indexBiDifferenceReal) } : null,
  };
}

/** 시계열을 최대 n개로 균등 다운샘플(마지막 점은 항상 포함) */
export function downsample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const step = (arr.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => arr[Math.round(i * step)]);
}
