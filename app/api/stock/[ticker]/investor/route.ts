import { NextRequest, NextResponse } from 'next/server';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://m.stock.naver.com/',
  'Accept': 'application/json',
};

// "+5,183,205" / "-3,377,992" → 5183205 / -3377992
function num(s: unknown): number {
  if (s == null) return 0;
  const n = Number(String(s).replace(/,/g, '').replace(/[+\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// "20260701" → "2026-07-01"
function fmtDate(s: string): string {
  const d = String(s ?? '');
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;

  try {
    // 네이버 투자자별 매매동향 (순매수 수량 기준)
    const res = await fetch(
      `https://m.stock.naver.com/api/stock/${ticker}/trend`,
      { headers: HEADERS, next: { revalidate: 60 } }
    );
    if (!res.ok) throw new Error(`investor API ${res.status}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = await res.json();
    if (!Array.isArray(raw)) throw new Error('investor API bad shape');

    // 최근 5일
    const data = raw.slice(0, 5).map((row) => ({
      date:        fmtDate(row.bizdate ?? row.localTradedAt ?? ''),
      individual:  num(row.individualPureBuyQuant),
      foreign:     num(row.foreignerPureBuyQuant),
      institution: num(row.organPureBuyQuant),
    }));

    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
