/**
 * 코인 카탈로그 — 시장 › 코인 시세 목록과 통합 검색(코인 섹션)의 단일 소스.
 * 심볼은 USDT 페어(/api/crypto/batch · /crypto/[symbol] 과 같은 표기). 한글명은 국내 통용 명칭.
 */
export interface CoinMeta { symbol: string; base: string; name: string; ko: string }

export const COINS: CoinMeta[] = [
  { symbol: 'BTCUSDT',  base: 'BTC',  name: 'Bitcoin',   ko: '비트코인' },
  { symbol: 'ETHUSDT',  base: 'ETH',  name: 'Ethereum',  ko: '이더리움' },
  { symbol: 'XRPUSDT',  base: 'XRP',  name: 'XRP',       ko: '리플' },
  { symbol: 'SOLUSDT',  base: 'SOL',  name: 'Solana',    ko: '솔라나' },
  { symbol: 'BNBUSDT',  base: 'BNB',  name: 'BNB',       ko: '바이낸스코인' },
  { symbol: 'DOGEUSDT', base: 'DOGE', name: 'Dogecoin',  ko: '도지코인' },
  { symbol: 'ADAUSDT',  base: 'ADA',  name: 'Cardano',   ko: '에이다' },
  { symbol: 'TRXUSDT',  base: 'TRX',  name: 'TRON',      ko: '트론' },
  { symbol: 'AVAXUSDT', base: 'AVAX', name: 'Avalanche', ko: '아발란체' },
  { symbol: 'LINKUSDT', base: 'LINK', name: 'Chainlink', ko: '체인링크' },
  { symbol: 'SUIUSDT',  base: 'SUI',  name: 'Sui',       ko: '수이' },
  { symbol: 'LTCUSDT',  base: 'LTC',  name: 'Litecoin',  ko: '라이트코인' },
];

export function searchCoins(q: string): CoinMeta[] {
  const raw = q.trim();
  const t = raw.toLowerCase();
  if (!t) return [];
  return COINS.filter((c) =>
    c.base.toLowerCase().includes(t) || c.name.toLowerCase().includes(t) || c.ko.includes(raw) || c.symbol.toLowerCase().startsWith(t));
}

/** 코인 가격 표시 — 가격대별 유효자리 */
export function fmtCoinPrice(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return '—';
  if (p >= 1000) return `$${p.toLocaleString('en-US', { maximumFractionDigits: 1 })}`;
  if (p >= 1) return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
  return `$${p.toFixed(5)}`;
}
