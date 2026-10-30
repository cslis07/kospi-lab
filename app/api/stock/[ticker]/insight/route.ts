import { NextRequest, NextResponse } from 'next/server';
import { withCdn } from '@/lib/cdn';
import { parseInsight } from '@/lib/stockInsight';

/** 종목 투자 지표 · 목표주가 컨센서스 · 동종업계 · 최근 리포트(네이버 모바일 integration 1회 호출) */
export const preferredRegion = 'icn1';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://m.stock.naver.com/',
  'Accept': 'application/json',
};

async function handler(_req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const code = (await params).ticker.replace(/\.(KS|KQ)$/, '');
  if (!/^[0-9A-Z]{6}$/.test(code)) return NextResponse.json({ error: 'bad code' }, { status: 400 });
  try {
    const res = await fetch(`https://m.stock.naver.com/api/stock/${code}/integration`, { headers: HEADERS, cache: 'no-store', signal: AbortSignal.timeout(9000) });
    if (!res.ok) throw new Error(`integration ${res.status}`);
    return NextResponse.json(parseInsight(await res.json()));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

// 지표·컨센서스는 하루 몇 번 바뀜, 동종업계 시세는 1분 지연 허용
export const GET = withCdn(handler, 60, 3600);
