import { NextRequest, NextResponse } from 'next/server';
import type { OverseasStockData } from '@/lib/types';

// Naver Finance는 국내(숫자코드)와 해외(알파벳) 종목을 동일 엔드포인트로 제공
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://finance.naver.com',
  'Accept': 'application/json',
};

function parseNum(s: unknown): number {
  return parseFloat(String(s ?? 0).replace(/[,+%\s]/g, '')) || 0;
}

function fmtCap(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return n ? `$${n.toLocaleString()}` : '-';
}

async function fetchOne(symbol: string): Promise<OverseasStockData> {
  const [basicRes, integRes] = await Promise.all([
    fetch(`https://m.stock.naver.com/api/stock/${symbol}/basic`,
      { headers: HEADERS, next: { revalidate: 0 } }),
    fetch(`https://m.stock.naver.com/api/stock/${symbol}/integration`,
      { headers: HEADERS, next: { revalidate: 0 } }),
  ]);

  if (!basicRes.ok) throw new Error(`${symbol} basic ${basicRes.status}`);
  const basic = await basicRes.json();
  const integ  = integRes.ok ? await integRes.json() : {};

  const infos: { key: string; value: string }[] = integ.totalInfos ?? [];
  const get = (k: string) => infos.find((i) => i.key === k)?.value ?? '';

  const price     = parseNum(basic.closePrice);
  const change    = parseNum(basic.compareToPreviousClosePrice);
  const changeRate = parseNum(basic.fluctuationsRatio);

  // 거래량: 해외 종목도 동일 키 사용
  const volRaw  = get('거래량');
  const volume  = volRaw ? parseNum(volRaw) : 0;

  // 시총: 해외는 단위가 USD
  const capRaw  = get('시총') || get('시가총액');
  const marketCapFmt = capRaw || fmtCap(0);

  // 52주 고저
  const h52 = get('52주 최고');
  const l52 = get('52주 최저');

  // 환전소: NASDAQ·NYSE 등 영문명 그대로 반환
  const exchange = basic.stockExchangeType?.name ?? 'NASDAQ';

  return {
    symbol,
    name:         basic.stockName ?? symbol,
    price,
    change,
    changeRate,
    volume,
    marketCap:    0,          // raw 숫자 대신 문자열 포맷 사용
    exchange,
    currency:     basic.stockExchangeType?.nation === 'USA' ? 'USD' : 'USD',
    prevClose:    price > 0 ? price - change : undefined,
    high52w:      h52 ? parseNum(h52) : undefined,
    low52w:       l52 ? parseNum(l52) : undefined,
    // 포맷된 문자열도 함께 전달
    volumeFmt:    volRaw || '-',
    marketCapFmt,
  } as OverseasStockData & { volumeFmt: string; marketCapFmt: string };
}

export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get('symbols') ?? '')
    .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 20);

  if (!symbols.length) return NextResponse.json({});

  const results = await Promise.allSettled(symbols.map(fetchOne));
  const map: Record<string, OverseasStockData> = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') map[symbols[i]] = r.value;
  });

  return NextResponse.json(map);
}
