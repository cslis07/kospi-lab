import { NextRequest, NextResponse } from 'next/server';

const DART_KEY = process.env.DART_API_KEY ?? '';

export async function GET(req: NextRequest) {
  if (!DART_KEY) {
    return NextResponse.json(
      { error: 'DART_API_KEY 환경변수가 설정되지 않았습니다. Vercel 환경변수에 DART_API_KEY를 추가하세요.' },
      { status: 503 }
    );
  }

  const ticker = req.nextUrl.searchParams.get('ticker') ?? '';
  const days   = parseInt(req.nextUrl.searchParams.get('days') ?? '30');

  const end   = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

  try {
    const baseUrl = 'https://opendart.fss.or.kr/api';

    // 종목코드로 공시 목록 조회
    const params = new URLSearchParams({
      crtfc_key: DART_KEY,
      bgn_de:    fmt(start),
      end_de:    fmt(end),
      sort:      'date',
      sort_mth:  'desc',
      page_no:   '1',
      page_count: '20',
    });
    if (ticker) params.set('stock_code', ticker);

    const res = await fetch(`${baseUrl}/list.json?${params}`, {
      next: { revalidate: 300 }
    });
    if (!res.ok) throw new Error(`DART ${res.status}`);

    const data = await res.json();
    if (data.status !== '000') throw new Error(data.message ?? 'DART 오류');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = (data.list ?? []).map((d: any) => ({
      rcpNo:    d.rcept_no,
      corpName: d.corp_name,
      ticker:   d.stock_code,
      type:     d.report_nm,
      date:     d.rcept_dt,   // YYYYMMDD
      url:      `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${d.rcept_no}`,
    }));

    return NextResponse.json(list);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
