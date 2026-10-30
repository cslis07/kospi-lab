import { NextResponse } from 'next/server';
import { withCdn } from '@/lib/cdn';
import { parseOverseasInsight, reutersCandidates } from '@/lib/stockInsight';

/** 해외 종목 애널리스트 목표주가(평균·최고·최저) · 기업 개요 · 동종업계 — 네이버 worldstock integration. ?symbol=AAPL */
export const preferredRegion = 'icn1';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://m.stock.naver.com/',
  'Accept': 'application/json',
};

/** 티커가 네이버에서 어떤 로이터 코드인지(없는 코드는 409) — 하루 캐시 */
async function resolve(symbol: string): Promise<string | null> {
  for (const code of reutersCandidates(symbol)) {
    const r = await fetch(`https://api.stock.naver.com/stock/${encodeURIComponent(code)}/basic`, { headers: HEADERS, next: { revalidate: 86400 }, signal: AbortSignal.timeout(6000) }).catch(() => null);
    if (r?.ok) return code;
  }
  return null;
}

async function handler(req: Request) {
  const symbol = new URL(req.url).searchParams.get('symbol') ?? '';
  if (!/^[A-Za-z0-9.\-]{1,12}$/.test(symbol)) return NextResponse.json({ error: 'bad symbol' }, { status: 400 });
  try {
    const code = await resolve(symbol);
    if (!code) return NextResponse.json({ consensus: null, overview: null, peers: [] });
    const res = await fetch(`https://api.stock.naver.com/stock/${encodeURIComponent(code)}/integration`, { headers: HEADERS, next: { revalidate: 600 }, signal: AbortSignal.timeout(9000) });
    if (!res.ok) throw new Error(`integration ${res.status}`);
    return NextResponse.json(parseOverseasInsight(await res.json()));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

export const GET = withCdn(handler, 300, 3600);
