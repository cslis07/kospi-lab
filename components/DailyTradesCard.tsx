'use client';

/**
 * 일별 진입·매매 횟수 — 날짜(KST, 진입 시각 기준)마다 몇 번 들어갔나 + 그중 1시간 미만 매매 + 그날 순손익.
 * 복기 대시보드(/review) 1번 카드. 비용 누수 측정에서 1시간 미만 매매가 수수료의 가장 큰 몫이라 막대를 두 색으로 나눈다.
 * 매매 없는 날도 0 으로 보여 '쉰 날'이 드러나게 한다. 기본은 최근 14일, 펼치면 조회 기간 전체.
 */
import { useMemo, useState } from 'react';
import { kstDateKey } from '@/lib/journalAnalytics';

export interface DailyTrade { openTs: number; closeTs: number; netProfit: number }

const SCALP_MS = 3_600_000;
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const tone = (n: number) => (n > 0 ? 'var(--warn)' : n < 0 ? 'var(--accent-ink)' : 'var(--faint)');

export default function DailyTradesCard({ trades, days, fmt }: { trades: DailyTrade[]; days: number; fmt: (n: number) => string }) {
  const [all, setAll] = useState(false);
  const [now] = useState(() => Date.now()); // 렌더 중 Date.now() 금지(react-hooks/purity) — 화면 열 때 기준 '오늘'
  const rows = useMemo(() => {
    const map = new Map<string, { n: number; scalp: number; net: number }>();
    for (const t of trades) {
      const k = kstDateKey(t.openTs || t.closeTs);
      const r = map.get(k) ?? { n: 0, scalp: 0, net: 0 };
      r.n += 1;
      if (t.openTs > 0 && t.closeTs - t.openTs < SCALP_MS) r.scalp += 1;
      r.net += t.netProfit;
      map.set(k, r);
    }
    const out: { date: string; n: number; scalp: number; net: number }[] = [];
    for (let i = 0; i < days; i++) {
      const date = kstDateKey(now - i * 86_400_000);
      out.push({ date, ...(map.get(date) ?? { n: 0, scalp: 0, net: 0 }) });
    }
    return out;
  }, [trades, days, now]);

  if (!trades.length) return null;
  const total = rows.reduce((a, r) => a + r.n, 0);
  const scalp = rows.reduce((a, r) => a + r.scalp, 0);
  const active = rows.filter((r) => r.n > 0).length;
  const max = Math.max(1, ...rows.map((r) => r.n));
  const shown = all ? rows : rows.slice(0, 14);
  const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}`;

  return (
    <section className="fin-card p-4 mb-3">
      <h2 className="text-sm font-bold text-[var(--text)]">일별 진입 · 매매 횟수 <span className="text-[10px] font-normal text-[var(--text-muted)]">진입 시각(KST) 기준</span></h2>
      <p className="text-[12px] text-[var(--text-muted)] mt-1 tabular-nums">
        {days}일 동안 <b className="text-[var(--text)]">{total}건</b> · 매매한 날 {active}일(하루 평균 {active ? (total / active).toFixed(1) : '0'}건)
        · <span style={{ color: 'var(--warn)' }}>1시간 미만 {scalp}건{total ? `(${Math.round((scalp / total) * 100)}%)` : ''}</span>
      </p>
      <div className="flex items-center gap-3 text-[10.5px] text-[var(--text-muted)] mt-2 mb-1.5">
        <span className="inline-flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--warn)' }} />1시간 미만</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--accent)' }} />1시간 이상</span>
      </div>
      <ul className="space-y-1">
        {shown.map((r) => {
          const wd = WD[new Date(`${r.date}T00:00:00Z`).getUTCDay()]; // r.date 는 이미 KST 달력 날짜
          return (
            <li key={r.date} className="flex items-center gap-2 text-[12px] tabular-nums" style={{ opacity: r.n ? 1 : 0.45 }}>
              <span className="w-[62px] shrink-0 text-[var(--text-muted)]">{Number(r.date.slice(5, 7))}/{Number(r.date.slice(8))} ({wd})</span>
              <span className="flex-1 h-3 rounded-sm bg-[var(--surface-2)] overflow-hidden flex" aria-hidden>
                <span style={{ width: `${(r.scalp / max) * 100}%`, background: 'var(--warn)' }} />
                <span style={{ width: `${((r.n - r.scalp) / max) * 100}%`, background: 'var(--accent)' }} />
              </span>
              <span className="w-9 text-right font-semibold text-[var(--text)]">{r.n}건</span>
              <span className="w-16 text-right font-semibold" style={{ color: tone(r.net) }}>{r.n ? signed(r.net) : '—'}</span>
            </li>
          );
        })}
      </ul>
      {rows.length > 14 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-[12px] font-semibold text-[var(--accent-ink)] min-h-[36px]">
          {all ? '최근 14일만 보기' : `${days}일 전체 보기`}
        </button>
      )}
      <p className="text-[10.5px] text-[var(--faint)] mt-1.5">순손익 = 그날 진입한 매매의 수수료·펀딩 반영 손익(USDT). 막대 길이 = 그날 진입 횟수.</p>
    </section>
  );
}
