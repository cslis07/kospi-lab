import { NextRequest, NextResponse } from 'next/server';
import { fetchDartCompany } from '@/lib/dartClient';

export async function GET(req: NextRequest) {
  if (!process.env.DART_API_KEY) {
    return NextResponse.json(
      { error: 'DART_API_KEY 환경변수가 설정되지 않았습니다. Vercel 환경변수에 DART_API_KEY를 추가하세요.' },
      { status: 503 }
    );
  }

  const code = req.nextUrl.searchParams.get('code') ?? '';
  if (!code) {
    return NextResponse.json({ error: 'code 파라미터가 필요합니다' }, { status: 400 });
  }

  const company = await fetchDartCompany(code);
  if (!company) {
    return NextResponse.json({ error: '기업 정보를 찾을 수 없습니다' }, { status: 404 });
  }

  return NextResponse.json(company, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
