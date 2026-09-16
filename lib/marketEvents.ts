/**
 * 시장 이벤트 데이터셋 — 매매 시각과 대조해 "그때 무슨 일이 있었나"를 알린다.
 * ⚠ 이벤트로 방향을 예측하지 않는다. 오직 "고변동 구간에서 진입/보유했는가"라는 리스크 관점.
 * 큐레이션 시드(FOMC·CPI·주요 크립토 사건) + 사용자가 직접 넣은 이벤트를 합친다.
 */
export type EventScope = 'crypto' | 'stocks' | 'all';
export interface MarketEvent { ts: number; title: string; type: string; impact: 'high' | 'med'; scope: EventScope; approx?: boolean; note?: string }

const E = (iso: string, title: string, type: string, impact: 'high' | 'med', scope: EventScope, approx = false, note?: string): MarketEvent =>
  ({ ts: Date.parse(iso), title, type, impact, scope, approx, note });

// FOMC 금리 결정 (결정일 18:00 UTC ≈ 14:00 ET) — 2024~2026 공식 일정
const FOMC = ['2024-01-31', '2024-03-20', '2024-05-01', '2024-06-12', '2024-07-31', '2024-09-18', '2024-11-07', '2024-12-18',
  '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18', '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10',
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-11-04', '2026-12-16']
  .map((d) => E(`${d}T18:00Z`, 'FOMC 금리 결정', 'FOMC', 'high', 'all'));

// 미 CPI 발표 (08:30 ET ≈ 12:30~13:30 UTC) — 날짜 근사(approx)
const CPI = ['2025-01-15', '2025-02-12', '2025-03-12', '2025-04-10', '2025-05-13', '2025-06-11', '2025-07-15', '2025-08-12', '2025-09-11', '2025-10-15', '2025-11-13', '2025-12-10',
  '2026-01-13', '2026-02-11', '2026-03-11', '2026-04-10', '2026-05-12', '2026-06-10', '2026-07-14', '2026-08-12', '2026-09-11']
  .map((d) => E(`${d}T12:30Z`, '미국 CPI 발표', 'CPI', 'high', 'all', true));

// 주요 크립토 사건 (approx 표시된 건 날짜 근사)
const CRYPTO: MarketEvent[] = [
  E('2024-01-11T00:00Z', '비트코인 현물 ETF 승인', 'ETF', 'high', 'crypto'),
  E('2024-04-20T00:00Z', '비트코인 4차 반감기', 'HALVING', 'high', 'crypto'),
  E('2024-07-23T00:00Z', '이더리움 현물 ETF 상장', 'ETF', 'high', 'crypto'),
  E('2025-07-18T00:00Z', 'GENIUS 법안(스테이블코인) 서명', 'LAW', 'high', 'crypto', true),
  E('2025-07-17T00:00Z', 'CLARITY 법안 하원 통과', 'LAW', 'high', 'crypto', true, '상원 절차는 별도 — 정확한 날짜는 직접 이벤트로 추가 권장'),
];

export const SEED_EVENTS: MarketEvent[] = [...FOMC, ...CPI, ...CRYPTO].sort((a, b) => a.ts - b.ts);

export interface NearEvent extends MarketEvent { deltaMs: number; side: 'before' | 'after' }
/**
 * 진입 시각 주변(±windowMs) 이벤트. deltaMs = entryTs − event.ts.
 * side='after' → 진입이 이벤트 뒤(통과 후 진입), 'before' → 진입이 이벤트 앞(통과 전 진입).
 */
export function eventsNear(entryTs: number, events: MarketEvent[], windowMs: number, scope?: EventScope): NearEvent[] {
  return events
    .filter((e) => scope == null || e.scope === 'all' || e.scope === scope)
    .map((e) => ({ ...e, deltaMs: entryTs - e.ts, side: (entryTs >= e.ts ? 'after' : 'before') as 'before' | 'after' }))
    .filter((e) => Math.abs(e.deltaMs) <= windowMs)
    .sort((a, b) => Math.abs(a.deltaMs) - Math.abs(b.deltaMs));
}
export const humanDelta = (ms: number) => {
  const h = Math.round(Math.abs(ms) / 3_600_000);
  return h < 24 ? `${h}시간` : `${Math.round(h / 24)}일`;
};
