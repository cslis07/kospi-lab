/**
 * 테더(USDT) 원화 가격 — 업비트 KRW-USDT 현재가(공개 API, 키 없음).
 * 복기 대시보드의 USDT 금액 옆 원화 환산용. 실제 환전가와는 다를 수 있다(화면에 '업비트 테더 시세 기준' 표기).
 * 업비트가 실패하면 { price: null } — 화면은 원화 줄만 숨긴다.
 */
import { NextResponse } from 'next/server';

export async function GET() {
  let price: number | null = null;
  let ts: number | null = null;
  try {
    const res = await fetch('https://api.upbit.com/v1/ticker?markets=KRW-USDT', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    const arr = await res.json();
    const t = Array.isArray(arr) ? arr[0] : null;
    if (t && Number(t.trade_price) > 0) { price = Number(t.trade_price); ts = Number(t.trade_timestamp) || Date.now(); }
  } catch { /* 업비트 실패 — null */ }
  return NextResponse.json({ price, ts, source: 'upbit KRW-USDT' }, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  });
}
