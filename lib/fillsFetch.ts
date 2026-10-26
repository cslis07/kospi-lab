/**
 * /api/bitget/fills 클라이언트 공용 조회 — 수수료 진단(FeeDiagCard)·비용 누수(CostLeakCard)와 규율 점수 '지정가 진입' 줄(DisciplineCard)이
 * 같은 기간 체결 내역을 두 번 조회하지 않게(Bitget 서명 API 7일 구간 여러 번) 짧게 메모리 공유한다. 브라우저 전용.
 */
import type { FeeDiag, EntryScopeDay } from './feeDiag';
import type { FillLeak } from './costLeak';

export type FillsResp = {
  configured?: boolean; diag?: FeeDiag; leak?: FillLeak; truncated?: boolean; error?: string; locked?: boolean;
  entryByDay?: EntryScopeDay[];
};

const TTL = 60_000;
const cache = new Map<number, { ts: number; p: Promise<FillsResp> }>();

export function fetchFillsResp(days: number): Promise<FillsResp> {
  const hit = cache.get(days);
  if (hit && Date.now() - hit.ts < TTL) return hit.p;
  const p = fetch(`/api/bitget/fills?days=${days}&byDay=1`)
    .then(async (res) => (res.status === 401 ? { locked: true } : ((await res.json()) as FillsResp)))
    .catch((e) => ({ error: String(e) }) as FillsResp);
  cache.set(days, { ts: Date.now(), p });
  p.then((r) => { if (r.error) cache.delete(days); });
  return p;
}
