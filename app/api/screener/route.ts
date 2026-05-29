import { NextRequest, NextResponse } from 'next/server';

const HOSTS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com',
];

async function fetchSummary(ticker: string) {
  const modules = [
    'price',
    'financialData',
    'defaultKeyStatistics',
    'summaryDetail',
    'balanceSheetHistoryQuarterly',
    'assetProfile',
  ].join(',');

  for (const host of HOSTS) {
    try {
      const res = await fetch(
        `${host}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}`,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          next: { revalidate: 3600 }, // cache 1h — financial data doesn't change minute-to-minute
          signal: AbortSignal.timeout(8000),
        }
      );
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.quoteSummary?.result?.[0];
      if (result) return result;
    } catch { /* try next host */ }
  }
  return null;
}

// Safe deep-get for Yahoo's {raw, fmt} value objects
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
  return typeof cur === 'string' ? cur : null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tickers = (searchParams.get('tickers') ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
  const market = (searchParams.get('market') ?? 'US') as 'KR' | 'US';

  if (!tickers.length) {
    return NextResponse.json({ error: 'tickers required' }, { status: 400 });
  }

  // ROE threshold differs by market
  const roeMin = market === 'KR' ? 10 : 15;

  const settled = await Promise.allSettled(
    tickers.map(async (ticker) => {
      const d = await fetchSummary(ticker);
      if (!d) return null;

      const pr  = d.price ?? {};
      const fd  = d.financialData ?? {};
      const ks  = d.defaultKeyStatistics ?? {};
      const sd  = d.summaryDetail ?? {};
      const ap  = d.assetProfile ?? {};
      const bs0 = d.balanceSheetHistoryQuarterly?.balanceSheetStatements?.[0] ?? {};

      const name: string =
        str(pr, 'longName') ?? str(pr, 'shortName') ?? str(ap, 'longName') ?? ticker;
      const currency: string =
        str(pr, 'currency') ??
        (ticker.endsWith('.KS') || ticker.endsWith('.KQ') ? 'KRW' : 'USD');
      const marketCap = raw(pr, 'marketCap', 'raw') ?? raw(sd, 'marketCap', 'raw');
      const sector    = str(ap, 'sector');
      const industry  = str(ap, 'industry');

      // ── financial metrics ──────────────────────────────
      const roeRaw    = raw(fd, 'returnOnEquity', 'raw');
      const marginRaw = raw(fd, 'operatingMargins', 'raw');
      const fcf       = raw(fd, 'freeCashflow', 'raw');
      const revGrRaw  = raw(fd, 'revenueGrowth', 'raw');
      const netInc    = raw(fd, 'netIncomeToCommon', 'raw');
      const totLiab   = raw(bs0, 'totalLiab', 'raw');
      const totEq     = raw(bs0, 'totalStockholderEquity', 'raw');

      // Convert decimals → percentages, round to 1dp
      const roe           = roeRaw    != null ? Math.round(roeRaw    * 1000) / 10 : null;
      const opMargin      = marginRaw != null ? Math.round(marginRaw * 1000) / 10 : null;
      const revenueGrowth = revGrRaw  != null ? Math.round(revGrRaw  * 1000) / 10 : null;
      const debtRatio     =
        totLiab != null && totEq != null && totEq > 0
          ? Math.round((totLiab / totEq) * 1000) / 10
          : null;

      // PER / PEG / Forward PE
      const per   = raw(ks, 'trailingPE', 'raw') ?? raw(sd, 'trailingPE', 'raw');
      const peg   = raw(ks, 'pegRatio', 'raw');
      const fwdPE = raw(ks, 'forwardPE', 'raw') ?? raw(sd, 'forwardPE', 'raw');

      // ── 7 Buffett criteria ─────────────────────────────
      const details = {
        roe:    roe       != null ? roe    >= roeMin         : null,
        margin: opMargin  != null ? opMargin >= 15           : null,
        fcf:    fcf       != null ? fcf    >  0              : null,
        debt:   debtRatio != null ? debtRatio < 100          : null,
        growth: revenueGrowth != null ? revenueGrowth > 0   : null,
        per:    per       != null ? per > 0 && per < 35      : null,
        profit: netInc    != null ? netInc  >  0             : null,
      };

      return {
        ticker, name, currency, marketCap, sector, industry,
        per:   per   != null ? Math.round(per   * 10) / 10 : null,
        peg:   peg   != null ? Math.round(peg   * 100) / 100 : null,
        fwdPE: fwdPE != null ? Math.round(fwdPE * 10) / 10 : null,
        roe, opMargin, fcf, debtRatio, revenueGrowth, netInc,
        buffettScore:   Object.values(details).filter((v) => v === true).length,
        buffettDetails: details,
      };
    })
  );

  const results = settled
    .filter((r) => r.status === 'fulfilled' && r.value !== null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r) => (r as PromiseFulfilledResult<any>).value);

  return NextResponse.json(results);
}
