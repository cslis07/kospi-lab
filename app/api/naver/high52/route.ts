import { NextResponse } from 'next/server';
import { withCdn } from '@/lib/cdn';
import { numOf } from '@/lib/stockInsight';

/**
 * 52주 신고가·신저가 종목 — ?kind=high|low &market=KOSPI|KOSDAQ (네이버 모바일 stocks 목록, 무키).
 * 참고: 알파스퀘어 특징종목 · 증권플러스 신고가 알림 · 아이투자. ETF·ETN 은 빼고 일반 주식만(우선주·스팩은 포함).
 */
export const preferredRegion = 'icn1';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://m.stock.naver.com/',
  'Accept': 'application/json',
};

async function handler(req: Request) {
  const sp = new URL(req.url).searchParams;
  const kind = sp.get('kind') === 'low' ? 'low' : 'high';
  const market = sp.get('market') === 'KOSDAQ' ? 'KOSDAQ' : 'KOSPI';
  try {
    // 목록의 대부분이 채권형 ETF·ETN 이라(신고가 101개 중 주식 3개인 날도 있음) 일반 주식만 남긴다 — 그래서 전체를 받아 직접 센다(최대 300개)
    const all: Record<string, unknown>[] = [];
    for (let page = 1; page <= 3; page++) {
      const res = await fetch(`https://m.stock.naver.com/api/stocks/${kind}52week/${market}?page=${page}&pageSize=100`, { headers: HEADERS, cache: 'no-store', signal: AbortSignal.timeout(9000) });
      if (!res.ok) { if (page === 1) throw new Error(`stocks ${res.status}`); break; }
      const d = await res.json() as { totalCount?: number; stocks?: Record<string, unknown>[] };
      all.push(...(d.stocks ?? []));
      if (all.length >= (d.totalCount ?? 0) || !(d.stocks ?? []).length) break;
    }
    const stocks = all.filter((s) => s.stockEndType === 'stock').flatMap((s) => {
      const code = String(s.itemCode ?? '');
      const price = numOf(s.closePrice);
      if (!/^[0-9A-Z]{6}$/.test(code) || price == null) return [];
      return [{ code, name: String(s.stockName ?? code), price, changeRate: numOf(s.fluctuationsRatio) ?? 0,
        tradingValueEok: Math.round((numOf(s.accumulatedTradingValueRaw) ?? 0) / 1e8), marketCapEok: Math.round((numOf(s.marketValueRaw) ?? 0) / 1e8) }];
    });
    return NextResponse.json({ kind, market, total: stocks.length, stocks: stocks.slice(0, 30), asOf: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

export const GET = withCdn(handler, 30, 300);
