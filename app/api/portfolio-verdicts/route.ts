import { NextRequest, NextResponse } from 'next/server';
import { Candle, analyzeTimeframe, srZones, fibonacci, atr } from '@/lib/coinAnalysis';
import { analyzeSupply, buildStockVerdict, InvestorDay } from '@/lib/stockAnalysis';

/**
 * 보유 종목용 경량 룰엔진 판정 — 일봉 + 투자자 수급만으로 stance/score 계산.
 * AI 브리핑·뉴스·공시·매크로는 뺀다(그건 /api/stock-analysis 정밀 분석의 몫).
 * 티커당 10분 캐시 — 포트폴리오는 자주 열어봐도 판정이 분 단위로 변하지 않는다.
 */
export const maxDuration = 30;
export const preferredRegion = 'icn1';
export const dynamic = 'force-dynamic';

const YF_H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
const NAVER_H = { 'User-Agent': YF_H['User-Agent'], 'Referer': 'https://finance.naver.com' };

export interface HoldingVerdict {
  stance: 'buy' | 'neutral' | 'reduce';
  score: number;
  entryOk: boolean;
  price: number;
  stop: number;
  supplyMissing: boolean;
}

const _cache = new Map<string, { ts: number; v: HoldingVerdict }>();
const TTL = 10 * 60 * 1000;

async function fetchDaily(ticker: string): Promise<Candle[]> {
  const tryYf = async (sym: string) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1y&includePrePost=false`;
    let r = await fetch(url, { headers: YF_H, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!r.ok) r = await fetch(url.replace('query1', 'query2'), { headers: YF_H, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    return r;
  };
  let res = await tryYf(`${ticker}.KS`);
  if (!res.ok) res = await tryYf(`${ticker}.KQ`);
  if (!res.ok) throw new Error(`Yahoo daily ${res.status}`);
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  const ts: number[] = result?.timestamp ?? [];
  const q = result?.indicators?.quote?.[0] ?? {};
  return ts
    .map((t, i) => ({
      ts: t * 1000,
      o: q.open?.[i] ?? q.close?.[i] ?? 0, h: q.high?.[i] ?? q.close?.[i] ?? 0,
      l: q.low?.[i] ?? q.close?.[i] ?? 0, c: q.close?.[i] ?? 0,
      v: q.volume?.[i] ?? 0, qv: 0,
    }))
    .filter((c: Candle) => c.c > 0);
}

async function fetchInvestor(ticker: string): Promise<InvestorDay[]> {
  try {
    const res = await fetch(`https://m.stock.naver.com/api/stock/${ticker}/trend`, {
      headers: NAVER_H, cache: 'no-store', signal: AbortSignal.timeout(7000),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = await res.json();
    if (!Array.isArray(raw)) return [];
    const num = (s: unknown) => Number(String(s ?? '').replace(/,/g, '').replace(/[+\s]/g, '')) || 0;
    return raw.slice(0, 10).map((r) => ({
      date: String(r.bizdate ?? ''),
      individual: num(r.individualPureBuyQuant),
      foreign: num(r.foreignerPureBuyQuant),
      institution: num(r.organPureBuyQuant),
      foreignHoldRatio: r.foreignerHoldRatio != null
        ? (parseFloat(String(r.foreignerHoldRatio).replace(/[%,\s]/g, '')) || null)
        : null,
      close: num(r.closePrice),
    }));
  } catch { return []; }
}

async function verdictOf(ticker: string): Promise<HoldingVerdict | null> {
  const hit = _cache.get(ticker);
  if (hit && Date.now() - hit.ts < TTL) return hit.v;
  try {
    const [candles, investor] = await Promise.all([fetchDaily(ticker), fetchInvestor(ticker)]);
    if (candles.length < 60) return null;
    const daily = analyzeTimeframe('1d', candles);
    const price = daily.close;
    const zones = srZones(candles, price, atr(candles));
    const fib = fibonacci(candles, price);
    const supply = investor.length >= 3 ? analyzeSupply(investor) : null;
    const v = buildStockVerdict(daily, candles, fib, zones, { supply });
    const out: HoldingVerdict = {
      stance: v.stance, score: v.score, entryOk: v.entryOk,
      price, stop: v.stop, supplyMissing: !supply,
    };
    _cache.set(ticker, { ts: Date.now(), v: out });
    return out;
  } catch (e) {
    console.error(`[portfolio-verdicts] ${ticker} 실패`, e);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const tickers = (req.nextUrl.searchParams.get('tickers') ?? '')
    .split(',').map((t) => t.trim()).filter((t) => /^\d{6}$/.test(t)).slice(0, 15);
  if (!tickers.length) return NextResponse.json({});

  const results = await Promise.all(tickers.map(verdictOf));
  const map: Record<string, HoldingVerdict> = {};
  results.forEach((v, i) => { if (v) map[tickers[i]] = v; });
  return NextResponse.json(map);
}
