import { NextRequest, NextResponse } from 'next/server';
import {
  Candle, analyzeTimeframe, buildVerdict, atr, srZones, fibonacci, emaSeries,
  TimeframeAnalysis,
} from '@/lib/coinAnalysis';
import { BITGET_BASE, fetchBitgetFuturesTickers } from '@/lib/bitget';

export const maxDuration = 30;

/* ── 지원 코인 ────────────────────────────────────────── */
const COINS: Record<string, { name: string; newsQuery: string }> = {
  BTCUSDT: { name: '비트코인',  newsQuery: '비트코인' },
  ETHUSDT: { name: '이더리움',  newsQuery: '이더리움' },
  XRPUSDT: { name: '리플 XRP', newsQuery: '리플 XRP' },
  SOLUSDT: { name: '솔라나',   newsQuery: '솔라나 코인' },
};

/* ── Bitget 캔들 ─────────────────────────────────────── */
async function fetchCandles(symbol: string, granularity: string, limit: number): Promise<Candle[]> {
  const url = `${BITGET_BASE}/api/v2/mix/market/candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=${granularity}&limit=${limit}`;
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Bitget candles ${res.status}`);
  const json = await res.json();
  if (json.code !== '00000') throw new Error(`Bitget ${json.code}: ${json.msg}`);
  return (json.data as string[][]).map((r) => ({
    ts: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]),
    c: Number(r[4]), v: Number(r[5]), qv: Number(r[6]),
  }));
}

async function fetchFundingInfo(symbol: string): Promise<{ rate: number; nextTs: number | null; intervalH: number }> {
  try {
    const res = await fetch(
      `${BITGET_BASE}/api/v2/mix/market/current-fund-rate?symbol=${symbol}&productType=USDT-FUTURES`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) },
    );
    const json = await res.json();
    const d = json?.data?.[0];
    return {
      rate: Number(d?.fundingRate ?? 0),
      nextTs: d?.nextUpdate ? Number(d.nextUpdate) : null,
      intervalH: Number(d?.fundingRateInterval ?? 8),
    };
  } catch {
    return { rate: 0, nextTs: null, intervalH: 8 };
  }
}

/* ── 롱숏 계정 비율 (최근 이력) ──────────────────────── */
interface LSPoint { ts: number; longRatio: number; shortRatio: number; ratio: number }
async function fetchLongShort(symbol: string): Promise<{ latest: LSPoint | null; history: LSPoint[] }> {
  try {
    const res = await fetch(
      `${BITGET_BASE}/api/v2/mix/market/account-long-short?symbol=${symbol}&productType=USDT-FUTURES&period=5m`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) },
    );
    const json = await res.json();
    const rows = (json?.data ?? []) as { longAccountRatio: string; shortAccountRatio: string; longShortAccountRatio: string; ts: string }[];
    const history: LSPoint[] = rows.map((r) => ({
      ts: Number(r.ts),
      longRatio: Number(r.longAccountRatio),
      shortRatio: Number(r.shortAccountRatio),
      ratio: Number(r.longShortAccountRatio),
    })).slice(-30);
    return { latest: history[history.length - 1] ?? null, history };
  } catch {
    return { latest: null, history: [] };
  }
}

/* ── 뉴스 (Google News RSS → Bing News RSS 폴백) ─────── */
interface NewsItem { title: string; link: string; source: string; pubDate: string }

function parseRssItems(xml: string, limit = 8): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.split('<item>').slice(1);
  for (const b of blocks.slice(0, limit)) {
    const pick = (tag: string) => {
      const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return (m?.[1] ?? '').replace('<![CDATA[', '').replace(']]>', '').trim();
    };
    const title = pick('title').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const link = pick('link');
    const source = pick('source') || pick('News:Source') || '';
    const pubDate = pick('pubDate');
    if (title) items.push({ title, link, source, pubDate });
  }
  return items;
}

async function fetchNews(query: string): Promise<NewsItem[]> {
  const enc = encodeURIComponent(query);
  // 1) Google News (로컬·일반 IP)
  try {
    const res = await fetch(`https://news.google.com/rss/search?q=${enc}&hl=ko&gl=KR&ceid=KR:ko`, {
      cache: 'no-store', signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (res.ok) {
      const items = parseRssItems(await res.text());
      if (items.length > 0) return items;
    }
  } catch { /* 폴백 진행 */ }
  // 2) Bing News (Vercel 데이터센터 IP에서 Google 차단 시)
  try {
    const res = await fetch(`https://www.bing.com/news/search?q=${enc}&format=rss&setmkt=ko-KR`, {
      cache: 'no-store', signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (res.ok) return parseRssItems(await res.text());
  } catch { /* 뉴스 없이 진행 */ }
  return [];
}

/* ── AI 종합 브리핑 (3분 캐시) ───────────────────────── */
const _aiCache = new Map<string, { text: string; ts: number }>();
const AI_TTL = 3 * 60 * 1000;

async function aiBriefing(
  symbol: string, name: string, price: number,
  verdictSummary: string, tfSummary: string, newsTitles: string[],
): Promise<{ text?: string; error?: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { error: 'ANTHROPIC_API_KEY 미설정 — 룰 기반 분석만 표시됩니다.' };
  const cached = _aiCache.get(symbol);
  if (cached && Date.now() - cached.ts < AI_TTL) return { text: cached.text };

  const prompt = `당신은 코인 선물 단타 교육 자료를 기반으로 차트를 해설하는 분석 도우미입니다.
방법론: ①1시간봉 방향→15분봉 구조→5분봉 타이밍 순서 ②EMA/VWAP은 방향 필터 ③거래량 미동반 돌파 불신 ④RSI는 추세 내 눌림 확인용(30/70 역매매 금지) ⑤손절은 ATR·구조 기반, 레버리지는 낮게(2~5배) ⑥펀딩 쏠림은 체제 신호.

## ${name}(${symbol}) 현재 데이터
현재가: $${price}
${tfSummary}

## 룰 엔진 판정
${verdictSummary}

## 최신 뉴스 헤드라인
${newsTitles.length ? newsTitles.map((t, i) => `${i + 1}. ${t}`).join('\n') : '(뉴스 수집 실패)'}

## 요청
1. 뉴스 동향 핵심 1~2문장 (가격에 영향 줄 이슈 위주)
2. 차트 종합 해석 2~3문장 (룰 엔진 판정에 동의/보완 관점)
3. 지금 진입 관점 1~2문장 (롱/숏/관망 + 조건)
총 5~7문장, 한국어. 마지막에 "투자 권유가 아닌 참고 정보"임을 한 문장으로 명시.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = await res.json();
    const text = data?.content?.[0]?.text ?? '';
    if (text) _aiCache.set(symbol, { text, ts: Date.now() });
    return { text };
  } catch (e) {
    return { error: `AI 브리핑 실패: ${String(e).slice(0, 120)}` };
  }
}

/* ── 메인 핸들러 ─────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
  const coin = COINS[symbol];
  if (!coin) {
    return NextResponse.json({ error: `지원하지 않는 심볼: ${symbol}` }, { status: 400 });
  }

  try {
    const [c1h, c15m, c5m, funding, tickers, news, longShort] = await Promise.all([
      fetchCandles(symbol, '1H', 200),
      fetchCandles(symbol, '15m', 200),
      fetchCandles(symbol, '5m', 200),
      fetchFundingInfo(symbol),
      fetchBitgetFuturesTickers().catch(() => null),
      fetchNews(coin.newsQuery),
      fetchLongShort(symbol),
    ]);

    const t = tickers?.map.get(symbol);
    const price = c5m[c5m.length - 1].c;

    const h1  = analyzeTimeframe('1H', c1h);
    const m15 = analyzeTimeframe('15m', c15m);
    const m5  = analyzeTimeframe('5m', c5m);
    const zones = srZones(c15m, price, atr(c15m));
    const fib = fibonacci(c15m, price);
    const verdict = buildVerdict(h1, m15, m5, funding.rate, funding.nextTs, fib, zones, longShort.latest?.ratio ?? null);

    // 5분봉 캔들 차트(EMA20/60 오버레이) — 최근 60봉
    const closes5 = c5m.map((c) => c.c);
    const ema20s = emaSeries(closes5, 20);
    const ema60s = emaSeries(closes5, 60);
    const chartCandles = c5m.map((c, i) => ({
      ts: c.ts, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v,
      ema20: ema20s[i], ema60: ema60s[i],
    })).slice(-60);

    // AI 브리핑용 요약 문자열
    const tfSummary = [h1, m15, m5].map((tf: TimeframeAnalysis) =>
      `[${tf.tf}] 구조:${tf.structure} EMA:${tf.emaAlign} RSI:${tf.rsi.toFixed(0)} ` +
      `MACD히스토:${tf.macd.hist > 0 ? '+' : ''}${tf.macd.hist.toFixed(2)} ATR:${tf.atrPct.toFixed(2)}% ` +
      `거래량비:${tf.volumeRatio.toFixed(1)}x${tf.bb.squeeze ? ' 밴드수축' : ''}`
    ).join('\n') + `\n펀딩비: ${(funding.rate * 100).toFixed(4)}% / OI: ${t?.holdingAmount ?? '-'}` +
      `${longShort.latest ? ` / 롱숏계정비율: ${longShort.latest.ratio.toFixed(2)}(롱 ${(longShort.latest.longRatio * 100).toFixed(0)}%)` : ''}`;
    const verdictSummary =
      `상태:${verdict.state} 점수:${verdict.score} 방향:${verdict.direction} 진입가능:${verdict.entryOk}\n` +
      `근거: ${verdict.reasons.slice(0, 5).join(' / ')}\n경고: ${verdict.warnings.join(' / ') || '없음'}`;

    const ai = await aiBriefing(symbol, coin.name, price, verdictSummary, tfSummary, news.map((n) => n.title));

    return NextResponse.json({
      symbol,
      name: coin.name,
      updatedAt: Date.now(),
      price,
      change24h: t ? Number(t.change24h) * 100 : null,
      high24h: t ? Number(t.high24h) : null,
      low24h: t ? Number(t.low24h) : null,
      quoteVolume: t ? Number(t.quoteVolume) : null,
      markPrice: t?.markPrice ? Number(t.markPrice) : null,
      openInterest: t?.holdingAmount ? Number(t.holdingAmount) : null,
      funding: { rate: funding.rate, ratePct: funding.rate * 100, nextTs: funding.nextTs, intervalH: funding.intervalH },
      longShort: {
        latest: longShort.latest,
        history: longShort.history,
      },
      timeframes: { h1, m15, m5 },
      zones,
      fib,
      chart: { candles: chartCandles, interval: '5m' },
      verdict,
      news,
      aiBriefing: ai.text ?? null,
      aiError: ai.error ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
