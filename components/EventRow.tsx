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

/** 미국 동부 서머타임 여부(대략: 3월 둘째주~11월 첫주). 발표시각의 KST 환산에 쓴다. */
function isUsDst(dateStr: string): boolean {
  const [, m, d] = dateStr.split('-').map(Number);
  if (m > 3 && m < 11) return true;   // 4~10월
  if (m === 3) return d >= 8;          // 3월 둘째 일요일 무렵부터
  return false;                        // 11~2월(11월 첫주 이후 EST)
}

/**
 * 이벤트의 한국시간(KST) 시작/발표 시각. override(timeKst) 우선, 없으면 카테고리 기본값.
 * 미 지표(08:30 ET)·FOMC(14:00 ET)는 서머타임에 따라 1시간 이동. 휴장·실적시즌은 시각 없음(종일/기간).
 */
export function eventTimeKst(e: CalendarEvent): string | null {
  if (e.timeKst) return e.timeKst;
  const dst = isUsDst(e.date);
  switch (e.category) {
    case 'indicator': return dst ? '21:30' : '22:30';        // 미 08:30 ET (고용·CPI)
    case 'fomc':      return dst ? '익일 03:00' : '익일 04:00'; // 미 14:00 ET 결과 발표
    case 'bok':       return '09:00';                          // 한국은행 발표(오전)
    default:          return null;                             // earnings·holiday
  }
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
        <div className="s">
          {(() => { const tm = eventTimeKst(e); return tm
            ? <b className="text-[var(--accent-ink)] font-bold">{tm} </b>
            : e.category === 'holiday' ? <span>종일 · </span> : null; })()}
          {CATEGORY_LABEL[e.category]} · {COUNTRY[e.country] ?? e.country}{e.desc ? ` · ${e.desc}` : ''}
        </div>
      </div>
      <span className={`ev-dday ${dd === 0 ? 'on' : ''}`}>{past ? '지남' : dd === 0 ? '오늘' : `D-${dd}`}</span>
    </div>
  );
}
