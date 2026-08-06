/**
 * Yahoo Finance quoteSummary 클라이언트 — crumb 인증 + 호스트/모듈 폴백 + 1h 캐시.
 * 버핏 스크리너(app/api/screener)와 미국 성장주 스캔(growth-scan)이 공유한다.
 * (기존 screener route 에 있던 로직을 그대로 추출 — 동작 동일)
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

let _crumb = '';
let _cookie = '';
let _authTs = 0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RCACHE = new Map<string, { d: any; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1h
const MAX_KEYS = 2000;

async function ensureCrumb() {
  if (_crumb && Date.now() - _authTs < 20 * 60_000) return;
  try {
    const r1 = await fetch('https://finance.yahoo.com/', {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(9000),
    });
    let rawCookies: string[] = [];
    const gsc = (r1.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    if (typeof gsc === 'function') {
      rawCookies = gsc.call(r1.headers);
    } else {
      rawCookies = (r1.headers.get('set-cookie') ?? '')
        .split(/,(?=\s*[A-Za-z0-9_-]+=)/)
        .filter(Boolean);
    }
    const cookie = rawCookies
      .flatMap((c) => c.split(/;/)[0].trim())
      .filter((c) => c.includes('='))
      .join('; ');
    const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, Cookie: cookie },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (r2.ok) {
      const crumb = (await r2.text()).trim();
      if (crumb && crumb.length < 50 && !crumb.startsWith('{')) {
        _crumb = crumb;
        _cookie = cookie;
        _authTs = Date.now();
      }
    }
  } catch { /* crumb 없이 진행 */ }
}

// ⚠ price 모듈이 있어야 종목명(longName/shortName)·통화·시가총액을 받는다.
//   빠져 있으면 이름 자리에 티커가 그대로 찍힌다(실측으로 확인).
const MODULE_LISTS = [
  'price,financialData,defaultKeyStatistics,summaryDetail,assetProfile,balanceSheetHistoryQuarterly,balanceSheetHistory,incomeStatementHistory',
  'price,financialData,defaultKeyStatistics,summaryDetail,assetProfile',
  'price,financialData,defaultKeyStatistics,summaryDetail',
  'financialData,defaultKeyStatistics,summaryDetail',
];
const YF_HOSTS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com',
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchYahoo(ticker: string): Promise<any | null> {
  const cached = RCACHE.get(ticker);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.d;

  await ensureCrumb();
  const crumbQ = _crumb ? `&crumb=${encodeURIComponent(_crumb)}` : '';
  const reqHeaders: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://finance.yahoo.com/',
  };
  if (_cookie) reqHeaders['Cookie'] = _cookie;

  for (const modules of MODULE_LISTS) {
    for (const host of YF_HOSTS) {
      try {
        const url = `${host}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}${crumbQ}`;
        const res = await fetch(url, { headers: reqHeaders, cache: 'no-store', signal: AbortSignal.timeout(9000) });
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) _authTs = 0;
          continue;
        }
        const json = await res.json();
        const result = json?.quoteSummary?.result?.[0];
        if (result) {
          if (RCACHE.size >= MAX_KEYS) {
            const now = Date.now();
            for (const [k, v] of RCACHE) if (now - v.ts >= CACHE_TTL) RCACHE.delete(k);
            if (RCACHE.size >= MAX_KEYS) RCACHE.delete(RCACHE.keys().next().value as string);
          }
          RCACHE.set(ticker, { d: result, ts: Date.now() });
          return result;
        }
        break; // null result → try next module list
      } catch { /* try next host */ }
    }
  }
  return null;
}

/** 안전한 raw number 추출 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function yfRaw(obj: any, ...keys: string[]): number | null {
  let cur = obj;
  for (const k of keys) {
    if (cur == null) return null;
    cur = cur[k];
  }
  return typeof cur === 'number' ? cur : null;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function yfStr(obj: any, ...keys: string[]): string | null {
  let cur = obj;
  for (const k of keys) {
    if (cur == null) return null;
    cur = cur[k];
  }
  return typeof cur === 'string' && cur ? cur : null;
}
