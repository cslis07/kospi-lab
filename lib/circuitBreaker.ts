/**
 * 손실 서킷브레이커 — 다음 -419 를 막는다.
 *
 * 트레이더를 터뜨리는 건 한 번의 큰 손실보다 '연패 후 복구 매매(틸트)'다.
 * 이 앱은 방향을 못 맞히지만, "오늘 이미 너무 잃었다 / 연속으로 깨지고 있다"는
 * 산수로 확실히 알 수 있다. 그걸 근거로 신규 진입을 멈추라고 말한다(강제는 아니고 경고·차단 신호).
 *
 * 순수 함수 — tests/engine.test.ts 로 고정한다.
 */

export interface BreakerEntry {
  ts: number;
  result: 'open' | 'win' | 'loss' | 'even';
  realizedUsdt?: number | null;
}

export interface BreakerLimits {
  maxConsecutiveLosses: number;         // 이 이상 연속 손절이면 차단 (기본 3)
  dailyLossLimitUsdt: number | null;    // 오늘 실현손실이 이 값(양수)을 넘으면 차단
  weeklyLossLimitUsdt: number | null;
}

export const DEFAULT_LIMITS: BreakerLimits = {
  maxConsecutiveLosses: 3,
  dailyLossLimitUsdt: null,
  weeklyLossLimitUsdt: null,
};

export interface BreakerState {
  status: 'ok' | 'warn' | 'blocked';
  reasons: string[];
  lossStreak: number;
  todayRealized: number | null;
  weekRealized: number | null;
}

const KST = 9 * 3600_000;
/** ms epoch → KST 자정 기준 '그 날'의 시작(ms, UTC epoch) */
function kstDayStart(ts: number): number {
  const d = ts + KST;
  return Math.floor(d / 86_400_000) * 86_400_000 - KST;
}

export function evaluateBreaker(entries: BreakerEntry[], limits: BreakerLimits, now = Date.now()): BreakerState {
  const closed = entries.filter((e) => e.result !== 'open').sort((a, b) => a.ts - b.ts);

  // 현재 연속 손절(뒤에서)
  let lossStreak = 0;
  for (let i = closed.length - 1; i >= 0; i--) {
    if (closed[i].result === 'even') continue;
    if (closed[i].result === 'loss') lossStreak++; else break;
  }

  const todayStart = kstDayStart(now);
  const weekStart = todayStart - 6 * 86_400_000;   // 최근 7일(오늘 포함)
  const sumFrom = (from: number) => {
    const rows = closed.filter((e) => e.ts >= from && e.realizedUsdt != null);
    return rows.length ? rows.reduce((a, e) => a + (e.realizedUsdt ?? 0), 0) : null;
  };
  const todayRealized = sumFrom(todayStart);
  const weekRealized = sumFrom(weekStart);

  const reasons: string[] = [];
  let blocked = false, warn = false;

  if (lossStreak >= limits.maxConsecutiveLosses) {
    blocked = true;
    reasons.push(`${lossStreak}연속 손절 — 연패 직후 복구 매매가 손실을 키웁니다. 오늘은 멈추세요.`);
  } else if (lossStreak === limits.maxConsecutiveLosses - 1 && lossStreak >= 2) {
    warn = true;
    reasons.push(`${lossStreak}연속 손절 — 한 번 더 지면 서킷브레이커가 작동합니다.`);
  }

  if (limits.dailyLossLimitUsdt != null && todayRealized != null && todayRealized <= -limits.dailyLossLimitUsdt) {
    blocked = true;
    reasons.push(`오늘 실현손실 ${Math.round(todayRealized)} USDT — 일일 한도(-${limits.dailyLossLimitUsdt}) 초과.`);
  } else if (limits.dailyLossLimitUsdt != null && todayRealized != null && todayRealized <= -limits.dailyLossLimitUsdt * 0.7) {
    warn = true;
    reasons.push(`오늘 실현손실 ${Math.round(todayRealized)} USDT — 일일 한도(-${limits.dailyLossLimitUsdt})의 70% 도달.`);
  }

  if (limits.weeklyLossLimitUsdt != null && weekRealized != null && weekRealized <= -limits.weeklyLossLimitUsdt) {
    blocked = true;
    reasons.push(`이번 주 실현손실 ${Math.round(weekRealized)} USDT — 주간 한도(-${limits.weeklyLossLimitUsdt}) 초과.`);
  }

  return { status: blocked ? 'blocked' : warn ? 'warn' : 'ok', reasons, lossStreak, todayRealized, weekRealized };
}
