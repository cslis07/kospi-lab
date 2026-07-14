import { NextRequest, NextResponse } from 'next/server';
import {
  Candle, analyzeTimeframe, buildVerdict, atr, srZones, fibonacci, emaSeries,
  detectRsiDivergence, recentBigCandles,
  TimeframeAnalysis, VerdictExtras,
} from '@/lib/coinAnalysis';
import { backtestEngine, BacktestResult } from '@/lib/coinBacktest';
import { CALENDAR_EVENTS } from '@/lib/calendarEvents';
import { BITGET_BASE, fetchBitgetFuturesTickers } from '@/lib/bitget';
import { claudeBriefing, resolveBriefingModel, BriefingResult } from '@/lib/anthropic';

export const maxDuration = 30;
// Bybit(OI)·업비트가 미국 데이터센터 IP를 차단하므로 이 라우트만 서울 리전에서 실행
export const preferredRegion = 'icn1';

/* ── 지원 코인 ────────────────────────────────────────── */
const COINS: Record<string, { name: string; newsQuery: string; upbit: string }> = {
  BTCUSDT: { name: '비트코인',  newsQuery: '비트코인',   upbit: 'KRW-BTC' },
  ETHUSDT: { name: '이더리움',  newsQuery: '이더리움',   upbit: 'KRW-ETH' },
  XRPUSDT: { name: '리플 XRP', newsQuery: '리플 XRP',   upbit: 'KRW-XRP' },
  SOLUSDT: { name: '솔라나',   newsQuery: '솔라나 코인', upbit: 'KRW-SOL' },
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

/**
 * 오더북 스냅샷 — 매수/매도 유동성 불균형 + 근접 벽.
 * REST 1회 조회(웹소켓 아님)라 서버리스에서 동작.
 */
export interface OrderbookSnap {
  bidVol: number;       // 상위 N호가 매수 물량(코인)
  askVol: number;       // 상위 N호가 매도 물량(코인)
  imbalance: number;    // (bid-ask)/(bid+ask), +면 매수 우위
  spreadPct: number;
  bidWall: { price: number; size: number; distPct: number } | null;  // 최대 매수벽
  askWall: { price: number; size: number; distPct: number } | null;  // 최대 매도벽
}
async function fetchOrderbook(symbol: string): Promise<OrderbookSnap | null> {
  const url = `${BITGET_BASE}/api/v2/mix/market/merge-depth?symbol=${symbol}&productType=USDT-FUTURES&limit=50`;
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`Bitget depth ${res.status}`);
  const json = await res.json();
  if (json.code !== '00000') throw new Error(`Bitget ${json.code}: ${json.msg}`);
  const bids = (json.data?.bids ?? []) as string[][];   // [price, size]
  const asks = (json.data?.asks ?? []) as string[][];
  if (!bids.length || !asks.length) return null;
  const mid = (Number(bids[0][0]) + Number(asks[0][0])) / 2;
  if (!(mid > 0)) return null;
  const bidVol = bids.reduce((a, r) => a + Number(r[1]), 0);
  const askVol = asks.reduce((a, r) => a + Number(r[1]), 0);
  const wall = (rows: string[][]) => {
    let best = rows[0]; for (const r of rows) if (Number(r[1]) > Number(best[1])) best = r;
    return { price: Number(best[0]), size: Number(best[1]), distPct: (Math.abs(Number(best[0]) - mid) / mid) * 100 };
  };
  return {
    bidVol, askVol,
    imbalance: bidVol + askVol > 0 ? (bidVol - askVol) / (bidVol + askVol) : 0,
    spreadPct: ((Number(asks[0][0]) - Number(bids[0][0])) / mid) * 100,
    bidWall: wall(bids),
    askWall: wall(asks),
  };
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

/* ── 공포·탐욕 지수 (alternative.me, 시장 전체 심리) ──── */
async function fetchFearGreed(): Promise<{ value: number; label: string; prev: number | null } | null> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=2', {
      next: { revalidate: 1800 }, signal: AbortSignal.timeout(6000),
    });
    const json = await res.json();
    const rows = json?.data ?? [];
    if (!rows[0]) return null;
    const labelKo: Record<string, string> = {
      'Extreme Fear': '극단적 공포', 'Fear': '공포', 'Neutral': '중립',
      'Greed': '탐욕', 'Extreme Greed': '극단적 탐욕',
    };
    return {
      value: Number(rows[0].value),
      label: labelKo[rows[0].value_classification] ?? rows[0].value_classification,
      prev: rows[1] ? Number(rows[1].value) : null,
    };
  } catch { return null; }
}

/* ── 김치 프리미엄 (업비트 KRW가 vs 글로벌 USD가 × USD/KRW) ── */
async function fetchKimchi(upbitMarket: string, globalUsd: number): Promise<{ premiumPct: number; upbitKrw: number; usdKrw: number } | null> {
  try {
    const [upRes, fxRes] = await Promise.all([
      fetch(`https://api.upbit.com/v1/ticker?markets=${upbitMarket}`, { cache: 'no-store', signal: AbortSignal.timeout(6000) }),
      fetch('https://api.frankfurter.app/latest?from=USD&to=KRW', { next: { revalidate: 3600 }, signal: AbortSignal.timeout(6000) }),
    ]);
    const up = (await upRes.json())?.[0];
    const usdKrw = (await fxRes.json())?.rates?.KRW;
    if (!up?.trade_price || !usdKrw || globalUsd <= 0) return null;
    const premiumPct = (up.trade_price / (globalUsd * usdKrw) - 1) * 100;
    return { premiumPct, upbitKrw: up.trade_price, usdKrw };
  } catch { return null; }
}

/* ── 펀딩비 히스토리 (최근 6회 = 2일) ─────────────────── */
async function fetchFundingHistory(symbol: string): Promise<{ ts: number; rate: number }[]> {
  try {
    const res = await fetch(
      `${BITGET_BASE}/api/v2/mix/market/history-fund-rate?symbol=${symbol}&productType=USDT-FUTURES&pageSize=6`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) },
    );
    const json = await res.json();
    return ((json?.data ?? []) as { fundingTime: string; fundingRate: string }[])
      .map((r) => ({ ts: Number(r.fundingTime), rate: Number(r.fundingRate) }))
      .sort((a, b) => a.ts - b.ts);
  } catch { return []; }
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

/* ── 테이커 매수/매도 (주문 흐름) ─────────────────────── */
async function fetchTakerFlow(symbol: string): Promise<{ ts: number; buy: number; sell: number }[]> {
  try {
    const res = await fetch(
      `${BITGET_BASE}/api/v2/mix/market/taker-buy-sell?symbol=${symbol}&productType=USDT-FUTURES&period=5m`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) },
    );
    const json = await res.json();
    return ((json?.data ?? []) as { ts: string; buyVolume: string; sellVolume: string }[])
      .map((r) => ({ ts: Number(r.ts), buy: Number(r.buyVolume), sell: Number(r.sellVolume) }))
      .sort((a, b) => a.ts - b.ts);
  } catch { return []; }
}

/* ── 포지션 금액 기준 롱숏 (큰손 지표) ───────────────── */
async function fetchPositionLS(symbol: string): Promise<{ latest: number | null; history: { ts: number; ratio: number }[] }> {
  try {
    const res = await fetch(
      `${BITGET_BASE}/api/v2/mix/market/position-long-short?symbol=${symbol}&productType=USDT-FUTURES&period=5m`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) },
    );
    const json = await res.json();
    const rows = ((json?.data ?? []) as { ts: string; longShortPositionRatio: string }[])
      .map((r) => ({ ts: Number(r.ts), ratio: Number(r.longShortPositionRatio) }))
      .sort((a, b) => a.ts - b.ts);
    return { latest: rows.length ? rows[rows.length - 1].ratio : null, history: rows.slice(-30) };
  } catch { return { latest: null, history: [] }; }
}

/* ── OI 히스토리 (Bybit → OKX 폴백 — Bitget은 현재값만, Bybit는 데이터센터 IP 차단) ── */
async function fetchOiHistory(symbol: string): Promise<{ ts: number; oi: number }[]> {
  // 1) Bybit (로컬·일반 IP에서 동작)
  try {
    const res = await fetch(
      `https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${symbol}&intervalTime=5min&limit=48`,
      { cache: 'no-store', signal: AbortSignal.timeout(6000) },
    );
    const json = await res.json();
    const rows = ((json?.result?.list ?? []) as { timestamp: string; openInterest: string }[])
      .map((r) => ({ ts: Number(r.timestamp), oi: Number(r.openInterest) }))
      .sort((a, b) => a.ts - b.ts);
    if (rows.length > 0) return rows;
  } catch { /* OKX 폴백 */ }
  // 2) OKX rubik (USD 명목 OI — 변화율 계산엔 동일하게 유효)
  try {
    const ccy = symbol.replace('USDT', '');
    const res = await fetch(
      `https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-volume?ccy=${ccy}&period=5m`,
      { cache: 'no-store', signal: AbortSignal.timeout(6000) },
    );
    const json = await res.json();
    return ((json?.data ?? []) as string[][])
      .map((r) => ({ ts: Number(r[0]), oi: Number(r[1]) }))
      .sort((a, b) => a.ts - b.ts)
      .slice(-48);
  } catch { return []; }
}

/* ── BTC 옵션 내재변동성 지수 (Deribit DVOL) ─────────── */
async function fetchDvol(): Promise<{ value: number; change24h: number | null } | null> {
  try {
    const end = Date.now();
    const start = end - 26 * 3600_000;
    const res = await fetch(
      `https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=BTC&start_timestamp=${start}&end_timestamp=${end}&resolution=3600`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) },
    );
    const json = await res.json();
    const rows = (json?.result?.data ?? []) as number[][]; // [ts, o, h, l, c]
    if (!rows.length) return null;
    const cur = rows[rows.length - 1][4];
    const dayAgo = rows.length >= 24 ? rows[rows.length - 24][4] : rows[0][4];
    return { value: cur, change24h: dayAgo ? cur - dayAgo : null };
  } catch { return null; }
}

/* ── BTC 도미넌스 (CoinGecko) ────────────────────────── */
async function fetchDominance(): Promise<{ btc: number; eth: number; mcapChange24h: number } | null> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/global', {
      next: { revalidate: 1800 }, signal: AbortSignal.timeout(8000),
    });
    const json = await res.json();
    const d = json?.data;
    if (!d) return null;
    return {
      btc: Number(d.market_cap_percentage?.btc ?? 0),
      eth: Number(d.market_cap_percentage?.eth ?? 0),
      mcapChange24h: Number(d.market_cap_change_percentage_24h_usd ?? 0),
    };
  } catch { return null; }
}

/* ── 임박 경제 이벤트 (앱 내 캘린더 재활용) ──────────── */
function upcomingEvent(): { title: string; hoursUntil: number; date: string } | null {
  const now = Date.now();
  let best: { title: string; hoursUntil: number; date: string } | null = null;
  for (const e of CALENDAR_EVENTS) {
    if (e.importance !== 'high') continue;
    if (e.category !== 'fomc' && e.category !== 'indicator') continue; // 코인에 영향 큰 미국 이벤트
    // 발표 시각 근사: 지표(CPI·NFP)=당일 21:30 KST, FOMC=다음날 03:00 KST
    const base = new Date(`${e.date}T00:00:00+09:00`).getTime();
    const eventTs = e.category === 'fomc' ? base + 27 * 3600_000 : base + 21.5 * 3600_000;
    const hoursUntil = (eventTs - now) / 3600_000;
    if (hoursUntil < -2 || hoursUntil > 48) continue; // 발표 후 2시간까지 경계 유지
    if (!best || hoursUntil < best.hoursUntil) best = { title: e.title, hoursUntil, date: e.date };
  }
  return best;
}

/* ── 백테스트 (10분 캐시 — CPU 절약) ─────────────────── */
const _btCache = new Map<string, { result: BacktestResult; ts: number }>();
const BT_TTL = 10 * 60 * 1000;

function cachedBacktest(symbol: string, c5m: Candle[], c15m: Candle[], c1h: Candle[], fundingRate: number): BacktestResult {
  const hit = _btCache.get(symbol);
  if (hit && Date.now() - hit.ts < BT_TTL) return hit.result;
  const result = backtestEngine(c5m, c15m, c1h, fundingRate);
  _btCache.set(symbol, { result, ts: Date.now() });
  return result;
}

/* ── 뉴스 헤드라인 간이 감성 분류 (키워드 기반) ───────── */
const POS_WORDS = ['급등', '상승', '반등', '돌파', '최고', '신고가', '매수', '순매수', '승인', 'ETF', '호재', '채택', '확대', '유입', '강세', '랠리', '사상 최대'];
const NEG_WORDS = ['급락', '하락', '폭락', '이탈', '최저', '매도', '순매도', '청산', '규제', '해킹', '소송', '악재', '금지', '유출', '약세', '공포', '제동', '논란', '경고'];

function classifyNews(title: string): 'pos' | 'neg' | 'neu' {
  const p = POS_WORDS.filter((w) => title.includes(w)).length;
  const n = NEG_WORDS.filter((w) => title.includes(w)).length;
  if (p > n) return 'pos';
  if (n > p) return 'neg';
  return 'neu';
}

/* ── "지금 왜 움직이나" 룰 기반 드라이버 ──────────────── */
interface MovementInput {
  name: string;
  isBtc: boolean;
  pct15m: number; pct1h: number; pct24h: number;
  btc24h: number | null;
  m5VolRatio: number;
  fundingNow: number; fundingPrev: number | null;
  lsHistory: LSPoint[];
  bigCandles: ReturnType<typeof recentBigCandles>;
  divergence: 'bullish' | 'bearish' | null;
  newsPos: number; newsNeg: number;
  fearGreed: { value: number; label: string } | null;
  kimchiPct: number | null;
}

function buildMovement(inp: MovementInput) {
  const dirNow: 'up' | 'down' | 'flat' =
    inp.pct1h >= 0.3 ? 'up' : inp.pct1h <= -0.3 ? 'down' : Math.abs(inp.pct24h) >= 1 ? (inp.pct24h > 0 ? 'up' : 'down') : 'flat';
  const drivers: { text: string; tone: 'up' | 'down' | 'warn' | 'info' }[] = [];

  // 1) BTC 동조 (알트)
  if (!inp.isBtc && inp.btc24h !== null && Math.abs(inp.btc24h) >= 1 &&
      Math.sign(inp.btc24h) === Math.sign(inp.pct24h) && Math.abs(inp.pct24h) >= 0.8) {
    drivers.push({
      text: `비트코인 24h ${inp.btc24h > 0 ? '+' : ''}${inp.btc24h.toFixed(1)}% ${inp.btc24h > 0 ? '상승' : '하락'} 동조 — 알트는 BTC 방향을 따라가는 경향`,
      tone: inp.btc24h > 0 ? 'up' : 'down',
    });
  }

  // 2) 급변 캔들 (청산 연쇄 추정)
  for (const e of inp.bigCandles) {
    const kst = new Date(e.ts + 9 * 3600_000);
    const hh = String(kst.getUTCHours()).padStart(2, '0');
    const mm = String(kst.getUTCMinutes()).padStart(2, '0');
    drivers.push({
      text: `${hh}:${mm} 5분봉 ${e.kind}(폭 ${e.rangePct.toFixed(2)}%, 거래량 ${e.volRatio.toFixed(1)}배) — 대량 주문·청산 연쇄 추정`,
      tone: e.kind === '급등' ? 'up' : 'down',
    });
  }

  // 3) 거래량
  if (inp.m5VolRatio >= 2) {
    drivers.push({ text: `직전 5분봉 거래량 평균 ${inp.m5VolRatio.toFixed(1)}배 — 참여자 급증, 움직임에 실체 있음`, tone: 'info' });
  } else if (Math.abs(inp.pct1h) >= 0.5 && inp.m5VolRatio < 0.8) {
    drivers.push({ text: `가격은 움직이는데 거래량 평균 ${inp.m5VolRatio.toFixed(1)}배 — 얇은 호가에서 미끄러지는 중, 되돌림 잦음`, tone: 'warn' });
  }

  // 4) 펀딩 변화
  if (inp.fundingPrev !== null) {
    const d = (inp.fundingNow - inp.fundingPrev) * 100;
    if (Math.abs(d) >= 0.01) {
      drivers.push({
        text: `펀딩비 ${d > 0 ? '상승' : '하락'} 중(직전 대비 ${d > 0 ? '+' : ''}${d.toFixed(3)}%p) — ${d > 0 ? '롱' : '숏'} 쏠림 강화 신호`,
        tone: 'info',
      });
    }
  }
  if (Math.abs(inp.fundingNow * 100) >= 0.05) {
    drivers.push({
      text: `펀딩비 ${(inp.fundingNow * 100).toFixed(3)}% — ${inp.fundingNow > 0 ? '롱' : '숏'} 과열, 반대 방향 스퀴즈 재료`,
      tone: 'warn',
    });
  }

  // 5) 롱숏 계정비율 변화 (30샘플 = 2.5시간)
  if (inp.lsHistory.length >= 10) {
    const first = inp.lsHistory[0].ratio, last = inp.lsHistory[inp.lsHistory.length - 1].ratio;
    const chg = last - first;
    if (Math.abs(chg) >= 0.15) {
      drivers.push({
        text: `롱숏 계정비율 ${first.toFixed(2)}→${last.toFixed(2)} — 최근 ${chg > 0 ? '롱 진입' : '숏 진입/롱 이탈'} 증가`,
        tone: 'info',
      });
    }
  }

  // 6) RSI 다이버전스
  if (inp.divergence === 'bullish') drivers.push({ text: '15m RSI 상승 다이버전스 — 하락 속도 둔화, 단기 반등 시도 가능', tone: 'up' });
  if (inp.divergence === 'bearish') drivers.push({ text: '15m RSI 하락 다이버전스 — 상승 동력 약화, 단기 조정 가능', tone: 'down' });

  // 7) 뉴스 감성
  if (inp.newsNeg >= 2 && inp.newsNeg > inp.newsPos) {
    drivers.push({ text: `최신 뉴스 악재성 헤드라인 ${inp.newsNeg}건 — 심리 압박 요인`, tone: 'down' });
  } else if (inp.newsPos >= 2 && inp.newsPos > inp.newsNeg) {
    drivers.push({ text: `최신 뉴스 호재성 헤드라인 ${inp.newsPos}건 — 심리 지지 요인`, tone: 'up' });
  }

  // 8) 공포탐욕
  if (inp.fearGreed) {
    if (inp.fearGreed.value <= 25) drivers.push({ text: `공포탐욕지수 ${inp.fearGreed.value}(${inp.fearGreed.label}) — 시장 전체가 위험회피 국면`, tone: 'down' });
    else if (inp.fearGreed.value >= 75) drivers.push({ text: `공포탐욕지수 ${inp.fearGreed.value}(${inp.fearGreed.label}) — 과열 국면, 차익실현 주의`, tone: 'warn' });
  }

  // 9) 김치 프리미엄
  if (inp.kimchiPct !== null && Math.abs(inp.kimchiPct) >= 2) {
    drivers.push({
      text: `김치 프리미엄 ${inp.kimchiPct > 0 ? '+' : ''}${inp.kimchiPct.toFixed(1)}% — 국내 ${inp.kimchiPct > 0 ? '매수 과열' : '매도 우위/이탈'} 신호`,
      tone: inp.kimchiPct > 0 ? 'warn' : 'info',
    });
  }

  if (!drivers.length) {
    drivers.push({ text: '특별한 단일 재료 없이 완만한 흐름 — 상위 시간봉 추세와 파생 포지션 균형이 가격을 이끄는 구간', tone: 'info' });
  }

  return { direction: dirNow, pct15m: inp.pct15m, pct1h: inp.pct1h, pct24h: inp.pct24h, drivers };
}

/* ── AI 종합 브리핑 (3분 캐시) ───────────────────────── */
const _aiCache = new Map<string, { text: string; ts: number }>();
const AI_TTL = 3 * 60 * 1000;

async function aiBriefing(
  symbol: string, name: string, price: number,
  verdictSummary: string, tfSummary: string, newsTitles: string[],
  moveSummary: string, modelId: string,
): Promise<BriefingResult> {
  const cacheKey = `${symbol}:${modelId}`;
  const cached = _aiCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < AI_TTL) return { text: cached.text, model: modelId };

  const prompt = `당신은 코인 선물 단타 교육 자료를 기반으로 차트를 해설하는 분석 도우미입니다.
방법론: ①1시간봉 방향→15분봉 구조→5분봉 타이밍 순서 ②EMA/VWAP은 방향 필터 ③거래량 미동반 돌파 불신 ④RSI는 추세 내 눌림 확인용(30/70 역매매 금지) ⑤손절은 ATR·구조 기반, 레버리지는 낮게(2~5배) ⑥펀딩 쏠림은 체제 신호.

## ${name}(${symbol}) 현재 데이터
현재가: $${price}
${tfSummary}

## 룰 엔진 판정
${verdictSummary}

## 현재 가격 흐름·수급 신호
${moveSummary}

## 최신 뉴스 헤드라인
${newsTitles.length ? newsTitles.map((t, i) => `${i + 1}. ${t}`).join('\n') : '(뉴스 수집 실패)'}

## 요청 (각 항목을 "【제목】" 줄로 시작)
【지금 왜 움직이나】 현재 ${name}이(가) 오르/내리는 이유를 위 수급 신호와 뉴스를 근거로 2~3문장으로 추정. 확실하지 않으면 "추정"임을 명시.
【뉴스 동향】 가격에 영향 줄 이슈 위주 1~2문장.
【차트 해석】 룰 엔진 판정에 동의/보완 관점 2~3문장.
【진입 관점】 롱/숏/관망 + 조건 1~2문장.
한국어로 작성하고, 마지막 줄에 "투자 권유가 아닌 참고 정보입니다." 한 문장을 추가.`;

  const out = await claudeBriefing(prompt, 1000, 'coin-analysis', modelId);
  if (out.text) _aiCache.set(cacheKey, { text: out.text, ts: Date.now() });
  return out;
}

/* ── 메인 핸들러 ─────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
  const coin = COINS[symbol];
  if (!coin) {
    return NextResponse.json({ error: `지원하지 않는 심볼: ${symbol}` }, { status: 400 });
  }
  // 화이트리스트 밖의 값은 기본 모델로 수렴한다
  const briefingModel = resolveBriefingModel(req.nextUrl.searchParams.get('model')).id;

  try {
    const [c1hFull, c15mFull, c5mFull, c4hFull, c1dFull, funding, tickers, news, longShort, fundingHist, fearGreed, takerFlow, positionLS, oiHist, dvol, dominance, orderbook] = await Promise.all([
      fetchCandles(symbol, '1H', 250),
      fetchCandles(symbol, '15m', 500),
      fetchCandles(symbol, '5m', 1000),
      fetchCandles(symbol, '4H', 250).catch(() => [] as Candle[]),
      fetchCandles(symbol, '1D', 250).catch(() => [] as Candle[]),
      fetchFundingInfo(symbol),
      fetchBitgetFuturesTickers().catch(() => null),
      fetchNews(coin.newsQuery),
      fetchLongShort(symbol),
      fetchFundingHistory(symbol),
      fetchFearGreed(),
      fetchTakerFlow(symbol),
      fetchPositionLS(symbol),
      fetchOiHistory(symbol),
      fetchDvol(),
      fetchDominance(),
      fetchOrderbook(symbol).catch(() => null),
    ]);
    // 실시간 분석은 최근 200봉, 백테스트는 전체 사용
    const c1h = c1hFull.slice(-200);
    const c15m = c15mFull.slice(-200);
    const c5m = c5mFull.slice(-200);

    const t = tickers?.map.get(symbol);
    const price = c5m[c5m.length - 1].c;
    const kimchi = await fetchKimchi(coin.upbit, price);

    const h1  = analyzeTimeframe('1H', c1h);
    const m15 = analyzeTimeframe('15m', c15m);
    const m5  = analyzeTimeframe('5m', c5m);
    // 상위 타임프레임 레짐 (봉 부족 시 null)
    const h4  = c4hFull.length >= 60 ? analyzeTimeframe('4H', c4hFull) : null;
    const d1  = c1dFull.length >= 60 ? analyzeTimeframe('1D', c1dFull) : null;
    const zones = srZones(c15m, price, atr(c15m));
    const fib = fibonacci(c15m, price);

    /* ── 수급 정밀 지표 계산 ── */
    // 테이커 매수/매도 비율(최근 30분 = 6봉) + 주문흐름 다이버전스(최근 60분)
    const recentTaker = takerFlow.slice(-6);
    const takerBuy = recentTaker.reduce((a, r) => a + r.buy, 0);
    const takerSell = recentTaker.reduce((a, r) => a + r.sell, 0);
    const takerRatio = takerSell > 0 ? takerBuy / takerSell : null;
    const flow12 = takerFlow.slice(-12);
    const cumDelta = flow12.reduce((a, r) => a + (r.buy - r.sell), 0);
    const closes5all = c5m.map((c) => c.c);
    const p12ago = closes5all.length > 12 ? closes5all[closes5all.length - 13] : null;
    const pChg12 = p12ago ? ((price - p12ago) / p12ago) * 100 : 0;
    let takerDivergence: 'bullish' | 'bearish' | null = null;
    if (flow12.length >= 8) {
      if (pChg12 >= 0.3 && cumDelta < 0) takerDivergence = 'bearish';
      else if (pChg12 <= -0.3 && cumDelta > 0) takerDivergence = 'bullish';
    }

    // OI 1시간 변화율 (Bybit 5분 간격 12개)
    let oiChange1hPct: number | null = null;
    if (oiHist.length >= 13) {
      const oiNow = oiHist[oiHist.length - 1].oi;
      const oi1h = oiHist[oiHist.length - 13].oi;
      if (oi1h > 0) oiChange1hPct = ((oiNow - oi1h) / oi1h) * 100;
    }

    // 임박 이벤트
    const event = upcomingEvent();

    const extras: VerdictExtras = {
      takerRatio, takerDivergence,
      oiChange1hPct, priceChange1hPct: pChg12,
      positionRatio: positionLS.latest,
      event: event && event.hoursUntil <= 12 ? { title: event.title, hoursUntil: event.hoursUntil } : null,
      htf: { h4, d1 },
    };
    const verdict = buildVerdict(h1, m15, m5, funding.rate, funding.nextTs, fib, zones, longShort.latest?.ratio ?? null, extras);

    // 백테스트 (전체 캔들, 10분 캐시)
    const backtest = cachedBacktest(symbol, c5mFull, c15mFull, c1hFull, funding.rate);

    // 캔들 차트(EMA20/60 오버레이) — 5m/15m/1H 각 최근 60봉
    const buildChart = (candles: Candle[]) => {
      const closes = candles.map((c) => c.c);
      const e20 = emaSeries(closes, 20);
      const e60 = emaSeries(closes, 60);
      return candles.map((c, i) => ({
        ts: c.ts, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v,
        ema20: e20[i], ema60: e60[i],
      })).slice(-60);
    };
    const charts = { m5: buildChart(c5m), m15: buildChart(c15m), h1: buildChart(c1h) };

    // "지금 왜 움직이나" — 룰 기반 드라이버
    const closes5 = c5m.map((c) => c.c);
    const n5 = closes5.length;
    const pct15m = n5 > 3  ? ((price - closes5[n5 - 4])  / closes5[n5 - 4])  * 100 : 0;
    const pct1h  = n5 > 12 ? ((price - closes5[n5 - 13]) / closes5[n5 - 13]) * 100 : 0;
    const pct24h = t ? Number(t.change24h) * 100 : 0;
    const btcT = tickers?.map.get('BTCUSDT');
    const divergence = detectRsiDivergence(c15m);
    const bigCandles = recentBigCandles(c5m);
    const newsTagged = news.map((nw) => ({ ...nw, sentiment: classifyNews(nw.title) }));
    const newsPos = newsTagged.filter((x) => x.sentiment === 'pos').length;
    const newsNeg = newsTagged.filter((x) => x.sentiment === 'neg').length;
    const prevFunding = fundingHist.length >= 2 ? fundingHist[fundingHist.length - 2].rate : null;

    const movement = buildMovement({
      name: coin.name,
      isBtc: symbol === 'BTCUSDT',
      pct15m, pct1h, pct24h,
      btc24h: symbol !== 'BTCUSDT' && btcT ? Number(btcT.change24h) * 100 : null,
      m5VolRatio: m5.volumeRatio,
      fundingNow: funding.rate, fundingPrev: prevFunding,
      lsHistory: longShort.history,
      bigCandles, divergence,
      newsPos, newsNeg,
      fearGreed, kimchiPct: kimchi?.premiumPct ?? null,
    });

    // 수급 정밀 드라이버 추가 (주문흐름·OI — 연구상 단기 예측력 상위 신호라 앞에 배치)
    if (takerDivergence === 'bearish') movement.drivers.unshift({ text: '가격 상승 중인데 공격적 매수(테이커) 감소 — 주문흐름 다이버전스, 상승 동력 약화 신호', tone: 'down' });
    else if (takerDivergence === 'bullish') movement.drivers.unshift({ text: '가격 하락 중인데 공격적 매도(테이커) 감소 — 매도 소진, 반등 시도 가능', tone: 'up' });
    else if (takerRatio !== null && (takerRatio >= 1.4 || takerRatio <= 0.7)) {
      movement.drivers.unshift({
        text: `최근 30분 테이커 매수/매도 ${takerRatio.toFixed(2)} — 시장가 ${takerRatio >= 1.4 ? '매수' : '매도'} 공세가 가격을 미는 중`,
        tone: takerRatio >= 1.4 ? 'up' : 'down',
      });
    }
    if (oiChange1hPct !== null && Math.abs(oiChange1hPct) >= 0.3 && Math.abs(pChg12) >= 0.15) {
      const oiUp = oiChange1hPct > 0, pUp = pChg12 > 0;
      const label = pUp && oiUp ? '신규 롱 자금 유입' : pUp && !oiUp ? '숏커버(청산성 상승) — 연료 부족 주의' : !pUp && oiUp ? '신규 숏 자금 유입' : '롱 포지션 정리(청산성 하락)';
      movement.drivers.push({
        text: `1시간 OI ${oiChange1hPct > 0 ? '+' : ''}${oiChange1hPct.toFixed(2)}% × 가격 ${pChg12 >= 0 ? '+' : ''}${pChg12.toFixed(2)}% — ${label}`,
        tone: (pUp && oiUp) ? 'up' : (!pUp && oiUp) ? 'down' : 'warn',
      });
    }
    if (positionLS.latest !== null && longShort.latest && Math.abs(longShort.latest.ratio - positionLS.latest) >= 0.5) {
      const gap = longShort.latest.ratio - positionLS.latest;
      movement.drivers.push({
        text: `계정 롱숏 ${longShort.latest.ratio.toFixed(2)} vs 포지션 금액 ${positionLS.latest.toFixed(2)} — ${gap > 0 ? '개미 롱·큰손 중립(하락 시 청산 연료)' : '개미 숏·큰손 롱(상승 스퀴즈 여지)'}`,
        tone: 'warn',
      });
    }
    if (event) {
      movement.drivers.push({
        text: `${event.title} ${event.hoursUntil <= 0 ? '직후 변동성 구간' : `약 ${Math.round(event.hoursUntil)}시간 후`} — 이벤트 전후 방향성 신호 신뢰도 하락`,
        tone: 'warn',
      });
    }

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

    const moveSummary =
      `15분 ${pct15m >= 0 ? '+' : ''}${pct15m.toFixed(2)}% / 1시간 ${pct1h >= 0 ? '+' : ''}${pct1h.toFixed(2)}% / 24시간 ${pct24h >= 0 ? '+' : ''}${pct24h.toFixed(2)}%\n` +
      movement.drivers.map((d) => `- ${d.text}`).join('\n') +
      (fearGreed ? `\n공포탐욕지수: ${fearGreed.value}(${fearGreed.label})` : '') +
      (kimchi ? `\n김치 프리미엄: ${kimchi.premiumPct >= 0 ? '+' : ''}${kimchi.premiumPct.toFixed(2)}%` : '') +
      (takerRatio !== null ? `\n테이커 매수/매도(30분): ${takerRatio.toFixed(2)}${takerDivergence ? ` (${takerDivergence === 'bearish' ? '약세' : '강세'} 다이버전스)` : ''}` : '') +
      (oiChange1hPct !== null ? `\nOI 1시간 변화: ${oiChange1hPct > 0 ? '+' : ''}${oiChange1hPct.toFixed(2)}%` : '') +
      (dominance ? `\nBTC 도미넌스: ${dominance.btc.toFixed(1)}%` : '') +
      (dvol ? `\nBTC DVOL(옵션 내재변동성): ${dvol.value.toFixed(1)}${dvol.change24h !== null ? ` (24h ${dvol.change24h > 0 ? '+' : ''}${dvol.change24h.toFixed(1)})` : ''}` : '') +
      (event ? `\n임박 이벤트: ${event.title} (약 ${Math.round(event.hoursUntil)}시간 후)` : '');

    const ai = await aiBriefing(symbol, coin.name, price, verdictSummary, tfSummary, news.map((n) => n.title), moveSummary, briefingModel);

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
      charts,
      movement,
      divergence,
      fearGreed,
      kimchi,
      fundingHistory: fundingHist,
      taker: { ratio: takerRatio, divergence: takerDivergence, flow: takerFlow.slice(-12) },
      oi: { change1hPct: oiChange1hPct, history: oiHist.slice(-24) },
      positionLS: { latest: positionLS.latest },
      dvol,
      dominance,
      orderbook,
      event,
      backtest,
      verdict,
      news: newsTagged,
      aiBriefing: ai.text ?? null,
      aiError: ai.error ?? null,
      aiModel: ai.model ?? briefingModel,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
