// 현물 ETF 일별 순유입 원본 행(최근 1개월) — etf-archive.yml 이 매일 받아 etf-data 브랜치에 누적한다.
import { NextResponse } from 'next/server';
import { fetchEtfRows } from '@/lib/etfFlow';

export const maxDuration = 15;
export const revalidate = 0;

export async function GET() {
  const [BTC, ETH] = await Promise.all([fetchEtfRows('BTC').catch(() => null), fetchEtfRows('ETH').catch(() => null)]);
  const ok = !!(BTC?.length && ETH?.length);
  return NextResponse.json({ ts: Date.now(), BTC: BTC ?? [], ETH: ETH ?? [], source: 'SoSoValue' }, {
    status: ok ? 200 : 502,
    headers: { 'Cache-Control': ok ? 's-maxage=1800, stale-while-revalidate=3600' : 'no-store' },
  });
}
