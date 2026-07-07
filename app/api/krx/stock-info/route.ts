/**
 * KRX 종목 기본정보 (상장주식수·액면가·소속부·상장일)
 * GET /api/krx/stock-info?code=005930
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchKrxStockInfo, hasKrxKey } from '@/lib/krx';

export const revalidate = 3600;

export async function GET(req: NextRequest) {
  if (!hasKrxKey()) return NextResponse.json({ configured: false });
  const code = req.nextUrl.searchParams.get('code') ?? '';
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });
  try {
    const info = await fetchKrxStockInfo(code);
    if (!info) return NextResponse.json({ configured: true, found: false });
    return NextResponse.json({ configured: true, found: true, info });
  } catch (e) {
    return NextResponse.json({ configured: true, error: String(e) }, { status: 502 });
  }
}
