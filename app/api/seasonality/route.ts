import { NextResponse } from 'next/server';
import { withCdn } from '@/lib/cdn';
import { monthlyCloses, seasonality } from '@/lib/seasonality';

/** 계절성 — ?asset=kospi|kosdaq|sp500|nasdaq|btc · Yahoo 월봉(최대 20년, 무키) → 연도×월 수익률·월별 통계 */
const ASSETS: Record<string, { symbol: string; name: string }> = {
  kospi: { symbol: '^KS11', name: '코스피' },
  kosdaq: { symbol: '^KQ11', name: '코스닥' },
  sp500: { symbol: '^GSPC', name: 'S&P 500' },
  nasdaq: { symbol: '^IXIC', name: '나스닥' },
  btc: { symbol: 'BTC-USD', name: '비트코인' },
};

async function handler(req: Request) {
  const key = new URL(req.url).searchParams.get('asset') ?? 'kospi';
  const a = ASSETS[key];
  if (!a) return NextResponse.json({ error: 'bad asset' }, { status: 400 });
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(a.symbol)}?interval=1mo&range=20y`;
  try {
    let res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 3600 }, signal: AbortSignal.timeout(9000) });
    if (!res.ok) res = await fetch(url.replace('query1', 'query2'), { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 3600 }, signal: AbortSignal.timeout(9000) });
    if (!res.ok) throw new Error(`yahoo ${res.status}`);
    const j = await res.json() as { chart?: { result?: { meta?: { gmtoffset?: number }; timestamp?: number[]; indicators?: { adjclose?: { adjclose?: (number | null)[] }[]; quote?: { close?: (number | null)[] }[] } }[] } };
    const r = j.chart?.result?.[0];
    const closes = r?.indicators?.adjclose?.[0]?.adjclose ?? r?.indicators?.quote?.[0]?.close ?? [];
    const s = seasonality(monthlyCloses(r?.timestamp ?? [], closes, r?.meta?.gmtoffset ?? 0), new Date());
    return NextResponse.json({ asset: key, name: a.name, ...s });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

// 월봉이라 하루 몇 번이면 충분
export const GET = withCdn(handler, 3600, 86400);
