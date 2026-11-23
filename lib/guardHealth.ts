/**
 * 포지션 가드 실행 상태(KL-006) — 순수 모듈(서버 코드 없음). lib/guard 가 기록하고, 홈 '지금 내 상태'가 판정해 보여 준다.
 * 가드는 텔레그램 알림만 보낸다 — 거래소 손절 주문을 대신하거나 청산을 막지 않는다.
 */

/** 가드 실행 기록(Supabase kl_sync 'guard-heartbeat', 개인정보 없음) — at = 마지막 성공 시각(예전 형식과 호환) */
export interface GuardHeartbeat {
  at?: number; startedAt?: number; durationMs?: number; positions?: number; alerts?: string[];
  notified?: 'sent' | 'failed' | 'none';
  lastErrorAt?: number; lastError?: string;
}

export type GuardHealthState = 'ok' | 'delayed' | 'failed' | 'none';
export const GUARD_STALE_MS = 15 * 60_000;

/**
 * 5분 주기지만 GitHub 실행은 몇 분씩 밀리므로 15분 넘게 성공이 없을 때만 '지연'.
 * 마지막 실패가 마지막 성공보다 뒤면 '실패'. 기록이 없으면 'none'.
 */
export function guardHealth(hb: Pick<GuardHeartbeat, 'at' | 'lastErrorAt'> | null, now: number, staleMs = GUARD_STALE_MS): { state: GuardHealthState; lastSuccessAgoMs: number | null; lastErrorAgoMs: number | null } {
  const okAt = hb?.at ?? null, errAt = hb?.lastErrorAt ?? null;
  const lastSuccessAgoMs = okAt != null ? Math.max(0, now - okAt) : null;
  const lastErrorAgoMs = errAt != null ? Math.max(0, now - errAt) : null;
  if (okAt == null && errAt == null) return { state: 'none', lastSuccessAgoMs, lastErrorAgoMs };
  if (errAt != null && (okAt == null || errAt > okAt)) return { state: 'failed', lastSuccessAgoMs, lastErrorAgoMs };
  if (lastSuccessAgoMs != null && lastSuccessAgoMs > staleMs) return { state: 'delayed', lastSuccessAgoMs, lastErrorAgoMs };
  return { state: 'ok', lastSuccessAgoMs, lastErrorAgoMs };
}
