import { NextRequest, NextResponse } from 'next/server';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickName(q: any): string {
  return (q.shortname ?? q.longname ?? q.symbol ?? '') as string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query  = (searchParams.get('q') ?? '').trim();
  const market = searchParams.get('market') ?? 'KR';

  if (!query) return NextResponse.json([]);

  const HOSTS = [
    'https://query1.finance.yahoo.com',
    'https://query2.finance.yahoo.com',
  ];

  for (const host of HOSTS) {
    try {
      const url =
        `${host}/v1/finance/search` +
        `?q=${encodeURIComponent(query)}` +
        `&lang=${market === 'KR' ? 'ko-KR' : 'en-US'}` +
        `&region=${market === 'KR' ? 'KR' : 'US'}` +
        `&quotesCount=8&newsCount=0&enableFuzzyQuery=true` +
        `&quotesQueryId=tss_match_phrase_query`;

      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'application/json',
          'Accept-Language': market === 'KR' ? 'ko-KR,ko;q=0.9' : 'en-US,en;q=0.9',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) continue;

      const json = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const quotes: any[] = json?.quotes ?? [];

      // KR: .KS / .KQ / KSC / KOE 거래소만 허용
      // US: 점(.)이 없는 순수 미국 티커, EQUITY 타입만
      const filtered = market === 'KR'
        ? quotes.filter((q) =>
            q.quoteType === 'EQUITY' &&
            (q.symbol?.endsWith('.KS') || q.symbol?.endsWith('.KQ') ||
             q.exchange === 'KSC'     || q.exchange === 'KOE')
          )
        : quotes.filter((q) =>
            q.quoteType === 'EQUITY' && !String(q.symbol ?? '').includes('.')
          );

      return NextResponse.json(
        filtered.slice(0, 6).map((q) => ({
          ticker: q.symbol as string,
          name:   pickName(q),
        }))
      );
    } catch { /* next host */ }
  }

  return NextResponse.json([]);
}
