'use client';

import { useState, useMemo } from 'react';
import { CALENDAR_EVENTS } from '@/lib/calendarEvents';
import type { CalendarEvent } from '@/lib/types';

const CATEGORY_LABEL: Record<CalendarEvent['category'], string> = {
  fomc:      'FOMC',
  bok:       '한국은행',
  earnings:  '실적시즌',
  indicator: '경제지표',
  holiday:   '휴장일',
};
const CATEGORY_COLOR: Record<CalendarEvent['category'], string> = {
  fomc:      'bg-red-500/20 text-red-400 border-red-500/30',
  bok:       'bg-blue-500/20 text-blue-400 border-blue-500/30',
  earnings:  'bg-amber-500/20 text-amber-400 border-amber-500/30',
  indicator: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  holiday:   'bg-gray-500/20 text-gray-400 border-gray-500/30',
};
const IMPORTANCE_DOT: Record<CalendarEvent['importance'], string> = {
  high:   'bg-red-400',
  medium: 'bg-amber-400',
  low:    'bg-gray-500',
};

type Filter = 'all' | CalendarEvent['category'] | 'KR' | 'US';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function CalendarPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [showPast, setShowPast] = useState(false);
  const today = todayStr();

  const events = useMemo(() => {
    return CALENDAR_EVENTS
      .filter((e) => {
        if (!showPast && e.date < today) return false;
        if (filter === 'all') return true;
        if (filter === 'KR' || filter === 'US') return e.country === filter || e.country === 'global';
        return e.category === filter;
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 60);
  }, [filter, showPast, today]);

  // 날짜별 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [events]);

  const formatDate = (d: string) => {
    const dt = new Date(d + 'T00:00:00');
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${days[dt.getDay()]})`;
  };

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all',       label: '전체' },
    { key: 'fomc',      label: '🇺🇸 FOMC' },
    { key: 'bok',       label: '🇰🇷 한국은행' },
    { key: 'earnings',  label: '📊 실적' },
    { key: 'indicator', label: '📈 경제지표' },
    { key: 'holiday',   label: '🚫 휴장일' },
  ];

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-[var(--text)]">경제 캘린더</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">FOMC·한국은행·실적시즌·주요 경제지표 일정</p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] cursor-pointer">
          <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)}
            className="accent-sky-500" />
          지난 일정 포함
        </label>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              filter === f.key
                ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* 이벤트 목록 */}
      {grouped.size === 0 ? (
        <div className="text-center py-20 text-[var(--text-muted)] text-sm">
          해당 조건의 일정이 없습니다
        </div>
      ) : (
        <div className="space-y-6">
          {[...grouped.entries()].map(([date, evts]) => {
            const isToday = date === today;
            const isPast  = date < today;
            return (
              <div key={date}>
                {/* 날짜 헤더 */}
                <div className={`flex items-center gap-2 mb-2 ${isPast ? 'opacity-50' : ''}`}>
                  <span className={`text-sm font-semibold ${isToday ? 'text-sky-400' : 'text-[var(--text)]'}`}>
                    {formatDate(date)}
                  </span>
                  {isToday && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500 text-white font-bold">오늘</span>
                  )}
                  <div className="flex-1 h-px bg-[var(--border)]" />
                </div>

                {/* 이벤트 카드들 */}
                <div className="space-y-2 pl-4">
                  {evts.map((e, i) => (
                    <div key={i}
                      className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                        isPast
                          ? 'border-[var(--border)] bg-[var(--bg-card)] opacity-50'
                          : isToday
                          ? 'border-sky-500/30 bg-sky-500/5'
                          : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-hover)]'
                      }`}>
                      {/* 중요도 dot */}
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${IMPORTANCE_DOT[e.importance]}`} />

                      {/* 내용 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${CATEGORY_COLOR[e.category]}`}>
                            {CATEGORY_LABEL[e.category]}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${
                            e.country === 'US' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                            e.country === 'KR' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                            'bg-gray-500/10 text-gray-400 border-gray-500/20'
                          }`}>
                            {e.country === 'global' ? '🌐' : e.country === 'US' ? '🇺🇸' : '🇰🇷'}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-[var(--text)] mt-1">{e.title}</p>
                        {e.desc && <p className="text-xs text-[var(--text-muted)] mt-0.5">{e.desc}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-[var(--text-muted)] mt-8 opacity-60">
        * 일정은 변경될 수 있으며 참고용으로만 사용하세요
      </p>
    </div>
  );
}
