/**
 * 경제 이벤트 한 줄 — 날짜·요일 | 중요도 막대(3단) | 제목·분류·국가 | D-day.
 * 홈 '주요 이벤트'와 경제 캘린더 화면이 같이 쓴다. 날짜 기준은 KST(UTC 로 자르면 오전 9시 전 '어제'가 된다).
 */
import type { CalendarEvent } from '@/lib/types';

export const CATEGORY_LABEL: Record<CalendarEvent['category'], string> = {
  fomc: 'FOMC', bok: '한국은행', earnings: '실적시즌', indicator: '경제지표', holiday: '휴장',
};
const COUNTRY: Record<string, string> = { KR: '한국', US: '미국', global: '글로벌' };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const IMP_LEVEL: Record<CalendarEvent['importance'], number> = { high: 3, medium: 2, low: 1 };

/** KST 기준 오늘 'YYYY-MM-DD' */
export function kstToday(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}
/** 두 'YYYY-MM-DD' 사이 일수(b - a) */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export default function EventRow({ e, today, showDate = true }: { e: CalendarEvent; today: string; showDate?: boolean }) {
  const d = new Date(`${e.date}T00:00:00Z`);
  const dd = daysBetween(today, e.date);
  const past = dd < 0;
  const lv = IMP_LEVEL[e.importance];
  return (
    <div className={`ev-row ${past ? 'past' : ''} ${dd === 0 ? 'today' : ''}`}>
      {showDate && (
        <div className="ev-date">
          <b>{d.getUTCMonth() + 1}.{d.getUTCDate()}</b>
          <small>{DOW[d.getUTCDay()]}</small>
        </div>
      )}
      <span className={`ev-imp lv${lv}`} role="img" aria-label={`중요도 ${lv === 3 ? '높음' : lv === 2 ? '보통' : '낮음'}`}>
        <i /><i /><i />
      </span>
      <div className="ev-main">
        <div className="t">{e.title}</div>
        <div className="s">{CATEGORY_LABEL[e.category]} · {COUNTRY[e.country] ?? e.country}{e.desc ? ` · ${e.desc}` : ''}</div>
      </div>
      <span className={`ev-dday ${dd === 0 ? 'on' : ''}`}>{past ? '지남' : dd === 0 ? '오늘' : `D-${dd}`}</span>
    </div>
  );
}
