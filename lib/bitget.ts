import crypto from 'crypto';

/**
 * Bitget API 공용 헬퍼
 *  - 공개 시세: API 키 불필요 (spot/mix 티커). Vercel에서 안정적.
 *  - 개인 계좌: HMAC 서명 필요 (BITGET_API_KEY / BITGET_API_SECRET / BITGET_API_PASSPHRASE).
 *    읽기전용 키 권장. 키 미설정 시 signed 호출은 throw.
 */
export const BITGET_BASE = 'https://api.bitget.com';

/* ── 공개 스팟 티커 (전체 1콜 → 캐시) ──────────────────────── */
export interface BitgetTicker {
  symbol: string;     // BTCUSDT
  lastPr: string;     // 현재가
  open: string;       // 24h 전 시가
  high24h: string;
  low24h: string;
  change24h: string;  // 등락률(소수) -0.01768 = -1.768%
  baseVolume: string; // 거래량(코인)
  quoteVolume: string;// 거래대금(USDT)
}

let _tickers: { map: Map<string, BitgetTicker>; ts: number } | null = null;
const TICKER_TTL = 10 * 1000; // 10초

export async function fetchBitgetTickers(): Promise<Map<string, BitgetTicker>> {
  if (_tickers && Date.now() - _tickers.ts < TICKER_TTL) return _tickers.map;
  const res = await fetch(`${BITGET_BASE}/api/v2/spot/market/tickers`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Bitget tickers ${res.status}`);
  const json = await res.json();
  if (json.code !== '00000') throw new Error(`Bitget ${json.code}: ${json.msg}`);
  const map = new Map<string, BitgetTicker>();
  for (const t of json.data as BitgetTicker[]) map.set(t.symbol, t);
  _tickers = { map, ts: Date.now() };
  return map;
}

/* ── 공개 USDT-Futures(선물) 티커 ─────────────────────────── */
export interface BitgetFuturesTicker {
  symbol: string;       // BTCUSDT
  lastPr: string;       // 현재가
  high24h: string;
  low24h: string;
  change24h: string;    // 등락률(소수)
  baseVolume: string;
  quoteVolume: string;  // USDT 거래대금
  fundingRate?: string; // 펀딩비
  holdingAmount?: string; // 미결제약정
  indexPrice?: string;  // 지수가
  markPrice?: string;   // 마크가
  openUtc?: string;
}

let _fTickers: { list: BitgetFuturesTicker[]; map: Map<string, BitgetFuturesTicker>; ts: number } | null = null;

export async function fetchBitgetFuturesTickers(): Promise<{ list: BitgetFuturesTicker[]; map: Map<string, BitgetFuturesTicker> }> {
  if (_fTickers && Date.now() - _fTickers.ts < TICKER_TTL) {
    return { list: _fTickers.list, map: _fTickers.map };
  }
  const res = await fetch(`${BITGET_BASE}/api/v2/mix/market/tickers?productType=USDT-FUTURES`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Bitget futures tickers ${res.status}`);
  const json = await res.json();
  if (json.code !== '00000') throw new Error(`Bitget ${json.code}: ${json.msg}`);
  const list = json.data as BitgetFuturesTicker[];
  const map = new Map<string, BitgetFuturesTicker>();
  for (const t of list) map.set(t.symbol, t);
  _fTickers = { list, map, ts: Date.now() };
  return { list, map };
}

/* ── 개인 계좌 (HMAC 서명) ─────────────────────────────────── */
function sign(timestamp: string, method: string, path: string, body: string, secret: string) {
  const prehash = timestamp + method.toUpperCase() + path + body;
  return crypto.createHmac('sha256', secret).update(prehash).digest('base64');
}

export function bitgetKeysConfigured(): boolean {
  return Boolean(
    process.env.BITGET_API_KEY &&
    process.env.BITGET_API_SECRET &&
    process.env.BITGET_API_PASSPHRASE,
  );
}

/** 서명된 GET 요청. 키 미설정 시 throw. requestPath는 쿼리스트링 포함 전체 경로. */
export async function bitgetSignedGet(requestPath: string): Promise<Record<string, unknown>> {
  const key  = process.env.BITGET_API_KEY;
  const sec  = process.env.BITGET_API_SECRET;
  const pass = process.env.BITGET_API_PASSPHRASE;
  if (!key || !sec || !pass) throw new Error('Bitget keys not configured');

  const timestamp = String(Date.now());
  const signature = sign(timestamp, 'GET', requestPath, '', sec);

  const res = await fetch(`${BITGET_BASE}${requestPath}`, {
    headers: {
      'ACCESS-KEY':        key,
      'ACCESS-SIGN':       signature,
      'ACCESS-TIMESTAMP':  timestamp,
      'ACCESS-PASSPHRASE': pass,
      'Content-Type':      'application/json',
      locale:              'en-US',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  const json = await res.json();
  if (json.code !== '00000') throw new Error(`Bitget ${json.code}: ${json.msg}`);
  return json;
}
