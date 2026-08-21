// BTC·ETH 현물 ETF 일별 순유입 (SoSoValue, 무키) — 단독 조회용
import { NextResponse } from 'next/server';
import { getEtfFlows } from '@/lib/etfFlow';

export const maxDuration = 15;
export const revalidate = 1800;

export async function GET() {
  try {
    const flows = await getEtfFlows();
    return NextResponse.json({ ts: Date.now(), btc: flows.BTC, eth: flows.ETH, source: 'SoSoValue' }, {
      headers: { 'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600' },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
