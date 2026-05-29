import { NextRequest, NextResponse } from 'next/server';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── Module-level auth cache (재사용: Lambda warm 상태에서 재요청 시 절약) ──
let _crumb  = '';
let _cookie = '';
let _authTs = 0;

// ── Ticker-level result cache ─────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RCACHE = new Map<string, { d: any; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1h

// ── Yahoo Finance 쿠키 + crumb 취득 ──────────────────────────────────────
async function ensureCrumb() {
  if (_crumb && Date.now() - _authTs < 20 * 60_000) return; // 20분 캐시

  try {
    // 1) Yahoo Finance 홈에서 세션 쿠키 취득
    const r1 = await fetch('https://finance.yahoo.com/', {
      headers: {
        'User-Agent': UA,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(9000),
    });

    // Set-Cookie 헤더 수집 (Node 18+: getSetCookie / 구버전 fallback)
    let rawCookies: string[] = [];
    const gsc = (r1.headers as Headers & { getSetCookie?: () => string[] })
      .getSetCookie;
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

    // 2) crumb 취득
    const r2 = await fetch(
      'https://query1.finance.yahoo.com/v1/test/getcrumb',
      {
        headers: { 'User-Agent': UA, Cookie: cookie },
        cache: 'no-store',
        signal: AbortSignal.timeout(6000),
      }
    );

    if (r2.ok) {
      const crumb = (await r2.text()).trim();
      // 유효한 crumb인지 확인 (JSON 에러 응답이 아닌지)
      if (crumb && crumb.length < 50 && !crumb.startsWith('{')) {
        _crumb  = crumb;
        _cookie = cookie;
        _authTs = Date.now();
      }
    }
  } catch {
    /* crumb 없이 진행 */
  }
}

// ── Yahoo Finance v10/quoteSummary fetch ──────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchSummary(ticker: string): Promise<any | null> {
  // 캐시 확인
  const cached = RCACHE.get(ticker);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.d;

  await ensureCrumb();

  const modules = [
    'financialData',
    'defaultKeyStatistics',
    'summaryDetail',
    'assetProfile',
    'balanceSheetHistoryQuarterly',
    'balanceSheetHistory',       // 연간 재무상태표 (분기 없을 때 폴백)
    'incomeStatementHistory',    // 연간 손익계산서 (순이익·EPS 폴백)
  ].join(',');

  const crumbQ = _crumb ? `&crumb=${encodeURIComponent(_crumb)}` : '';

  const HOSTS = [
    'https://query1.finance.yahoo.com',
    'https://query2.finance.yahoo.com',
  ];

  for (const host of HOSTS) {
    try {
      const url = `${host}/v10/finance/quoteSummary/${encodeURIComponent(
        ticker
      )}?modules=${modules}${crumbQ}`;

      // Record<string,string> 으로 명시해야 HeadersInit 타입 오류 없음
      const reqHeaders: Record<string, string> = {
        'User-Agent': UA,
        Accept: 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://finance.yahoo.com/',
      };
      if (_cookie) reqHeaders['Cookie'] = _cookie;

      const res = await fetch(url, {
        headers: reqHeaders,
        cache: 'no-store',
        signal: AbortSignal.timeout(9000),
      });

      if (!res.ok) {
        // 인증 만료 → 다음 요청 시 재취득
        if (res.status === 401 || res.status === 403) _authTs = 0;
        continue;
      }

      const json = await res.json();
      const result = json?.quoteSummary?.result?.[0];
      if (result) {
        RCACHE.set(ticker, { d: result, ts: Date.now() });
        return result;
      }
    } catch { /* 다음 host 시도 */ }
  }
  return null;
}

// ── 안전한 raw number 추출 ─────────────────────────────────────────────────
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

// ── GET handler ────────────────────────────────────────────────────────────
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
      const d = await fetchSummary(ticker);
      if (!d) return null;

      const pr  = d.price               ?? {};
      const fd  = d.financialData        ?? {};
      const ks  = d.defaultKeyStatistics ?? {};
      const sd  = d.summaryDetail        ?? {};
      const ap  = d.assetProfile         ?? {};
      // 분기 재무상태표 → 없으면 연간 폴백
      const bs0 =
        d.balanceSheetHistoryQuarterly?.balanceSheetStatements?.[0] ??
        d.balanceSheetHistory?.balanceSheetStatements?.[0] ??
        {};
      // 연간 손익계산서 (순이익·EPS 폴백용)
      const is0 = d.incomeStatementHistory?.incomeStatementHistory?.[0] ?? {};

      const name: string =
        str(pr, 'longName')  ??
        str(pr, 'shortName') ??
        str(ap, 'longName')  ??
        str(sd, 'longName')  ??
        ticker;
      const currency: string =
        str(pr, 'currency') ??
        (ticker.endsWith('.KS') || ticker.endsWith('.KQ') ? 'KRW' : 'USD');
      const marketCap =
        raw(pr, 'marketCap', 'raw') ?? raw(sd, 'marketCap', 'raw');
      const sector   = str(ap, 'sector');
      const industry = str(ap, 'industry');

      // ── 재무 지표 (소수 → 퍼센트 변환) ──
      const roe        = pct(raw(fd, 'returnOnEquity',   'raw'));
      const opMargin   = pct(raw(fd, 'operatingMargins', 'raw'));
      const fcf        = raw(fd, 'freeCashflow', 'raw');
      const revGrowth  = pct(raw(fd, 'revenueGrowth',    'raw'));
      // 순이익: 4단계 폴백 (한국 주식은 경로마다 null 케이스 다름)
      const netInc =
        raw(fd, 'netIncomeToCommon', 'raw') ??           // financialData
        raw(ks, 'netIncomeToCommon', 'raw') ??           // defaultKeyStatistics
        raw(is0, 'netIncome', 'raw') ??                   // incomeStatementHistory
        raw(is0, 'netIncomeApplicableToCommonShares', 'raw'); // 일부 종목 대체 필드

      // 부채비율: financialData.debtToEquity 직접 사용 (Yahoo Finance가 안정적으로 제공)
      // 값은 이미 % 단위 (예: D/E 1.5 → 150.0). balanceSheetHistory는 한국 주식에서 누락됨
      const debtRatioFD = raw(fd, 'debtToEquity', 'raw'); // %단위 D/E
      // balanceSheetHistory 폴백 (미국 주식 등 제공되는 경우)
      const totLiab = raw(bs0, 'totalLiab', 'raw');
      const totEq   = raw(bs0, 'totalStockholderEquity', 'raw');
      const debtRatioBs =
        totLiab != null && totEq != null && totEq > 0
          ? Math.round((totLiab / totEq) * 1000) / 10
          : null;
      const debtRatio = debtRatioFD != null
        ? Math.round(debtRatioFD * 10) / 10
        : debtRatioBs;

      // PER / PEG / fwdPE
      // 한국 주식은 trailingPE 미제공 → 시가총액/순이익으로 근사 계산
      const perRaw   =
        raw(ks, 'trailingPE', 'raw') ??
        raw(sd, 'trailingPE', 'raw') ??
        (marketCap != null && netInc != null && netInc > 0
          ? marketCap / netInc
          : null);
      const fwdPERaw = raw(ks, 'forwardPE',  'raw') ?? raw(sd, 'forwardPE',  'raw');
      const pegRaw   = raw(ks, 'pegRatio',   'raw');
      const per   = perRaw   != null ? Math.round(perRaw   * 10) / 10 : null;
      const fwdPE = fwdPERaw != null ? Math.round(fwdPERaw * 10) / 10 : null;
      const peg   = pegRaw   != null ? Math.round(pegRaw   * 100) / 100 : null;

      // ── 버핏 7가지 기준 ────────────────────────────────
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
      };
    })
  );

  const results = settled
    .filter((r) => r.status === 'fulfilled' && r.value !== null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r) => (r as PromiseFulfilledResult<any>).value);

  // 모두 실패했을 때 → 클라이언트에 명시적 오류 전달
  if (results.length === 0) {
    return NextResponse.json(
      { error: 'Yahoo Finance에서 데이터를 가져올 수 없습니다. 잠시 후 재시도해주세요.' },
      { status: 502 }
    );
  }

  return NextResponse.json(results);
}
