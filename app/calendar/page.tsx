'use client';

/**
 * 홈 › 경제 캘린더 — 분류 칩(가로) + 국가·중요도·지난 일정은 필터 바텀시트로 숨김.
 * 날짜별 묶음 카드 안에 중요도 막대·D-day 행. 날짜 기준은 KST(마운트 후 계산).
 */
import { useEffect, useMemo, useState } from 'react';
import { CALENDAR_EVENTS } from '@/lib/calendarEvents';
import type { CalendarEvent } from '@/lib/types';
import EventRow, { kstToday } from '@/components/EventRow';
import BottomSheet from '@/components/ui/BottomSheet';

type Cat = 'all' | CalendarEvent['category'];
type Country = 'all' | 'KR' | 'US';
type Imp = 'all' | 'mid' | 'high';

const CATS: { key: Cat; label: string }[] = [
  { key: 'all', label: '전체' }, { key: 'fomc', label: 'FOMC' }, { key: 'bok', label: '한국은행' },
  { key: 'indicator', label: '경제지표' }, { key: 'earnings', label: '실적시즌' }, { key: 'holiday', label: '휴장' },
];
const COUNTRIES: { key: Country; label: string }[] = [{ key: 'all', label: '전체' }, { key: 'KR', label: '한국' }, { key: 'US', label: '미국' }];
const IMPS: { key: Imp; label: string }[] = [{ key: 'all', label: '전체' }, { key: 'mid', label: '보통 이상' }, { key: 'high', label: '높음만' }];
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function dateLabel(d: string) {
  const dt = new Date(`${d}T00:00:00Z`);
  return `${dt.getUTCMonth() + 1}월 ${dt.getUTCDate()}일 (${DOW[dt.getUTCDay()]})`;
}

function Choice<T extends string>({ title, items, value, set }: { title: string; items: { key: T; label: string }[]; value: T; set: (v: T) => void }) {
  return (
    <div className="mb-5">
      <p className="text-[12.5px] font-extrabold text-[var(--muted)] mb-2">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <button key={i.key} type="button" className={`chip ${value === i.key ? 'active' : ''}`} aria-pressed={value === i.key} onClick={() => set(i.key)}>
            {i.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const [cat, setCat] = useState<Cat>('all');
  const [country, setCountry] = useState<Country>('all');
  const [imp, setImp] = useState<Imp>('all');
  const [showPast, setShowPast] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(kstToday()), []);

  const grouped = useMemo(() => {
    if (!today) return [];
    const list = CALENDAR_EVENTS
      .filter((e) => {
        if (!showPast && e.date < today) return false;
        if (cat !== 'all' && e.category !== cat) return false;
        if (country !== 'all' && !(e.country === country || e.country === 'global')) return false;
        if (imp === 'high' && e.importance !== 'high') return false;
        if (imp === 'mid' && e.importance === 'low') return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 80);
    const map = new Map<string, CalendarEvent[]>();
    for (const e of list) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return [...map.entries()];
  }, [today, cat, country, imp, showPast]);

  const nFilters = (country !== 'all' ? 1 : 0) + (imp !== 'all' ? 1 : 0) + (showPast ? 1 : 0);

  return (
    <div className="max-w-3xl mx-auto pb-8">
      <div className="chip-scroll mb-2">
        <button type="button" className={`chip ${nFilters ? 'active' : ''}`} onClick={() => setSheet(true)}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 5h18l-7 8.5V20l-4-2.5v-4L3 5Z" /></svg>
          필터{nFilters ? ` ${nFilters}` : ''}
        </button>
        {CATS.map((c) => (
          <button key={c.key} type="button" className={`chip ${cat === c.key ? 'active' : ''}`} aria-pressed={cat === c.key} onClick={() => setCat(c.key)}>
            {c.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-[var(--text-muted)] mb-4 px-1">중요도 막대 3칸 = 높음 · 날짜는 한국 시간 · 일정은 변경될 수 있습니다</p>

      {!today ? (
        <div className="space-y-3"><div className="skeleton h-28" /><div className="skeleton h-28" /></div>
      ) : grouped.length === 0 ? (
        <p className="text-center py-20 text-[var(--text-muted)] text-sm">해당 조건의 일정이 없습니다</p>
      ) : (
        grouped.map(([date, evts]) => (
          <section key={date} className={`fin-card overflow-hidden mb-3 ${date < today ? 'opacity-60' : ''}`}>
            <div className="cal-date">
              {dateLabel(date)}
              {date === today && <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[var(--warn)] text-white font-extrabold">오늘</span>}
            </div>
            {evts.map((e, i) => <EventRow key={`${e.title}-${i}`} e={e} today={today} showDate={false} />)}
          </section>
        ))
      )}

      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="캘린더 필터"
        footer={
          <div className="flex gap-2">
            <button type="button" className="flex-1 py-3 rounded-[var(--r-sm)] bg-[var(--surface-2)] text-sm font-bold text-[var(--ink)]"
              onClick={() => { setCountry('all'); setImp('all'); setShowPast(false); }}>초기화</button>
            <button type="button" className="kl-cta flex-[2] py-3 text-sm" onClick={() => setSheet(false)}>완료</button>
          </div>
        }>
        <Choice title="국가" items={COUNTRIES} value={country} set={setCountry} />
        <Choice title="중요도" items={IMPS} value={imp} set={setImp} />
        <button type="button" className="act-item" onClick={() => setShowPast((v) => !v)} aria-pressed={showPast}>
          <span className="act-tx"><b>지난 일정 포함</b><small>이미 지난 이벤트도 흐리게 표시</small></span>
          <span className={`tgl ${showPast ? 'on' : ''}`} aria-hidden />
        </button>
      </BottomSheet>
    </div>
  );
}
