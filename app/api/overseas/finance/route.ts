import { NextResponse } from 'next/server';
import { withCdn } from '@/lib/cdn';
import { parseFinance } from '@/lib/stockFinance';
import { NAVER_WORLD_HEADERS, resolveReuters, isSymbol } from '@/lib/naverWorld';

/** 해외 종목 실적 추이(매출·EBIT·순이익) — 네이버 worldstock finance. ?symbol=AAPL&period=quarter|annual */
export const preferredRegion = 'icn1';

async function handler(req: Request) {
  const sp = new URL(req.url).searchParams;
  const symbol = sp.get('symbol') ?? '';
  const annual = sp.get('period') === 'annual';
  if (!isSymbol(symbol)) return NextResponse.json({ error: 'bad symbol' }, { status: 400 });
  try {
    const code = await resolveReuters(symbol);
    if (!code) return NextResponse.json({ unit: 'USD 백만', periods: [] });
    const res = await fetch(`https://api.stock.naver.com/stock/${encodeURIComponent(code)}/finance/${annual ? 'annual' : 'quarter'}`, { headers: NAVER_WORLD_HEADERS, next: { revalidate: 3600 }, signal: AbortSignal.timeout(9000) });
    if (!res.ok) return NextResponse.json({ unit: 'USD 백만', periods: [] });
    return NextResponse.json(parseFinance(await res.json(), annual));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

export const GET = withCdn(handler, 3600, 86400);
