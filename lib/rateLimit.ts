/**
 * IP 단위 슬라이딩 윈도우 rate limit.
 *
 * Vercel 서버리스는 인스턴스마다 메모리가 분리되므로 전역 카운팅은 되지 않는다.
 * 단일 클라이언트의 반복 호출을 막는 용도로만 신뢰할 것.
 */

const buckets = new Map<string, number[]>();
const MAX_KEYS = 5000;

export interface RateLimitResult {
  ok: boolean;
  /** 재시도까지 남은 초 (ok=true면 0) */
  retryAfter: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - hits[0])) / 1000) };
  }

  hits.push(now);
  buckets.set(key, hits);

  if (buckets.size > MAX_KEYS) {
    for (const [k, v] of buckets) {
      if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
    }
  }

  return { ok: true, retryAfter: 0 };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
