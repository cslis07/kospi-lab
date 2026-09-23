'use client';

/**
 * 홈 › 주요 이벤트 — 다가오는 고·중요도 일정(+10일 내 휴장). 중요도 막대·D-day 로 훑는다.
 * 오늘 날짜는 마운트 후 KST 로 계산(빌드 시점 날짜가 굳지 않게).
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CALENDAR_EVENTS } from '@/lib/calendarEvents';
import EventRow, { kstToday, daysBetween } from '@/components/EventRow';

export default function EventList({ limit = 5 }: { limit?: number }) {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(kstToday()), []);

  const list = useMemo(() => {
    if (!today) return [];
    return CALENDAR_EVENTS
      .filter((e) => e.date >= today)
      .filter((e) => e.importance !== 'low' || (e.category === 'holiday' && daysBetween(today, e.date) <= 10))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, limit);
  }, [today, limit]);

  return (
    <section>
      <div className="fin-sec">
        <h3>주요 이벤트</h3>
        <Link href="/calendar" className="fin-more">캘린더</Link>
      </div>
      <div className="fin-card overflow-hidden">
        {!today ? (
          [0, 1, 2].map((i) => <div key={i} className="ev-row"><span className="skeleton h-9 w-full" /></div>)
        ) : list.length ? (
          // 항목을 누르면 경제 캘린더로 진입(메뉴에서 캘린더를 뺀 대신)
          list.map((e) => (
            <Link key={`${e.date}-${e.title}`} href="/calendar" className="block active:bg-[var(--surface-2)]">
              <EventRow e={e} today={today} />
            </Link>
          ))
        ) : (
          <p className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">예정된 주요 이벤트가 없습니다</p>
        )}
      </div>
    </section>
  );
}
