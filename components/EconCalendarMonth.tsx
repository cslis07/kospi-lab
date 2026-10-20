'use client';

/**
 * 월간 달력(그리드) 경제 캘린더 — 지표 발표·FOMC·한은·실적·휴장을 날짜 칸에 칩으로.
 * 데이터는 호출부가 CalEvt[]로 넘긴다(정적 CALENDAR_EVENTS + 나우캐스트 지표 발표일 병합 등).
 */
import { useMemo, useState } from 'react';

export interface CalEvt { date: string; label: string; tone: 'fomc' | 'bok' | 'ind' | 'earn' | 'holi'; href?: string }

const TONE: Record<CalEvt['tone'], string> = {
  fomc: 'bg-violet-500/15 text-violet-500',
  bok: 'bg-amber-500/15 text-amber-500',
  ind: 'bg-sky-500/15 text-sky-500',
  earn: 'bg-emerald-500/15 text-emerald-500',
  holi: 'bg-[var(--surface-2)] text-[var(--text-muted)]',
};
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
function kstNow() { return new Date(Date.now() + 9 * 3_600_000); }
function todayStr() { const k = kstNow(); return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}-${String(k.getUTCDate()).padStart(2, '0')}`; }

export default function EconCalendarMonth({ events }: { events: CalEvt[] }) {
  const [cursor, setCursor] = useState(() => { const k = kstNow(); return { y: k.getUTCFullYear(), m: k.getUTCMonth() }; });
  const today = todayStr();
  const { y, m } = cursor;
  const startDow = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

  const byDate = useMemo(() => {
    const map = new Map<string, CalEvt[]>();
    for (const e of events) { if (!e.date) continue; const d = e.date.slice(0, 10); map.set(d, [...(map.get(d) ?? []), e]); }
    return map;
  }, [events]);

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const dstr = (d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const go = (delta: number) => setCursor(({ y, m }) => { const nm = m + delta; return { y: y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 }; });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => go(-1)} aria-label="이전 달" className="w-7 h-7 grid place-items-center rounded-lg border border-[var(--line-2)] text-[var(--text-muted)] hover:text-[var(--text)]">‹</button>
        <span className="text-[13px] font-bold text-[var(--text)] tabular-nums">{y}년 {m + 1}월</span>
        <button type="button" onClick={() => go(1)} aria-label="다음 달" className="w-7 h-7 grid place-items-center rounded-lg border border-[var(--line-2)] text-[var(--text-muted)] hover:text-[var(--text)]">›</button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-[var(--text-muted)] mb-1">
        {DOW.map((d, i) => <span key={d} className={i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : ''}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d == null) return <div key={i} />;
          const ds = dstr(d); const evs = byDate.get(ds) ?? []; const isToday = ds === today; const dow = i % 7;
          return (
            <div key={i} className={`min-h-[54px] rounded-lg border p-1 overflow-hidden ${isToday ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line-2)]'}`}>
              <div className={`text-[10px] font-bold leading-none mb-0.5 ${dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-[var(--text)]'}`}>{d}</div>
              <div className="space-y-0.5">
                {evs.slice(0, 2).map((e, j) => <div key={j} className={`text-[8.5px] leading-tight px-1 py-0.5 rounded truncate ${TONE[e.tone]}`} title={e.label}>{e.label}</div>)}
                {evs.length > 2 && <div className="text-[8px] text-[var(--text-muted)] px-1 leading-none">+{evs.length - 2}</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[9px] text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-sky-500/60" />지표</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-violet-500/60" />FOMC</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-500/60" />한은</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500/60" />실적</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-[var(--surface-2)] border border-[var(--line-2)]" />휴장</span>
      </div>
    </div>
  );
}
