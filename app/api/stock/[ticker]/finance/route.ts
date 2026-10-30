import { NextRequest, NextResponse } from 'next/server';
import { withCdn } from '@/lib/cdn';
import { parseFinance } from '@/lib/stockFinance';

/** 국내 종목 실적 추이(분기·연간, 증권사 추정치 포함) — 네이버 모바일 finance. ?period=quarter|annual */
export const preferredRegion = 'icn1';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://m.stock.naver.com/',
  'Accept': 'application/json',
};

async function handler(req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const code = (await params).ticker.replace(/\.(KS|KQ)$/, '');
  if (!/^[0-9A-Z]{6}$/.test(code)) return NextResponse.json({ error: 'bad code' }, { status: 400 });
  const annual = new URL(req.url).searchParams.get('period') === 'annual';
  try {
    const res = await fetch(`https://m.stock.naver.com/api/stock/${code}/finance/${annual ? 'annual' : 'quarter'}`, { headers: HEADERS, next: { revalidate: 3600 }, signal: AbortSignal.timeout(9000) });
    if (!res.ok) throw new Error(`finance ${res.status}`);
    return NextResponse.json(parseFinance(await res.json(), annual));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

// 실적·추정치는 하루 몇 번 바뀜
export const GET = withCdn(handler, 3600, 86400);
