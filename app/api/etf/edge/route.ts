// 현물 ETF 순유입 과거 통계 — 큰 유입·유출 다음 날 BTC·ETH(판정 기준은 lib/briefEdge 와 같은 사전 고정 규칙)
import { NextResponse } from 'next/server';
import { getEtfEdge } from '@/lib/etfEdge';

export const maxDuration = 20;
export const revalidate = 0;

export async function GET() {
  try {
    const data = await getEtfEdge();
    return NextResponse.json(data, { headers: { 'Cache-Control': 's-maxage=21600, stale-while-revalidate=86400' } });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
