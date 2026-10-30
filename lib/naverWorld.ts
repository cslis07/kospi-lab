/**
 * 네이버 해외주식(api.stock.naver.com) 공용 — 티커 → 로이터 코드 확인. 해외 인사이트·실적 라우트가 같이 쓴다.
 * 뉴욕 상장은 티커 그대로, 나스닥 .O, 그 외 .K/.N/.A — 없는 코드는 409 라 차례로 시도(하루 캐시).
 */
import { reutersCandidates } from './stockInsight';

export const NAVER_WORLD_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://m.stock.naver.com/',
  'Accept': 'application/json',
};

export async function resolveReuters(symbol: string): Promise<string | null> {
  for (const code of reutersCandidates(symbol)) {
    const r = await fetch(`https://api.stock.naver.com/stock/${encodeURIComponent(code)}/basic`, { headers: NAVER_WORLD_HEADERS, next: { revalidate: 86400 }, signal: AbortSignal.timeout(6000) }).catch(() => null);
    if (r?.ok) return code;
  }
  return null;
}

export const isSymbol = (s: string) => /^[A-Za-z0-9.\-]{1,12}$/.test(s);
