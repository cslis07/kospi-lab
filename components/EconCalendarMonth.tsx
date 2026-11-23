'use client';

/**
 * 월간 달력(그리드) 경제 캘린더 — 지표 발표·FOMC·한은·실적·휴장을 날짜 칸에 칩으로.
 * 데이터는 호출부가 CalEvt[]로 넘긴다(정적 CALENDAR_EVENTS + 나우캐스트 지표 발표일 병합 등).
 * KL-011: 폰(640px 미만)은 칸 안 글자가 잘려 읽을 수 없어서 색 점 + 건수만 보이고, 날짜를 누르면 그날 일정 전체를 시트로 연다(넓은 화면은 이름 칩 유지).
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import BottomSheet from '@/components/ui/BottomSheet';

export interface CalEvt { date: string; label: string; tone: 'fomc' | 'bok' | 'ind' | 'earn' | 'holi'; href?: string }

const TONE: Record<CalEvt['tone'], string> = {
  fomc: 'bg-violet-500/15 text-violet-500',
  bok: 'bg-amber-500/15 text-amber-500',
  ind: 'bg-sky-500/15 text-sky-500',
  earn: 'bg-emerald-500/15 text-emerald-500',
  holi: 'bg-[var(--surface-2)] text-[var(--text-muted)]',
};
const DOT: Record<CalEvt['tone'], string> = { fomc: 'bg-violet-500', bok: 'bg-amber-500', ind: 'bg-sky-500', earn: 'bg-emerald-500', holi: 'bg-[var(--text-muted)]' };
const TONE_NAME: Record<CalEvt['tone'], string> = { fomc: 'FOMC', bok: '한은', ind: '지표', earn: '실적', holi: '휴장' };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
function kstNow() { return new Date(Date.now() + 9 * 3_600_000); }
function todayStr() { const k = kstNow(); return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}-${String(k.getUTCDate()).padStart(2, '0')}`; }

export default function EconCalendarMonth({ events }: { events: CalEvt[] }) {
  const [cursor, setCursor] = useState(() => { const k = kstNow(); return { y: k.getUTCFullYear(), m: k.getUTCMonth() }; });
  const today = todayStr();
  const [openDay, setOpenDay] = useState<string | null>(null);
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
      <div className="grid grid-cols-7 text-center text-cap-pc font-semibold text-[var(--text-muted)] mb-1">
        {DOW.map((d, i) => <span key={d} className={i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : ''}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d == null) return <div key={i} />;
          const ds = dstr(d); const evs = byDate.get(ds) ?? []; const isToday = ds === today; const dow = i % 7;
          const tones = [...new Set(evs.map((e) => e.tone))];
          return (
            <button key={i} type="button" disabled={!evs.length} onClick={() => setOpenDay(ds)}
              aria-label={`${m + 1}월 ${d}일${isToday ? '(오늘)' : ''} 일정 ${evs.length}건`}
              className={`min-h-[54px] rounded-lg border p-1 overflow-hidden text-left align-top flex flex-col ${evs.length ? 'cursor-pointer hover:border-[var(--border-hover)]' : 'cursor-default'} ${isToday ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line-2)]'}`}>
              <span className={`text-cap-pc font-bold leading-none mb-0.5 ${dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-[var(--text)]'}`}>{d}</span>
              {/* 폰: 색 점 + 건수 */}
              {evs.length > 0 && (
                <span className="sm:hidden mt-auto flex items-center gap-0.5 flex-wrap">
                  {tones.map((t) => <span key={t} aria-hidden className={`w-1.5 h-1.5 rounded-full ${DOT[t]}`} />)}
                  <span className="text-[11px] font-bold text-[var(--text-muted)] tabular-nums leading-none ml-0.5">{evs.length}</span>
                </span>
              )}
              {/* 넓은 화면: 이름 칩 2개 + 나머지 수 */}
              <span className="hidden sm:block space-y-0.5 w-full">
                {evs.slice(0, 2).map((e, j) => <span key={j} className={`block text-cap leading-tight px-1 py-0.5 rounded truncate ${TONE[e.tone]}`} title={e.label}>{e.label}</span>)}
                {evs.length > 2 && <span className="block text-cap text-[var(--text-muted)] px-1 leading-none">+{evs.length - 2}</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-cap text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-sky-500/60" />지표</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-violet-500/60" />FOMC</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-500/60" />한은</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500/60" />실적</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-[var(--surface-2)] border border-[var(--line-2)]" />휴장</span>
        <span className="sm:hidden">· 날짜를 누르면 그날 일정 전체</span>
      </div>

      {/* 그날 일정 전체(KL-011) — 이름이 잘리지 않게 줄바꿈해서 보여 준다 */}
      <BottomSheet open={openDay != null} onClose={() => setOpenDay(null)}
        title={openDay ? `${Number(openDay.slice(5, 7))}월 ${Number(openDay.slice(8, 10))}일 일정 ${(byDate.get(openDay) ?? []).length}건` : ''}>
        <ul className="divide-y divide-[var(--line-2)]">
          {(openDay ? byDate.get(openDay) ?? [] : []).map((e, j) => (
            <li key={j} className="flex items-start gap-2.5 py-2.5">
              <span className={`shrink-0 mt-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded ${TONE[e.tone]}`}>{TONE_NAME[e.tone]}</span>
              {e.href
                ? <Link href={e.href} onClick={() => setOpenDay(null)} className="text-[14px] leading-snug text-[var(--accent-ink)] font-semibold break-keep">{e.label} →</Link>
                : <span className="text-[14px] leading-snug text-[var(--text)] break-keep">{e.label}</span>}
            </li>
          ))}
        </ul>
        <p className="text-[11.5px] text-[var(--text-muted)] mt-2">시각·예상·실제 값은 아래 &lsquo;이번 주 지표&rsquo;·&lsquo;다음 주요 발표&rsquo;에 한국 시간으로 나옵니다.</p>
      </BottomSheet>
    </div>
  );
}
