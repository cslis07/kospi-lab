'use client';

/**
 * 홈 › 주요 이벤트 — 데스크탑(PC) 전용 가로 월간 캘린더.
 * 모바일은 EventList(리스트)를 그대로 쓰고, 이 컴포넌트는 md+ 에서만 렌더한다.
 * 정적 CALENDAR_EVENTS 를 월 그리드에 배치. 오늘 강조·주말색(일 빨강/토 파랑)·지난날 흐림·중요도색.
 */
import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { CALENDAR_EVENTS } from '@/lib/calendarEvents';
import type { CalendarEvent } from '@/lib/types';
import { kstToday } from '@/components/EventRow';
import { CATEGORY_LABEL } from '@/components/EventRow';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** 중요도/분류별 이벤트 칩 색 */
function chipCls(e: CalendarEvent): string {
  if (e.category === 'holiday') return 'bg-[var(--surface-2)] text-[var(--text-muted)] border-[var(--border)]';
  if (e.importance === 'high') return 'bg-red-500/12 text-red-600 border-red-500/25';
  if (e.importance === 'medium') return 'bg-amber-500/12 text-amber-600 border-amber-500/25';
  return 'bg-[var(--surface-2)] text-[var(--text-muted)] border-[var(--border)]';
}

export default function EventCalendar() {
  const [today, setToday] = useState<string | null>(null);
  const [offset, setOffset] = useState(0); // 0 = 이번 달, +1 다음 달 …
  useEffect(() => setToday(kstToday()), []);

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of CALENDAR_EVENTS) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    // 각 날짜 안에서 중요도 높은 순
    const rank = { high: 0, medium: 1, low: 2 } as const;
    for (const arr of m.values()) arr.sort((a, b) => rank[a.importance] - rank[b.importance]);
    return m;
  }, []);

  const view = useMemo(() => {
    if (!today) return null;
    const base = new Date(`${today}T00:00:00Z`);
    const first = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1));
    const year = first.getUTCFullYear();
    const month = first.getUTCMonth();
    const firstDow = first.getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const cellCount = Math.ceil((firstDow + daysInMonth) / 7) * 7;
    const cells = Array.from({ length: cellCount }, (_, i) => {
      const d = new Date(Date.UTC(year, month, i - firstDow + 1));
      const iso = fmt(d);
      return { iso, day: d.getUTCDate(), dow: d.getUTCDay(), inMonth: d.getUTCMonth() === month, events: byDate.get(iso) ?? [] };
    });
    return { year, month, cells };
  }, [today, offset, byDate]);

  return (
    <section className="hidden md:block">
      <div className="fin-sec">
        <h3>주요 이벤트</h3>
        <Link href="/calendar" className="fin-more">캘린더 전체</Link>
      </div>

      <div className="fin-card p-4">
        {!view ? (
          <div className="skeleton h-72" />
        ) : (
          <>
            {/* 월 이동 헤더 */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setOffset((o) => o - 1)} aria-label="이전 달"
                  className="w-8 h-8 grid place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
                </button>
                <span className="text-base font-extrabold text-[var(--text)] tabular-nums px-1 min-w-[110px] text-center">{view.year}년 {view.month + 1}월</span>
                <button type="button" onClick={() => setOffset((o) => o + 1)} aria-label="다음 달"
                  className="w-8 h-8 grid place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
                </button>
                {offset !== 0 && (
                  <button type="button" onClick={() => setOffset(0)} className="ml-1 text-xs font-semibold text-[var(--accent)] px-2 py-1 rounded-lg hover:bg-[var(--accent-soft)]">오늘</button>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
                <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-red-500/40 inline-block" />중요</span>
                <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-amber-500/40 inline-block" />보통</span>
                <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-[var(--surface-2)] border border-[var(--border)] inline-block" />휴장</span>
              </div>
            </div>

            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 mb-1">
              {DOW.map((d, i) => (
                <div key={d} className={`text-center text-[11px] font-bold py-1 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-[var(--text-muted)]'}`}>{d}</div>
              ))}
            </div>

            {/* 날짜 그리드 */}
            <div className="grid grid-cols-7 gap-1">
              {view.cells.map((c) => {
                const isToday = c.iso === today;
                const past = today ? c.iso < today : false;
                const shown = c.events.slice(0, 3);
                const more = c.events.length - shown.length;
                return (
                  <div key={c.iso}
                    className={`min-h-[92px] rounded-lg border p-1.5 flex flex-col gap-1 transition-colors ${
                      isToday ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)] bg-[var(--bg-card)]'
                    } ${!c.inMonth ? 'opacity-40' : past ? 'opacity-70' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-[12px] font-bold tabular-nums ${
                        isToday ? 'text-[var(--accent)]' : c.dow === 0 ? 'text-red-500' : c.dow === 6 ? 'text-blue-500' : 'text-[var(--text)]'
                      }`}>{c.day}</span>
                      {isToday && <span className="text-[9px] font-extrabold text-white bg-[var(--accent)] rounded px-1 leading-4">오늘</span>}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {shown.map((e, i) => (
                        <Link key={i} href="/calendar" title={`${e.title} · ${CATEGORY_LABEL[e.category]}${e.desc ? ` · ${e.desc}` : ''}`}
                          className={`block text-[10px] leading-tight font-semibold truncate rounded border px-1 py-0.5 hover:brightness-105 ${chipCls(e)}`}>
                          {e.title}
                        </Link>
                      ))}
                      {more > 0 && <Link href="/calendar" className="text-[9.5px] text-[var(--text-muted)] font-semibold pl-0.5 hover:text-[var(--accent)]">+{more}건</Link>}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-2.5 opacity-70">날짜는 한국 시간 기준 · 일정은 변경될 수 있습니다 · 칩을 클릭하면 전체 캘린더에서 상세 확인</p>
          </>
        )}
      </div>
    </section>
  );
}
