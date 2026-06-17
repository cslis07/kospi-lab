import { NextRequest, NextResponse } from 'next/server';
import { fetchNaverData } from '@/lib/naverFinance';
import type { NaverData } from '@/lib/naverFinance';
import { fetchDartFinancials, fetchDartDividends } from '@/lib/dartClient';
import type { DartFinancials } from '@/lib/dartClient';
import { fetchKisFinancialRatio, fetchKisOpMargin } from '@/lib/kisFinance';
import type { KisFinancials } from '@/lib/kisFinance';

// 여러 소스(Yahoo·Naver·KIS·DART)를 직렬로 조회하므로 기본 10s로는 부족할 수 있다
export const maxDuration = 30;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── Module-level auth cache ───────────────────────────────────────────────────
let _crumb  = '';
let _cookie = '';
let _authTs = 0;

// ── Ticker-level result cache ─────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RCACHE = new Map<string, { d: any; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1h

// ── Yahoo Finance 쿠키 + crumb 취득 ──────────────────────────────────────────
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
        _crumb  = crumb;
        _cookie = cookie;
        _authTs = Date.now();
      }
    }
  } catch { /* crumb 없이 진행 */ }
}

// ── Yahoo Finance quoteSummary (모듈 폴백 포함) ───────────────────────────────
const MODULE_LISTS = [
  'financialData,defaultKeyStatistics,summaryDetail,assetProfile,balanceSheetHistoryQuarterly,balanceSheetHistory,incomeStatementHistory',
  'financialData,defaultKeyStatistics,summaryDetail,assetProfile',
  'financialData,defaultKeyStatistics,summaryDetail',
];
const YF_HOSTS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com',
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchYahoo(ticker: string): Promise<any | null> {
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
          RCACHE.set(ticker, { d: result, ts: Date.now() });
          return result;
        }
        break; // null result → try next module list
      } catch { /* try next host */ }
    }
  }
  return null;
}

// ── 안전한 raw number 추출 ────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function raw(obj: any, ...keys: string[]): number | null {
  let cur = obj;
  for (const k of keys) {
    if (cur == null) return null;
    cur = cur[k];
  }
  return typeof cur === 'number' ? cur : null;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function str(obj: any, ...keys: string[]): string | null {
  let cur = obj;
  for (const k of keys) {
    if (cur == null) return null;
    cur = cur[k];
  }
  return typeof cur === 'string' && cur ? cur : null;
}
function pct(v: number | null, dp = 1) {
  return v != null ? Math.round(v * Math.pow(10, dp + 2)) / Math.pow(10, dp) : null;
}

// ── Naver Finance 데이터 → 스크리너 결과 변환 ─────────────────────────────────
function buildFromNaver(nd: NaverData, ticker: string, roeMin: number) {
  // Naver finance/annual rowList가 영업이익률을 직접 제공 (이미 %)
  const opMargin = nd.opMargin ??
    (nd.revenue && nd.operatingProfit && nd.revenue > 0
      ? Math.round((nd.operatingProfit / nd.revenue) * 1000) / 10
      : null);
  const revGrowth =
    nd.revenue && nd.prevRevenue && nd.prevRevenue !== 0
      ? Math.round(((nd.revenue - nd.prevRevenue) / Math.abs(nd.prevRevenue)) * 1000) / 10
      : null;
  const per = nd.per; // Naver rowList에서 직접 제공

  const details = {
    roe:    nd.roe        != null ? nd.roe        >= roeMin : null,
    margin: opMargin      != null ? opMargin      >= 15     : null,
    fcf:    null,  // Naver에서 FCF 미제공
    debt:   nd.debtRatio  != null ? nd.debtRatio  < 100     : null,
    growth: revGrowth     != null ? revGrowth     > 0       : null,
    per:    per           != null ? per > 0 && per < 35     : null,
    profit: nd.netIncome  != null ? nd.netIncome  > 0       : null,
  };

  return {
    ticker,
    name: nd.name || ticker.replace(/\.(KS|KQ)$/, ''),
    currency: 'KRW',
    marketCap: nd.marketCap || null,
    sector: null,
    industry: null,
    per,
    peg: null,
    fwdPE: null,
    roe: nd.roe,
    opMargin,
    fcf: null,
    debtRatio: nd.debtRatio,
    revenueGrowth: revGrowth,
    netInc: nd.netIncome,
    buffettScore: Object.values(details).filter((v) => v === true).length,
    buffettDetails: details,
    source: 'naver',  // 데이터 소스 표시 (디버그용)
  };
}

// ── Yahoo Finance 데이터 → 스크리너 결과 변환 ────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildFromYahoo(d: any, ticker: string, roeMin: number) {
  const pr  = d.price               ?? {};
  const fd  = d.financialData        ?? {};
  const ks  = d.defaultKeyStatistics ?? {};
  const sd  = d.summaryDetail        ?? {};
  const ap  = d.assetProfile         ?? {};
  const bs0 =
    d.balanceSheetHistoryQuarterly?.balanceSheetStatements?.[0] ??
    d.balanceSheetHistory?.balanceSheetStatements?.[0] ??
    {};
  const is0 = d.incomeStatementHistory?.incomeStatementHistory?.[0] ?? {};

  const name: string =
    str(pr, 'longName') ?? str(pr, 'shortName') ??
    str(ap, 'longName') ?? str(sd, 'longName') ?? ticker;
  const currency: string =
    str(pr, 'currency') ??
    (ticker.endsWith('.KS') || ticker.endsWith('.KQ') ? 'KRW' : 'USD');
  const marketCap = raw(pr, 'marketCap', 'raw') ?? raw(sd, 'marketCap', 'raw');
  const sector    = str(ap, 'sector');
  const industry  = str(ap, 'industry');

  const roe      = pct(raw(fd, 'returnOnEquity',   'raw'));
  const opMargin = pct(raw(fd, 'operatingMargins', 'raw'));
  const fcf      = raw(fd, 'freeCashflow', 'raw');
  const revGrowth = pct(raw(fd, 'revenueGrowth', 'raw'));
  const netInc =
    raw(fd, 'netIncomeToCommon', 'raw') ??
    raw(ks, 'netIncomeToCommon', 'raw') ??
    raw(is0, 'netIncome', 'raw') ??
    raw(is0, 'netIncomeApplicableToCommonShares', 'raw');

  const debtRatioFD = raw(fd, 'debtToEquity', 'raw');
  const totLiab = raw(bs0, 'totalLiab', 'raw');
  const totEq   = raw(bs0, 'totalStockholderEquity', 'raw');
  const debtRatioBs =
    totLiab != null && totEq != null && totEq > 0
      ? Math.round((totLiab / totEq) * 1000) / 10
      : null;
  const debtRatio = debtRatioFD != null
    ? Math.round(debtRatioFD * 10) / 10
    : debtRatioBs;

  const perRaw =
    raw(ks, 'trailingPE', 'raw') ??
    raw(sd, 'trailingPE', 'raw') ??
    (marketCap != null && netInc != null && netInc > 0 ? marketCap / netInc : null);
  const fwdPERaw = raw(ks, 'forwardPE', 'raw') ?? raw(sd, 'forwardPE', 'raw');
  const pegRaw   = raw(ks, 'pegRatio',  'raw');
  const per   = perRaw   != null ? Math.round(perRaw   * 10) / 10 : null;
  const fwdPE = fwdPERaw != null ? Math.round(fwdPERaw * 10) / 10 : null;
  const peg   = pegRaw   != null ? Math.round(pegRaw   * 100) / 100 : null;

  const details = {
    roe:    roe       != null ? roe       >= roeMin      : null,
    margin: opMargin  != null ? opMargin  >= 15          : null,
    fcf:    fcf       != null ? fcf       >  0           : null,
    debt:   debtRatio != null ? debtRatio <  100         : null,
    growth: revGrowth != null ? revGrowth >  0           : null,
    per:    per       != null ? per > 0 && per < 35      : null,
    profit: netInc    != null ? netInc    >  0           : null,
  };

  return {
    ticker, name, currency, marketCap, sector, industry,
    per, peg, fwdPE, roe, opMargin, fcf, debtRatio,
    revenueGrowth: revGrowth, netInc,
    buffettScore:   Object.values(details).filter((v) => v === true).length,
    buffettDetails: details,
    source: 'yahoo',
  };
}

// ── KIS 재무비율(+손익계산서 영업이익률) → 스크리너 결과 변환 ─────────────────
function buildFromKis(
  f: KisFinancials, ticker: string, roeMin: number, opMargin: number | null,
) {
  const details = {
    roe:    f.roe           != null ? f.roe           >= roeMin : null,
    margin: opMargin        != null ? opMargin        >= 15     : null,
    fcf:    null,
    debt:   f.debtRatio     != null ? f.debtRatio     < 100     : null,
    growth: f.revenueGrowth != null ? f.revenueGrowth > 0       : null,
    per:    null,
    profit: f.netIncomePositive,
  };

  return {
    ticker,
    name:          ticker.replace(/\.(KS|KQ)$/, ''),
    currency:      'KRW',
    marketCap:     null,
    sector:        null,
    industry:      null,
    per:           null,
    peg:           null,
    fwdPE:         null,
    roe:           f.roe,
    opMargin,
    fcf:           null,
    debtRatio:     f.debtRatio,
    revenueGrowth: f.revenueGrowth,
    netInc:        null,
    buffettScore:  Object.values(details).filter((v) => v === true).length,
    buffettDetails: details,
    source:        'kis',
  };
}

// ── DART 데이터 → 스크리너 결과 변환 ──────────────────────────────────────────
function buildFromDart(d: DartFinancials, ticker: string, roeMin: number) {
  const details = {
    roe:    d.roe       != null ? d.roe       >= roeMin : null,
    margin: d.opMargin  != null ? d.opMargin  >= 15     : null,
    fcf:    null,
    debt:   d.debtRatio != null ? d.debtRatio < 100     : null,
    growth: null,
    per:    null,
    profit: d.netIncome != null ? d.netIncome > 0       : null,
  };

  return {
    ticker,
    name:          ticker.replace(/\.(KS|KQ)$/, ''),
    currency:      'KRW',
    marketCap:     null,
    sector:        null,
    industry:      null,
    per:           null,
    peg:           null,
    fwdPE:         null,
    roe:           d.roe,
    opMargin:      d.opMargin,
    fcf:           null,
    debtRatio:     d.debtRatio,
    revenueGrowth: null,
    netInc:        d.netIncome,
    buffettScore:  Object.values(details).filter((v) => v === true).length,
    buffettDetails: details,
    source:        'dart',
  };
}

// ── GET handler ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tickers = (searchParams.get('tickers') ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
  const market = (searchParams.get('market') ?? 'US') as 'KR' | 'US';

  if (!tickers.length)
    return NextResponse.json({ error: 'tickers required' }, { status: 400 });

  const roeMin = market === 'KR' ? 10 : 15;

  const settled = await Promise.allSettled(
    tickers.map(async (ticker) => {
      // ── 1순위: Yahoo Finance (대형주는 여기서 완전한 데이터 제공) ────────────
      const d = await fetchYahoo(ticker);
      if (d) return buildFromYahoo(d, ticker, roeMin);

      // ── KR 주식 Yahoo 실패 시: Naver로 올바른 시장 코드 확인 후 재시도 ────────
      // 원인: 검색 단계에서 KS/KQ가 잘못 저장된 경우 (예: 에이피알 278470.KQ → 실제 278470.KS)
      if (market === 'KR') {
        const code = ticker.replace(/\.(KS|KQ)$/, '');
        try {
          const nd = await fetchNaverData(code);
          if (nd) {
            const correctTicker = `${code}${nd.yfSuffix}`;

            // 티커 접미사가 달랐다면 Yahoo Finance로 재시도
            if (correctTicker !== ticker) {
              const d2 = await fetchYahoo(correctTicker);
              if (d2) return buildFromYahoo(d2, correctTicker, roeMin);
            }

            // Yahoo가 모두 실패하면 Naver 재무 데이터 직접 사용
            // (ROE·부채비율·매출 등 finance/annual rowList에서 파싱)
            return buildFromNaver(nd, correctTicker, roeMin);
          }
        } catch { /* ignore */ }

        // ── 3순위: KIS 재무비율(+영업이익률) (Vercel에서 안정적) ──────────────────
        try {
          const kf = await fetchKisFinancialRatio(code);
          if (kf && (kf.roe != null || kf.debtRatio != null || kf.revenueGrowth != null)) {
            const opMargin = await fetchKisOpMargin(code); // best-effort, 실패 시 null
            return buildFromKis(kf, ticker, roeMin, opMargin);
          }
        } catch { /* ignore */ }

        // ── 4순위: DART 재무 데이터 (Yahoo + Naver + KIS 모두 실패 시) ───────────
        if (process.env.DART_API_KEY) {
          try {
            const currentYear = new Date().getFullYear();
            const dartYear = currentYear - 1;
            const dartFin = await fetchDartFinancials(code, dartYear);
            if (dartFin) {
              // 배당 데이터로 순이익 보정 시도 (선택적)
              await fetchDartDividends(code, dartYear);
              return buildFromDart(dartFin, ticker, roeMin);
            }
          } catch { /* ignore */ }
        }
      }

      return null;
    })
  );

  const results = settled
    .filter((r) => r.status === 'fulfilled' && r.value !== null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r) => (r as PromiseFulfilledResult<any>).value);

  const failedTickers = tickers.filter(
    (t) => !results.some((r: { ticker: string }) => r.ticker === t)
  );

  if (results.length === 0) {
    return NextResponse.json(
      {
        error:
          `재무 데이터를 가져올 수 없습니다 (Yahoo·Naver·KIS·DART 모두 실패).\n` +
          `실패 종목: ${failedTickers.join(', ')}\n` +
          `신규 상장·소형주이거나 일시적 조회 불가일 수 있습니다.`,
        failedTickers,
      },
      { status: 200 }
    );
  }

  return NextResponse.json(results);
}
