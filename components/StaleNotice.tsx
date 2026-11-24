/**
 * 갱신 실패 안내 한 줄(KL-012 후속) — 이미 받은 시세가 있는데 다음 갱신이 실패한 동안만 보인다.
 * SWR 은 실패해도 직전 값을 유지하므로(공용 jsonFetcher = 실패는 예외) 화면은 지우지 않고,
 * 그 값이 최신이 아니라는 것만 알린다. 첫 로딩 실패(받은 값 없음)는 각 화면의 실패 문구가 맡는다.
 */
export default function StaleNotice({ show, at, what = '시세', className = '' }: {
  /** 받은 값이 있고 지금 갱신이 실패 중일 때 true */
  show: boolean;
  /** 마지막으로 받은 시각(예: '14:05') — 없으면 '직전 값' */
  at?: string | null;
  what?: string;
  className?: string;
}) {
  if (!show) return null;
  return (
    <p role="status" className={`text-xs text-[var(--amber)] ${className}`}>
      ⚠ {what} 갱신 실패 — {at ? `${at}에 받은 값` : '직전 값'}을 보여 주는 중(자동 재시도)
    </p>
  );
}
