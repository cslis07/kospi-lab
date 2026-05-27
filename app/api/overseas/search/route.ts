import { NextRequest, NextResponse } from 'next/server';
import { searchOverseasList } from '@/lib/overseasList';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

// 거래소 이름 정규화
function normalizeExchange(s: string): string {
  const l = (s ?? '').toLowerCase();
  if (l.includes('nasdaq') || l.includes('nms') || l.includes('ngm') || l.includes('ncm')) return 'NASDAQ';
  if (l.includes('nyse') || l.includes('nys')) return 'NYSE';
  if (l.includes('arcx') || l.includes('arca')) return 'NYSE Arca';
  if (l.includes('bats') || l.includes('cboe')) return 'CBOE';
  return s || 'NASDAQ';
}

interface YahooQuote {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
  exchange?: string;
  typeDisp?: string;
  quoteType?: string;
}

async function fetchYahooSearch(q: string) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&listsCount=0&enableFuzzyQuery=false`;

  let res = await fetch(url, { headers: HEADERS, next: { revalidate: 0 } });
  if (!res.ok) {
    res = await fetch(url.replace('query1', 'query2'), { headers: HEADERS, next: { revalidate: 0 } });
    if (!res.ok) throw new Error(`Yahoo search ${res.status}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  const quotes: YahooQuote[] = data?.quotes ?? [];

  return quotes
    .filter((q) => {
      const t = (q.typeDisp ?? q.quoteType ?? '').toLowerCase();
      // 주식, ETF, ETN 만 포함 (지수·펀드·선물 제외)
      return t === 'equity' || t === 'etf' || t === 'etn' || t === '' ;
    })
    .map((q) => ({
      symbol:   q.symbol,
      name:     q.longname ?? q.shortname ?? q.symbol,
      exchange: normalizeExchange(q.exchDisp ?? q.exchange ?? ''),
    }));
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (!q.trim()) return NextResponse.json([]);

  // 1. Yahoo Finance 동적 검색 (레버리지 ETF 포함 모든 종목)
  try {
    const results = await fetchYahooSearch(q);
    if (results.length > 0) return NextResponse.json(results);
  } catch {
    // Yahoo 실패 시 정적 목록으로 폴백
  }

  // 2. 정적 목록 폴백
  return NextResponse.json(searchOverseasList(q));
}
