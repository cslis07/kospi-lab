import { NextRequest, NextResponse } from 'next/server';
import { fetchDartDividends } from '@/lib/dartClient';

export async function GET(req: NextRequest) {
  if (!process.env.DART_API_KEY) {
    return NextResponse.json(
      { error: 'DART_API_KEY 환경변수가 설정되지 않았습니다. Vercel 환경변수에 DART_API_KEY를 추가하세요.' },
      { status: 503 }
    );
  }

  const code    = req.nextUrl.searchParams.get('code') ?? '';
  const yearStr = req.nextUrl.searchParams.get('year');

  if (!code) {
    return NextResponse.json({ error: 'code 파라미터가 필요합니다' }, { status: 400 });
  }

  const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear() - 1;
  if (isNaN(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: '유효하지 않은 연도입니다' }, { status: 400 });
  }

  const dividends = await fetchDartDividends(code, year);
  if (!dividends) {
    return NextResponse.json({ error: '배당 데이터를 찾을 수 없습니다' }, { status: 404 });
  }

  return NextResponse.json(dividends, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
