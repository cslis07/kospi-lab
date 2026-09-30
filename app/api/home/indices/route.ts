import { NextResponse } from 'next/server';

/**
 * 홈 상단 지수 카드 레일 — 코스피·코스닥·USD·S&P500·나스닥·다우존스.
 * 네이버 차트 API(무키, 로컬·프로덕션 모두 동작)로 최근 30일 종가(미니 스파크) + 현재가·등락을 만든다.
 * USD/KRW 는 차트 소스가 없어 frankfurter(ECB) 최근 2영업일로 값·등락만.
 * 개별 실패는 그 카드만 빈 값(전체는 항상 200).
 */
export const revalidate = 60;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const HEADERS = { 'User-Agent': UA, Referer: 'https://m.stock.naver.com/', Accept: 'application/json' };
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface IndexCard {
  code: string;   // 우리 라우팅용 심볼(투자자 트렌드는 KOSPI/KOSDAQ 만)
  name: string;
  value: number;
  change: number;
  changeRate: number;
  spark: number[];
}

// 네이버 차트: 도메스틱(KOSPI/KOSDAQ) · 포린(.INX/.IXIC/.DJI)
async function fetchNaverIndex(path: string, code: string, name: string): Promise<IndexCard | null> {
  try {
    const res = await fetch(
      `https://api.stock.naver.com/chart/${path}/index/${code}?periodType=dayCandle&count=30`,
      { headers: HEADERS, next: { revalidate: 60 }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const j = await res.json();
    const rows: { closePrice: number }[] = j?.priceInfos ?? [];
    const closes = rows.map((r) => r.closePrice).filter((c) => typeof c === 'number' && c > 0);
    if (closes.length < 2) return null;
    const value = closes[closes.length - 1];
    const prev = closes[closes.length - 2];
    const change = value - prev;
    return { code, name, value: r2(value), change: r2(change), changeRate: r2((change / prev) * 100), spark: closes.map(r2) };
  } catch {
    return null;
  }
}

async function fetchUsd(): Promise<IndexCard | null> {
  try {
    const from = new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10);
    const res = await fetch(`https://api.frankfurter.app/${from}..?from=USD&to=KRW`, {
      next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data: { rates: Record<string, { KRW: number }> } = await res.json();
    const dates = Object.keys(data.rates).sort();
    if (!dates.length) return null;
    const series = dates.map((d) => data.rates[d].KRW);
    const value = series[series.length - 1];
    const prev = series.length >= 2 ? series[series.length - 2] : value;
    const change = value - prev;
    return { code: 'USDKRW', name: '미국 USD', value: r2(value), change: r2(change), changeRate: r2(prev ? (change / prev) * 100 : 0), spark: series.map(r2) };
  } catch {
    return null;
  }
}

export async function GET() {
  const [kospi, kosdaq, sp500, nasdaq, dow, usd] = await Promise.all([
    fetchNaverIndex('domestic', 'KOSPI', '코스피'),
    fetchNaverIndex('domestic', 'KOSDAQ', '코스닥'),
    fetchNaverIndex('foreign', '.INX', 'S&P 500'),
    fetchNaverIndex('foreign', '.IXIC', '나스닥 종합'),
    fetchNaverIndex('foreign', '.DJI', '다우존스'),
    fetchUsd(),
  ]);
  // 참고 이미지 순서: 코스피 · 코스닥 · USD · S&P500 · 나스닥 · 다우존스
  const cards = [kospi, kosdaq, usd, sp500, nasdaq, dow].filter((x): x is IndexCard => !!x);
  return NextResponse.json(
    { cards, asOf: new Date().toISOString() },
    { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } },
  );
}
