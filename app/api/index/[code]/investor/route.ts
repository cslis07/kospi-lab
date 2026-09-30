import { NextRequest, NextResponse } from 'next/server';

/**
 * 지수 전체 투자자 순매수(억원) — 외국인·기관·개인. 네이버(무키).
 * m.stock.naver.com/api/index/{KOSPI|KOSDAQ}/trend → { personalValue, foreignValue, institutionalValue } (문자열, 억원).
 */
export const revalidate = 120;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  Referer: 'https://m.stock.naver.com/',
  Accept: 'application/json',
};

// "+426" / "-3,578" → 426 / -3578 (억원)
function num(s: unknown): number {
  if (s == null) return 0;
  const n = Number(String(s).replace(/,/g, '').replace(/[+\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function fmtDate(s: string): string {
  const d = String(s ?? '');
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const idx = code?.toUpperCase() === 'KOSDAQ' ? 'KOSDAQ' : 'KOSPI';
  try {
    const res = await fetch(`https://m.stock.naver.com/api/index/${idx}/trend`, {
      headers: HEADERS, next: { revalidate: 120 }, signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`trend ${res.status}`);
    const raw = await res.json();
    return NextResponse.json(
      {
        code: idx,
        date: fmtDate(raw.bizdate ?? ''),
        foreign: num(raw.foreignValue),
        institution: num(raw.institutionalValue),
        individual: num(raw.personalValue),
      },
      { headers: { 'Cache-Control': 's-maxage=120, stale-while-revalidate=600' } },
    );
  } catch (e) {
    return NextResponse.json({ code: idx, error: String(e) }, { status: 502 });
  }
}
