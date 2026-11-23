/**
 * 다음 미국 주요 발표와 거래 보류 구간(KL-010) — 순수 함수. 홈 상단 한 줄이 쓴다.
 * 입력은 공개 /api/intel/context 의 releases(공식 일정, UTC ISO). 보류 구간 = 발표 전 preMin ~ 후 postMin(위험관리 설정, 기본 60/30).
 * lib/intel/marketBoard.buildMarketBoard 의 nextRelease 와 같은 규칙(그쪽은 뉴스·유동성까지 묶은 무거운 판이라 홈엔 이것만).
 */
export interface ReleaseLike { title: string; at: string }
export interface NextReleaseWindow { title: string; atMs: number; fromMs: number; toMs: number; active: boolean; minutesUntil: number }

export function nextReleaseWindow(releases: ReleaseLike[] | null | undefined, nowMs: number, preMin = 60, postMin = 30): NextReleaseWindow | null {
  const rows = (releases ?? [])
    .map((r) => ({ title: r.title, atMs: Date.parse(r.at) }))
    .filter((r) => r.title && Number.isFinite(r.atMs) && r.atMs + postMin * 60_000 >= nowMs)
    .sort((a, b) => a.atMs - b.atMs);
  const r = rows[0];
  if (!r) return null;
  const fromMs = r.atMs - preMin * 60_000, toMs = r.atMs + postMin * 60_000;
  return { title: r.title, atMs: r.atMs, fromMs, toMs, active: nowMs >= fromMs && nowMs <= toMs, minutesUntil: Math.round((r.atMs - nowMs) / 60_000) };
}

/** 한국 시간 'MM/DD(요일) HH:MM' */
export function fmtKstShort(ms: number): string {
  const d = new Date(ms + 9 * 3_600_000);
  const dow = '일월화수목금토'[d.getUTCDay()];
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${dow}) ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
export function fmtKstHm(ms: number): string {
  const d = new Date(ms + 9 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
