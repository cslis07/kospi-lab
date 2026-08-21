/**
 * 코인 대시보드 — 시장환경(금리·유가·환율·심리) 집계.
 *
 * 은퇴한 coin-signal 앱의 시장환경 그리드를 kospi-lab 홈에 이식한다.
 * 미국채 10Y/2Y/30Y · Brent 유가 · 달러인덱스 · USDT/KRW · 김치프리미엄(평균) ·
 * 공포·탐욕 지수 · 다음 FOMC. 전부 무키·공개 소스.
 *
 * ⚠ 업비트·바이낸스는 미국 데이터센터 IP를 차단하므로 이 데이터를 쓰는 라우트는
 *   preferredRegion='icn1' 이어야 한다(김치프리미엄 계산이 두 거래소를 함께 씀).
 */
import { CALENDAR_EVENTS } from './calendarEvents';

export type Tone = 'up' | 'down' | 'warn' | 'neutral';

export interface EnvCard {
  key: string;
  label: string;
  value: string;          // 표시용 포맷된 값
  sub: string | null;     // 변화량 등 보조 표시
  subTone: Tone;
  comment: string;        // 왜 중요한가
}

export interface CoinEnv {
  cards: EnvCard[];
  updatedAt: number;
}

const CACHE_TTL = 5 * 60 * 1000;
let _cache: { d: CoinEnv; ts: number } | null = null;

/* ── FRED ─────────────────────────────────────────────── */
async function fredLatest(id: string): Promise<{ v: number; prev: number | null; ago3: number | null } | null> {
  const key = process.env.FRED_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&sort_order=desc&limit=8`,
      { cache: 'no-store', signal: AbortSignal.timeout(7000) },
    );
    const j = await res.json();
    const obs = ((j?.observations ?? []) as { value: string }[]).filter((o) => o.value !== '.').map((o) => Number(o.value));
    if (!obs.length) return null;
    return { v: obs[0], prev: obs[1] ?? null, ago3: obs[3] ?? null };
  } catch { return null; }
}

/* ── 업비트/바이낸스 ──────────────────────────────────── */
async function upbitPrices(markets: string[]): Promise<Record<string, number>> {
  try {
    const res = await fetch(`https://api.upbit.com/v1/ticker?markets=${markets.join(',')}`, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    const arr = await res.json();
    const out: Record<string, number> = {};
    if (Array.isArray(arr)) for (const t of arr) out[t.market] = Number(t.trade_price);
    return out;
  } catch { return {}; }
}
async function binancePrices(symbols: string[]): Promise<Record<string, number>> {
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/price', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    const arr = await res.json();
    const want = new Set(symbols);
    const out: Record<string, number> = {};
    if (Array.isArray(arr)) for (const t of arr) if (want.has(t.symbol)) out[t.symbol] = Number(t.price);
    return out;
  } catch { return {}; }
}

async function fearGreed(): Promise<{ value: number; label: string } | null> {
  try {
    const j = await (await fetch('https://api.alternative.me/fng/?limit=1', { cache: 'no-store', signal: AbortSignal.timeout(6000) })).json();
    const d = j?.data?.[0];
    return d ? { value: Number(d.value), label: d.value_classification } : null;
  } catch { return null; }
}

function nextFomc(now: number): string | null {
  const today = new Date(now).toISOString().slice(0, 10);
  const f = CALENDAR_EVENTS.filter((e) => e.category === 'fomc' && e.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  return f[0]?.date ?? null;
}

/* ── 조립 ─────────────────────────────────────────────── */
const bp = (delta: number) => `${delta >= 0 ? '+' : ''}${Math.round(delta * 100)}bp`;
const pct3 = (cur: number, ago: number | null) => (ago && ago !== 0 ? ((cur - ago) / ago) * 100 : null);

export async function fetchCoinEnv(now = Date.now()): Promise<CoinEnv> {
  if (_cache && now - _cache.ts < CACHE_TTL) return _cache.d;

  const COINS: [string, string, string][] = [ // [표시, 업비트마켓, 바이낸스심볼]
    ['BTC', 'KRW-BTC', 'BTCUSDT'], ['ETH', 'KRW-ETH', 'ETHUSDT'],
    ['XRP', 'KRW-XRP', 'XRPUSDT'], ['SOL', 'KRW-SOL', 'SOLUSDT'],
  ];

  const [d10, d2, d30, brent, dxy, up, bn, fg] = await Promise.all([
    fredLatest('DGS10'), fredLatest('DGS2'), fredLatest('DGS30'),
    fredLatest('DCOILBRENTEU'), fredLatest('DTWEXBGS'),
    upbitPrices(['KRW-USDT', ...COINS.map((c) => c[1])]),
    binancePrices(COINS.map((c) => c[2])),
    fearGreed(),
  ]);

  const cards: EnvCard[] = [];

  if (d10) cards.push({ key: 'd10', label: '미 국채 10Y', value: `${d10.v.toFixed(2)}%`,
    sub: d10.prev != null ? `전일 대비 ${bp(d10.v - d10.prev)}` : null, subTone: d10.prev != null && d10.v > d10.prev ? 'down' : 'up',
    comment: '금리 급등 = 위험자산(코인) 하방 압력' });
  if (d2) cards.push({ key: 'd2', label: '미 국채 2Y', value: `${d2.v.toFixed(2)}%`,
    sub: d2.prev != null ? `${bp(d2.v - d2.prev)}` : null, subTone: 'neutral',
    comment: '연준 기대를 가장 빠르게 반영' });
  if (d30) cards.push({ key: 'd30', label: '미 국채 30Y', value: `${d30.v.toFixed(2)}%`,
    sub: d30.prev != null ? `${bp(d30.v - d30.prev)}` : null, subTone: 'neutral',
    comment: '장기 인플레·재정 프리미엄' });
  if (brent) { const c3 = pct3(brent.v, brent.ago3); cards.push({ key: 'brent', label: 'Brent 유가', value: `$${brent.v.toFixed(2)}`,
    sub: c3 != null ? `${c3 >= 0 ? '+' : ''}${c3.toFixed(2)} %, 3일` : null, subTone: c3 != null && c3 > 0 ? 'warn' : 'neutral',
    comment: '급등 시 인플레→금리 경로로 코인 부담' }); }
  if (dxy) { const c3 = pct3(dxy.v, dxy.ago3); cards.push({ key: 'dxy', label: '달러인덱스 (DXY)', value: dxy.v.toFixed(2),
    sub: c3 != null ? `${c3 >= 0 ? '+' : ''}${c3.toFixed(2)} %, 3일` : null, subTone: c3 != null && c3 >= 0 ? 'down' : 'up',
    comment: '달러 강세 = 위험자산 하방 압력' }); }

  const usdtKrw = up['KRW-USDT'] ?? null;
  if (usdtKrw) cards.push({ key: 'usdtkrw', label: 'USDT/KRW', value: `${Math.round(usdtKrw).toLocaleString()}원`,
    sub: null, subTone: 'neutral', comment: '업비트 실거래가' });

  // 김치 프리미엄 = (업비트 원화가) / (바이낸스 USDT가 × USDT/KRW) − 1
  if (usdtKrw) {
    const per: { tag: string; pct: number }[] = [];
    for (const [tag, um, bs] of COINS) {
      const krw = up[um], usd = bn[bs];
      if (krw && usd) per.push({ tag, pct: (krw / (usd * usdtKrw) - 1) * 100 });
    }
    if (per.length) {
      const avg = per.reduce((a, x) => a + x.pct, 0) / per.length;
      cards.push({ key: 'kimchi', label: '김치프리미엄 (평균)', value: `${avg >= 0 ? '+' : ''}${avg.toFixed(1)}%`,
        sub: per.map((p) => `${p.tag} ${p.pct >= 0 ? '+' : ''}${p.pct.toFixed(2)}%`).join(' · '),
        subTone: Math.abs(avg) >= 3 ? 'warn' : 'neutral',
        comment: '국내 매수 과열/이탈 신호' });
    }
  }

  if (fg) cards.push({ key: 'fng', label: '공포·탐욕 지수', value: String(fg.value),
    sub: `${fg.label === 'Greed' || fg.label === 'Extreme Greed' ? 'Greed — 극단 탐욕은 과열 경계' : fg.label === 'Fear' || fg.label === 'Extreme Fear' ? 'Fear — 과매도 반등 여지' : fg.label}`,
    subTone: fg.value >= 75 ? 'warn' : fg.value <= 25 ? 'up' : 'neutral', comment: '군중 심리 극단은 반전 신호' });

  const fomc = nextFomc(now);
  if (fomc) cards.push({ key: 'fomc', label: '다음 FOMC', value: fomc, sub: null, subTone: 'neutral', comment: '발표 전후 신규 진입 억제' });

  const d: CoinEnv = { cards, updatedAt: now };
  if (cards.length) _cache = { d, ts: now };
  return d;
}
