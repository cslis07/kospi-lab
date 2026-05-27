import { NextRequest, NextResponse } from 'next/server';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://finance.naver.com',
  'Accept': 'application/json',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;

  try {
    // 네이버 투자자별 매매동향
    const res = await fetch(
      `https://m.stock.naver.com/api/stock/${ticker}/investorTrend?timeframe=day`,
      { headers: HEADERS, next: { revalidate: 60 } }
    );
    if (!res.ok) throw new Error(`investor API ${res.status}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = await res.json();

    // 최근 5일 데이터 파싱
    const data = raw.slice(0, 5).map((row) => ({
      date:        String(row.localTradedAt ?? row.date ?? '').slice(0, 10),
      individual:  Number(row.individual?.tradeVolume ?? row.individualStraightPurchasePrice ?? 0),
      foreign:     Number(row.foreigner?.tradeVolume  ?? row.foreignerStraightPurchasePrice  ?? 0),
      institution: Number(row.institution?.tradeVolume ?? row.institutionStraightPurchasePrice ?? 0),
    }));

    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
