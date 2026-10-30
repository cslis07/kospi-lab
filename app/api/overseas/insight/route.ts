import { NextResponse } from 'next/server';
import { withCdn } from '@/lib/cdn';
import { parseOverseasInsight } from '@/lib/stockInsight';
import { NAVER_WORLD_HEADERS, resolveReuters, isSymbol } from '@/lib/naverWorld';

/** 해외 종목 애널리스트 목표주가(평균·최고·최저) · 기업 개요 · 동종업계 — 네이버 worldstock integration. ?symbol=AAPL */
export const preferredRegion = 'icn1';

async function handler(req: Request) {
  const symbol = new URL(req.url).searchParams.get('symbol') ?? '';
  if (!isSymbol(symbol)) return NextResponse.json({ error: 'bad symbol' }, { status: 400 });
  try {
    const code = await resolveReuters(symbol);
    if (!code) return NextResponse.json({ consensus: null, overview: null, peers: [] });
    const res = await fetch(`https://api.stock.naver.com/stock/${encodeURIComponent(code)}/integration`, { headers: NAVER_WORLD_HEADERS, next: { revalidate: 600 }, signal: AbortSignal.timeout(9000) });
    if (!res.ok) throw new Error(`integration ${res.status}`);
    return NextResponse.json(parseOverseasInsight(await res.json()));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

export const GET = withCdn(handler, 300, 3600);
