'use client';

/**
 * 일별 손익 캘린더 히트맵 — 참고: TraderSync.
 * 날짜별 실현손익 합계를 색으로 칠한다(이익=빨강 · 손실=파랑, 한국 관행). 색 짙기 = 그 달 최대 손익 대비.
 * 차트 라이브러리 없이 CSS 그리드(번들을 늘리지 않게 — HoldingsConcentration 과 같은 원칙).
 */
import { useMemo, useState } from 'react';
import { aggregateDaily, monthList, monthDays, monthSummary, type TradeValue } from '@/lib/journalAnalytics';

const UP = '255,68,51';    // --warn
const DOWN = '28,108,255'; // --accent
const WD = ['일', '월', '화', '수', '목', '금', '토'];

const monthLabel = (ym: string) => { const [y, m] = ym.split('-'); return `${y}년 ${Number(m)}월`; };

/** 손익 → 배경색(짙기는 그 달 최대 절대손익 대비) */
function cellBg(pnl: number | null, maxAbs: number): string {
  if (pnl == null) return 'var(--surface-2)';
  if (pnl === 0) return 'var(--surface-2)';
  const t = maxAbs > 0 ? Math.min(1, Math.abs(pnl) / maxAbs) : 0.5;
  const a = 0.16 + t * 0.74; // 0.16~0.90
  return `rgba(${pnl > 0 ? UP : DOWN},${a.toFixed(2)})`;
}

export default function CalendarHeatmap({ trades, unit, fmt }: {
  trades: TradeValue[];
  unit: string;
  fmt: (n: number) => string;
}) {
  const byDate = useMemo(() => aggregateDaily(trades), [trades]);
  const months = useMemo(() => monthList(trades), [trades]);
  const [idx, setIdx] = useState(0); // 0 = 최신 달
  const ym = months[idx];

  if (!ym) {
    return (
      <div className="fin-card p-4 sm:p-5 mb-3">
        <h2 className="text-sm font-bold text-[var(--text)] mb-1">일별 손익 달력</h2>
        <p className="text-[12px] text-[var(--text-muted)] text-center py-5">청산 거래가 쌓이면 날짜별 손익이 달력에 칠해집니다.</p>
      </div>
    );
  }

  const cells = monthDays(ym, byDate);
  const sum = monthSummary(cells);
  const maxAbs = Math.max(0, ...cells.map((c) => (c.pnl != null ? Math.abs(c.pnl) : 0)));
  const lead = cells.length ? cells[0].dow : 0; // 1일 앞의 빈 칸

  return (
    <div className="fin-card p-4 sm:p-5 mb-3">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-bold text-[var(--text)]">일별 손익 달력 <span className="text-[10px] font-normal text-[var(--text-muted)]">날짜별 실현손익</span></h2>
        <span className="flex-1" />
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setIdx((i) => Math.min(months.length - 1, i + 1))} disabled={idx >= months.length - 1}
            aria-label="이전 달" className="w-7 h-7 grid place-items-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] disabled:opacity-30">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <span className="text-[12px] font-bold text-[var(--text)] tabular-nums min-w-[86px] text-center">{monthLabel(ym)}</span>
          <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx <= 0}
            aria-label="다음 달" className="w-7 h-7 grid place-items-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] disabled:opacity-30">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      </div>

      {/* 월 요약 */}
      <div className="flex items-center gap-3 mb-2.5 text-[11px] text-[var(--text-muted)]">
        <span>거래일 <b className="text-[var(--text)] tabular-nums">{sum.tradedDays}일</b></span>
        <span style={{ color: 'var(--warn)' }}>+{sum.upDays}</span>
        <span style={{ color: 'var(--accent-ink)' }}>−{sum.downDays}</span>
        <span className="ml-auto">합계 <b className="tabular-nums" style={{ color: sum.sum > 0 ? 'var(--warn)' : sum.sum < 0 ? 'var(--accent-ink)' : 'var(--text)' }}>{sum.sum > 0 ? '+' : ''}{fmt(sum.sum)} {unit}</b></span>
      </div>

      {/* 요일 머리 */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WD.map((w, i) => <div key={w} className="text-center text-[10px] font-semibold" style={{ color: i === 0 ? 'var(--warn)' : i === 6 ? 'var(--accent-ink)' : 'var(--faint)' }}>{w}</div>)}
      </div>
      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} />)}
        {cells.map((c) => {
          const has = c.pnl != null;
          return (
            <div key={c.date} title={has ? `${c.date} · ${c.pnl! > 0 ? '+' : ''}${fmt(c.pnl!)} ${unit} · ${c.count}건` : c.date}
              className="aspect-square rounded-md grid place-items-center text-[10px] leading-none tabular-nums"
              style={{ background: cellBg(c.pnl, maxAbs) }}>
              <span className={has ? 'font-semibold' : ''} style={{ color: has ? '#fff' : 'var(--faint)' }}>{c.day}</span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mt-3 text-[10px] text-[var(--faint)]">
        <span>손실</span>
        <span className="inline-block w-4 h-3 rounded-sm" style={{ background: `rgba(${DOWN},0.8)` }} />
        <span className="inline-block w-4 h-3 rounded-sm" style={{ background: `rgba(${DOWN},0.3)` }} />
        <span className="inline-block w-4 h-3 rounded-sm" style={{ background: 'var(--surface-2)' }} />
        <span className="inline-block w-4 h-3 rounded-sm" style={{ background: `rgba(${UP},0.3)` }} />
        <span className="inline-block w-4 h-3 rounded-sm" style={{ background: `rgba(${UP},0.8)` }} />
        <span>이익</span>
        <span className="ml-auto">색 짙기 = 그 달 최대 손익 대비</span>
      </div>
    </div>
  );
}
