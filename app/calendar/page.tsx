'use client';

/**
 * 홈 › 경제 캘린더 — 분류 칩(가로) + 국가·중요도·지난 일정은 필터 바텀시트로 숨김.
 * 날짜별 묶음 카드 안에 중요도 막대·D-day 행. 날짜 기준은 KST(마운트 후 계산).
 */
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { CALENDAR_EVENTS } from '@/lib/calendarEvents';
import type { CalendarEvent } from '@/lib/types';
import EventRow, { kstToday } from '@/components/EventRow';
import BottomSheet from '@/components/ui/BottomSheet';
import EconCalendarMonth, { type CalEvt } from '@/components/EconCalendarMonth';
import { dedupeForCalendar, type MacroEvt, type MacroRelease } from '@/lib/macroEvents';
import NextReleases from '@/components/NextReleases';
import PastReleases from '@/components/PastReleases';
import type { ReleaseCalendar, EconCalWindow } from '@/lib/inflation';

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const KIND_KO: Record<string, string> = { cpi: 'CPI', pce: 'PCE', ppi: 'PPI', jobs: '고용', nfp: '고용', gdp: 'GDP', retail: '소매판매' };
const CAT_TONE: Record<string, CalEvt['tone']> = { fomc: 'fomc', bok: 'bok', earnings: 'earn', holiday: 'holi', indicator: 'ind' };

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
  // 홈 '주요 이벤트'에서 ?date= 로 들어오면 그 날짜로 스크롤 + 잠시 강조
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    setToday(kstToday());
    const p = new URLSearchParams(window.location.search).get('date');
    if (p && /^\d{4}-\d{2}-\d{2}$/.test(p)) setTarget(p);
  }, []);
  // 지난 날짜로 들어오면 '지난 일정 포함'을 켜서 보이게 한다
  useEffect(() => { if (target && today && target < today) setShowPast(true); }, [target, today]);

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

  // 달력(월간 그리드)용 — 정적 일정 + 나우캐스트 미국 지표 발표일을 모두 표시(필터는 아래 목록에만 적용)
  const { data: relCal } = useSWR<ReleaseCalendar>('/api/nf/release_calendar.json', fetcher, { revalidateOnFocus: false });
  const { data: econWin } = useSWR<EconCalWindow>('/api/nf/econcal_window.json', fetcher, { revalidateOnFocus: false });
  const { data: soso } = useSWR<{ events: MacroEvt[]; upcoming: MacroRelease[] }>('/api/macro/events', fetcher, { revalidateOnFocus: false });
  const calEvents = useMemo<CalEvt[]>(() => {
    const out: CalEvt[] = CALENDAR_EVENTS.map((e) => ({ date: e.date, label: e.title, tone: CAT_TONE[e.category] ?? 'ind' }));
    for (const e of relCal?.events ?? []) {
      if (!e.date) continue;
      out.push({ date: e.date.slice(0, 10), label: `${KIND_KO[e.kind] ?? e.kind.toUpperCase()}${e.data_month ? ` ${e.data_month}` : ''}`, tone: 'ind' });
    }
    // SoSoValue 거시 이벤트 — 같은 날 같은 지표가 이미 있으면 생략
    for (const e of dedupeForCalendar(soso?.events ?? [], out)) out.push({ date: e.date, label: e.ko, tone: e.key === 'fomc' || e.key === 'minutes' ? 'fomc' : 'ind' });
    return out;
  }, [relCal, soso]);

  // 대상 날짜 섹션으로 스크롤 + 2.6초 후 강조 해제
  useEffect(() => {
    if (!target || !grouped.some(([d]) => d === target)) return;
    const el = document.getElementById(`cal-${target}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => setTarget(null), 2600);
    return () => clearTimeout(t);
  }, [target, grouped]);

  return (
    <div className="max-w-3xl mx-auto pb-8">
      {/* 다음 주요 발표 카운트다운 — 컨센서스·나우캐스트·직전(Nowflation 참고) */}
      {relCal?.events?.length ? (
        <div className="mb-4">
          <div className="fin-sec"><h3 className="!text-[15px]">다음 주요 발표</h3><span className="text-[11px] text-[var(--text-muted)]">컨센서스·나우캐스트</span></div>
          <NextReleases rc={relCal} detailHref="/inflation/calendar" />
        </div>
      ) : null}

      {/* 월간 달력 — 모든 지표 발표일·FOMC·한은·실적·휴장 */}
      <div className="fin-card p-4 mb-4"><EconCalendarMonth events={calEvents} /></div>

      {/* 지난 발표 — 실제 vs 컨센서스 서프라이즈(Nowflation 참고) */}
      {econWin?.events?.length ? (
        <div className="mb-4">
          <div className="fin-sec"><h3 className="!text-[15px]">지난 발표 · 서프라이즈</h3><span className="text-[11px] text-[var(--text-muted)]">실제 vs 컨센서스</span></div>
          <PastReleases ec={econWin} limit={12} />
        </div>
      ) : null}

      {/* 앞으로 7일 거시 지표 — SoSoValue 컨센서스(예측·매매 신호 아님) */}
      {soso?.upcoming?.length ? (
        <div className="mb-4">
          <div className="fin-sec"><h3 className="!text-[15px]">이번 주 지표 · 컨센서스</h3><span className="text-[11px] text-[var(--text-muted)]">SoSoValue</span></div>
          <div className="fin-card overflow-x-auto">
            <table className="w-full text-[12px] tabular-nums" style={{ minWidth: 320 }}>
              <thead>
                <tr className="text-[10.5px] text-[var(--text-muted)] text-right">
                  <th className="text-left font-semibold px-3 py-2">날짜 · 지표</th>
                  <th className="font-semibold px-2">컨센서스</th>
                  <th className="font-semibold px-2">직전</th>
                  <th className="font-semibold px-3">실제</th>
                </tr>
              </thead>
              <tbody>
                {soso.upcoming.map((u) => (
                  <tr key={`${u.date}-${u.name}`} className="border-t border-[var(--border)] text-right">
                    <td className="text-left px-3 py-2">
                      <span className="text-[var(--text)] font-medium">{u.ko}</span>
                      <span className="block text-[10px] text-[var(--text-muted)]">{u.date.slice(5)} · {u.name}</span>
                    </td>
                    <td className="px-2 text-[var(--text)]">{u.forecast || '—'}</td>
                    <td className="px-2 text-[var(--text-muted)]">{u.previous || '—'}</td>
                    <td className="px-3 text-[var(--text)]">{u.actual || <span className="text-[var(--text-muted)]">발표 전</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mt-1.5">컨센서스는 시장 예상치일 뿐 결과가 아닙니다. 발표 직후엔 변동성이 커질 수 있어요.</p>
        </div>
      ) : null}

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
      <p className="text-[11px] text-[var(--text-muted)] mb-4 px-1">중요도 막대 3칸 = 높음 · 날짜·시각은 한국시간(KST) 기준 대략치(서머타임 반영) · 휴장/실적시즌은 종일·기간 · 일정은 변경될 수 있습니다</p>

      {!today ? (
        <div className="space-y-3"><div className="skeleton h-28" /><div className="skeleton h-28" /></div>
      ) : grouped.length === 0 ? (
        <p className="text-center py-20 text-[var(--text-muted)] text-sm">해당 조건의 일정이 없습니다</p>
      ) : (
        grouped.map(([date, evts]) => (
          <section key={date} id={`cal-${date}`}
            className={`fin-card overflow-hidden mb-3 transition-shadow ${date < today ? 'opacity-60' : ''} ${date === target ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg)]' : ''}`}>
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
