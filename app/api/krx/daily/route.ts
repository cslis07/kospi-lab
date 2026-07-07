/**
 * KRX 일별매매정보 조회 (특정 종목코드들)
 * 사용법: GET /api/krx/daily?codes=005930,086520
 * 반환:  { "005930": KrxDailyData, ... }
 * 공식 KRX API 키(KRX_API_KEY) 필요 · 키 없으면 빈 객체.
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchKrxDailyMap } from '@/lib/krx';
import type { KrxDailyData } from '@/lib/krx';

// 기존 소비처(screener)가 이 경로에서 타입을 import하므로 재-export
export type { KrxDailyData } from '@/lib/krx';

export async function GET(req: NextRequest) {
  const codes = (req.nextUrl.searchParams.get('codes') ?? '')
    .split(',').map((c) => c.trim()).filter(Boolean);

  if (!codes.length) return NextResponse.json({});

  const { map } = await fetchKrxDailyMap();
  const result: Record<string, KrxDailyData> = {};
  for (const code of codes) {
    const item = map.get(code);
    if (item) result[code] = item;
  }
  return NextResponse.json(result);
}
