'use client';

/**
 * 홈 › 오늘의 리스크 — "오늘 더 매매해도 되는가"를 예측이 아니라 기록·한도·일정으로 답한다.
 * 서킷브레이커(연속 손절·일/주 손실 한도) 상태 + 오늘 실현·연속 손절·미청산 + 7일 내 고영향 이벤트.
 * 손익 색은 한국 관행(이익=빨강·손실=파랑).
 */
import { useMemo } from 'react';
import Link from 'next/link';
import { useCoinJournal } from '@/hooks/useCoinJournal';
import { useStockJournal } from '@/hooks/useStockJournal';
import { useRiskLimits } from '@/hooks/useRiskLimits';
import { evaluateBreaker, type BreakerEntry } from '@/lib/circuitBreaker';
import { scoreboard } from '@/lib/journalStats';
import { CALENDAR_EVENTS } from '@/lib/calendarEvents';
import { kstToday, daysBetween } from '@/components/EventRow';

const STATUS = {
  ok:      { label: '정상',      chip: 'good' },
  warn:    { label: '주의',      chip: 'warn' },
  blocked: { label: '진입 금지', chip: 'bad' },
} as const;

export default function TodayRisk() {
  const coin = useCoinJournal();
  const stock = useStockJournal();
  const { limits, mounted } = useRiskLimits();
  const ready = mounted && coin.mounted && stock.mounted;

  const br = useMemo(() => evaluateBreaker(coin.entries as BreakerEntry[], limits), [coin.entries, limits]);
  const open = useMemo(() => scoreboard(coin.entries).open + scoreboard(stock.entries).open, [coin.entries, stock.entries]);
  const event = useMemo(() => {
    if (!ready) return null;
    const today = kstToday();
    const e = CALENDAR_EVENTS
      .filter((x) => x.importance === 'high' && x.category !== 'holiday' && x.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!e) return null;
    const dd = daysBetween(today, e.date);
    return dd <= 7 ? { e, dd } : null;
  }, [ready]);

  const st = STATUS[br.status];
  const pnl = br.todayRealized;

  return (
    <section>
      <div className="fin-sec">
        <h3>오늘의 리스크</h3>
        <Link href="/risk" className="fin-more">통합 리스크</Link>
      </div>
      <div className="fin-card p-4">
        {!ready ? (
          <div className="space-y-3"><span className="skeleton h-5 w-28" /><span className="skeleton h-14 w-full" /></div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className={`fin-chip ${st.chip}`}>서킷브레이커 {st.label}</span>
              <span className="text-[11.5px] text-[var(--faint)] truncate">연속 손절·손실 한도 기준</span>
            </div>

            <div className="grid grid-cols-3 mt-3.5 rounded-2xl bg-[var(--surface-2)] py-3">
              <div className="text-center">
                <div className="text-[11px] font-bold text-[var(--faint)]">오늘 실현(코인)</div>
                <div className="text-[15px] font-extrabold tabular-nums mt-0.5"
                  style={{ color: pnl == null || pnl === 0 ? 'var(--ink)' : pnl > 0 ? 'var(--warn)' : 'var(--accent)' }}>
                  {pnl == null ? '—' : `${pnl > 0 ? '+' : ''}${Math.round(pnl).toLocaleString()}`}
                </div>
                <div className="text-[10px] text-[var(--faint)]">USDT</div>
              </div>
              <div className="text-center border-l border-[var(--line)]">
                <div className="text-[11px] font-bold text-[var(--faint)]">연속 손절</div>
                <div className="text-[15px] font-extrabold tabular-nums mt-0.5" style={{ color: br.lossStreak >= 2 ? 'var(--warn)' : 'var(--ink)' }}>{br.lossStreak}회</div>
                <div className="text-[10px] text-[var(--faint)]">최근 연속</div>
              </div>
              <div className="text-center border-l border-[var(--line)]">
                <div className="text-[11px] font-bold text-[var(--faint)]">미청산 기록</div>
                <div className="text-[15px] font-extrabold tabular-nums mt-0.5" style={{ color: open > 0 ? 'var(--amber)' : 'var(--ink)' }}>{open}건</div>
                <div className="text-[10px] text-[var(--faint)]">결과 미입력</div>
              </div>
            </div>

            {br.status !== 'ok' && br.reasons.length > 0 && (
              <ul className="mt-3 space-y-1 text-[12px] leading-snug" style={{ color: br.status === 'blocked' ? 'var(--warn)' : 'var(--amber)' }}>
                {br.reasons.map((r) => <li key={r}>· {r}</li>)}
              </ul>
            )}

            {event && (
              <p className="mt-3 text-[12px] leading-snug text-[var(--ink-2)]">
                <span className="font-extrabold" style={{ color: event.dd <= 1 ? 'var(--warn)' : 'var(--amber)' }}>
                  {event.dd === 0 ? '오늘' : `D-${event.dd}`} {event.e.title}
                </span>
                <span className="text-[var(--faint)]"> — 발표 전후 변동성 확대. 신규 진입·사이즈를 줄이세요(방향 예측 아님).</span>
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 mt-4">
              <Link href="/planner" className="kl-cta text-center text-[13px] py-2.5">새 매매 계획</Link>
              <Link href="/journal" className="text-center text-[13px] font-bold py-2.5 rounded-[var(--r-sm)] bg-[var(--surface-2)] text-[var(--ink)]">매매일지</Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
