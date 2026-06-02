import { NextRequest, NextResponse } from 'next/server';
import { fetchDartShareholders } from '@/lib/dartClient';

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

  const shareholders = await fetchDartShareholders(code, year);

  return NextResponse.json(shareholders, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
