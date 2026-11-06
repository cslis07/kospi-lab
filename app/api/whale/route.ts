// 온체인 고래 추적 (무료·무키) — Binance가 US IP를 차단하므로 서울 리전에서 실행
import { NextResponse } from 'next/server';
import { getWhaleFeed } from '@/lib/whaleTracker';

export const maxDuration = 20;
export const preferredRegion = 'icn1';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const feed = await getWhaleFeed();
    // swr 120 → 3600: 3분 방문이 없으면 콜드(11~14초)였다 — 만료 후 1시간은 직전 값을 즉시 주고 뒤에서 갱신
    return NextResponse.json(feed, { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=3600' } });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
