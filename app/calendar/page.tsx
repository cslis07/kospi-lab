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
import { dedupeForCalendar, classify, type MacroEvt, type MacroRelease } from '@/lib/macroEvents';
import { officialToCalendar, mergeOfficial, snapToOfficial } from '@/lib/calendarOfficial';
import type { MacroEvent } from '@/lib/macroSchedule';
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
  // 지난 일정은 최근 60일만(공식 일정이 2024-01 부터라 전부 붙이면 목록이 2024년으로 가득 찼다). ?date= 가 더 과거면 그날부터
  const [pastFrom, setPastFrom] = useState<string | null>(null);
  useEffect(() => {
    if (!today) return;
    const d60 = new Date(Date.parse(`${today}T00:00:00Z`) - 60 * 86_400_000).toISOString().slice(0, 10);
    if (target && target < today) { setShowPast(true); setPastFrom(target < d60 ? target : d60); }
    else setPastFrom((v) => v ?? d60);
  }, [target, today]);

  // 공식 일정(FRED 발표 캘린더·연준 FOMC, 시각은 미 동부→KST 서머타임 반영) — 달력·표·목록의 미국 지표 날짜 기준
  const { data: official } = useSWR<{ events: MacroEvent[] }>('/api/risk/events', fetcher, { revalidateOnFocus: false });
  const allEvents = useMemo(() => mergeOfficial(CALENDAR_EVENTS, officialToCalendar(official?.events ?? [])), [official]);

  const grouped = useMemo(() => {
    if (!today) return [];
    const list = allEvents
      .filter((e) => {
        if (e.date < today && (!showPast || (pastFrom != null && e.date < pastFrom))) return false;
        if (cat !== 'all' && e.category !== cat) return false;
        if (country !== 'all' && !(e.country === country || e.country === 'global')) return false;
        if (imp === 'high' && e.importance !== 'high') return false;
        if (imp === 'mid' && e.importance === 'low') return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    // 앞으로의 일정은 80건까지, 지난 일정(최근 60일)은 그 앞에 — 예전 slice(0, 80)은 과거를 켜면 오늘 이후를 통째로 잘랐다
    const firstFuture = list.findIndex((e) => e.date >= today);
    const cut = firstFuture < 0 ? list : [...list.slice(0, firstFuture), ...list.slice(firstFuture, firstFuture + 80)];
    const map = new Map<string, CalendarEvent[]>();
    for (const e of cut) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return [...map.entries()];
  }, [today, cat, country, imp, showPast, pastFrom, allEvents]);

  const nFilters = (country !== 'all' ? 1 : 0) + (imp !== 'all' ? 1 : 0) + (showPast ? 1 : 0);

  // 달력(월간 그리드)용 — 정적 일정 + 나우캐스트 미국 지표 발표일을 모두 표시(필터는 아래 목록에만 적용)
  const { data: relCal, error: relCalErr } = useSWR<ReleaseCalendar>('/api/nf/release_calendar.json', fetcher, { revalidateOnFocus: false });
  const { data: econWin } = useSWR<EconCalWindow>('/api/nf/econcal_window.json', fetcher, { revalidateOnFocus: false });
  const { data: soso } = useSWR<{ events: MacroEvt[]; upcoming: MacroRelease[] }>('/api/macro/events', fetcher, { revalidateOnFocus: false });
  const calEvents = useMemo<CalEvt[]>(() => {
    const out: CalEvt[] = allEvents.map((e) => ({ date: e.date, label: e.title, tone: CAT_TONE[e.category] ?? 'ind' }));
    for (const e of relCal?.events ?? []) {
      if (!e.date) continue;
      out.push({ date: e.date.slice(0, 10), label: `${KIND_KO[e.kind] ?? e.kind.toUpperCase()}${e.data_month ? ` ${e.data_month}` : ''}`, tone: 'ind' });
    }
    // SoSoValue 거시 이벤트 — 날짜를 공식 일정에 맞춘 뒤, 같은 날 같은 지표가 이미 있으면 생략
    for (const e of dedupeForCalendar(snapToOfficial(soso?.events ?? [], official?.events ?? []), out)) out.push({ date: e.date, label: e.ko, tone: e.key === 'fomc' || e.key === 'minutes' ? 'fomc' : 'ind' });
    return out;
  }, [relCal, soso, official, allEvents]);
  // 이번 주 표도 같은 날짜 기준(공식 일정) — 제공업체 날짜와 다르면 공식으로
  const upcoming = useMemo(() => snapToOfficial((soso?.upcoming ?? []).map((u) => ({ ...u, key: classify(u.name).key })), official?.events ?? []), [soso, official]);

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
    <div className="max-w-3xl lg:max-w-5xl mx-auto pb-8">
      {/* 다음 주요 발표 카운트다운 — 컨센서스·나우캐스트·직전(Nowflation 참고) */}
      {relCal?.events?.length ? (
        <div className="mb-4">
          <div className="fin-sec"><h3 className="!text-[15px]">다음 주요 발표</h3><span className="text-[11px] text-[var(--text-muted)]">컨센서스·나우캐스트</span></div>
          <NextReleases rc={relCal} detailHref="/inflation/calendar" />
        </div>
      ) : relCal === undefined && !relCalErr ? (
        // 불러오는 동안 자리를 잡아 둔다 — 늦게 끼어들면 아래 달력·목록이 통째로 밀렸다(CLS 0.44, 실측 높이 모바일 395·태블릿 이상 232~243px)
        <div className="mb-4 min-h-[395px] sm:min-h-[236px]" aria-hidden />
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
      {upcoming.length ? (
        <div className="mb-4">
          <div className="fin-sec"><h3 className="!text-[15px]">이번 주 지표 · 예상/이전/실제</h3><span className="text-[11px] text-[var(--text-muted)]">출처 SoSoValue · 예상 = 시장 컨센서스</span></div>
          <div className="fin-card overflow-x-auto">
            <table className="w-full text-[12px] tabular-nums" style={{ minWidth: 380 }}>
              <thead>
                <tr className="text-[10.5px] text-[var(--text-muted)] text-right">
                  <th className="text-left font-semibold px-3 py-2">날짜 · 지표</th>
                  <th className="font-semibold px-2">예상</th>
                  <th className="font-semibold px-2">이전</th>
                  <th className="font-semibold px-2">실제</th>
                  <th className="font-semibold px-3 text-center">상태</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((u) => (
                  <tr key={`${u.date}-${u.name}`} className="border-t border-[var(--border)] text-right">
                    <td className="text-left px-3 py-2">
                      <span className="text-[var(--text)] font-medium">{u.ko}</span>
                      <span className="block text-[10px] text-[var(--text-muted)]">{u.date.slice(5)}{u.providerDate ? ' (공식 일정)' : ''} · {u.name}</span>
                    </td>
                    <td className="px-2 text-[var(--text)]">{u.forecast || '—'}</td>
                    <td className="px-2 text-[var(--text-muted)]">{u.previous || '—'}</td>
                    <td className="px-2 text-[var(--text)] font-semibold">{u.actual || <span className="text-[var(--text-muted)] font-normal">—</span>}</td>
                    <td className="px-3 text-center">{u.actual ? <span className="ds live"><i aria-hidden />발표 완료</span> : today && u.date < today ? <span className="ds closed"><i aria-hidden />결과 확인 중</span> : <span className="ds closed"><i aria-hidden />발표 전</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mt-1.5">예상 = 발표 전 시장 예상(확정값 아님) · 이전 = 직전 발표값(수정될 수 있음) · 실제 = 발표 기관 공개값. 날짜는 공식 일정 기준이며, 발표 직후엔 변동성이 커질 수 있지만 결과만으로 방향이 정해지지는 않습니다.</p>
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
      <p className="text-[11px] text-[var(--text-muted)] mb-4 px-1">경제지표 발표 시각과 시장 예상치를 확인하는 곳입니다 · 중요도 막대 3칸 = 높음(시장 관심도, 상승·하락 강도 아님) · 미국 지표·FOMC 날짜는 공식 일정(FRED·연준), 시각은 미 동부시간을 서머타임 반영해 한국시간(KST)으로 변환 · 휴장/실적시즌은 종일·기간 · 일정은 변경될 수 있습니다</p>

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
