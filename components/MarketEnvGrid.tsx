'use client';

/** 시장환경 그리드 — 금리·유가·환율·심리. /api/coin-env 의 env.cards 를 렌더한다. */
import type { EnvCard, Tone } from '@/lib/coinDashboard';

const TONE: Record<Tone, string> = {
  up: 'text-emerald-400',
  down: 'text-red-400',
  warn: 'text-amber-400',
  neutral: 'text-[var(--text-muted)]',
};

export default function MarketEnvGrid({ cards, updatedAt }: { cards: EnvCard[]; updatedAt?: number }) {
  const time = updatedAt ? new Date(updatedAt).toLocaleTimeString('ko-KR', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-base font-bold text-[var(--text)]">시장환경</h2>
        <span className="text-xs text-[var(--text-muted)]">금리 · 유가 · 환율 · 심리</span>
        {time && <span className="text-xs text-[var(--text-muted)]">{time} 갱신</span>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.key} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="text-xs text-[var(--text-muted)] mb-1">{c.label}</p>
            <p className="text-2xl font-bold text-[var(--text)] tabular-nums leading-tight">{c.value}</p>
            {c.sub && <p className={`text-[11px] mt-1 tabular-nums ${TONE[c.subTone]}`}>{c.sub}</p>}
            <p className="text-[11px] text-[var(--text-muted)] mt-1.5 leading-snug">{c.comment}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
