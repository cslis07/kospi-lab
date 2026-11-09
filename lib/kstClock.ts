/** 'HH:MM:SS' (KST) — 화면의 '○○ 갱신' 표시용 */
export function kstClock(ms: number): string {
  const kst = new Date(ms + 9 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}:${pad(kst.getUTCSeconds())}`;
}

/**
 * 서버가 미리 넣은 시세의 기준 시각 — 오늘(KST)이 아니면 날짜를 앞에 붙인다('11.07 06:03:31').
 * 주말·휴장 때 금요일 마감 시각이 날짜 없이 '06:03:31 갱신'으로 나가 오늘 값처럼 읽혔다.
 * 오늘 판정은 기기 시각을 쓰므로 하이드레이션 뒤(effect)에서만 부를 것 — 첫 렌더는 kstClock(서버·화면 같은 값).
 */
export function kstStamp(ms: number, now = Date.now()): string {
  const day = (t: number) => new Date(t + 9 * 3_600_000).toISOString().slice(0, 10);
  if (day(ms) === day(now)) return kstClock(ms);
  const d = day(ms);
  return `${d.slice(5, 7)}.${d.slice(8, 10)} ${kstClock(ms)}`;
}
