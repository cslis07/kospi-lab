import { NextResponse } from 'next/server';
import { rankKrStocks, rankUsStocks, rankKrEtfs, rankCoins, naverCache, type RankTab } from '@/lib/naverStock';

/**
 * 실시간 랭킹 — ?tab=value|popular|up|down|cap|volume &coin=UPBIT|BITHUMB
 * 국내 주식 · 미국 주식 · 국내 ETF · 가상자산 4열을 한 번에(각 10위).
 */
export const preferredRegion = 'icn1';
export const dynamic = 'force-dynamic';

const TABS: RankTab[] = ['value', 'popular', 'up', 'down', 'cap', 'volume'];

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const tab = (TABS.includes(sp.get('tab') as RankTab) ? sp.get('tab') : 'value') as RankTab;
  const coin = sp.get('coin') === 'BITHUMB' ? 'BITHUMB' : 'UPBIT';
  const [kr, us, etf, crypto] = await Promise.all([rankKrStocks(tab), rankUsStocks(tab), rankKrEtfs(tab), rankCoins(tab, coin)]);
  return NextResponse.json({ tab, coin, kr, us, etf, crypto, asOf: new Date().toISOString() },
    { headers: naverCache('ranking', !kr.length && !us.length && !etf.length && !crypto.length, 's-maxage=5') });
}
