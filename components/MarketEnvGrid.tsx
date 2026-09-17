'use client';

/**
 * 시장환경 그리드 — 금리·유가·환율·심리. /api/coin-env 의 env.cards 를 렌더한다.
 * 모바일: 아이콘 배지 + 라벨 + 큰 값 + 톤 칩의 2열 미니 카드(핀테크 카드 언어).
 * 데스크탑: 기존 4열 카드 그대로.
 * ⚠ subTone 은 가격 방향이 아니라 '위험자산에 우호/불리' 의미(up=우호·초록, down=불리·빨강).
 */
import type { EnvCard, Tone } from '@/lib/coinDashboard';
import { FinIcon } from './fin/icons';

const TONE: Record<Tone, string> = {
  up: 'text-emerald-400',
  down: 'text-red-400',
  warn: 'text-amber-400',
  neutral: 'text-[var(--text-muted)]',
};
const CHIP: Record<Tone, string> = { up: 'good', down: 'bad', warn: 'warn', neutral: 'flat' };

const ENV_STYLE: Record<string, { icon: string; tint: string }> = {
  d10:     { icon: 'percent',  tint: 'tint-blue' },
  d2:      { icon: 'percent',  tint: 'tint-indigo' },
  d30:     { icon: 'percent',  tint: 'tint-violet' },
  brent:   { icon: 'drop',     tint: 'tint-amber' },
  dxy:     { icon: 'dollar',   tint: 'tint-green' },
  usdtkrw: { icon: 'won',      tint: 'tint-teal' },
  kimchi:  { icon: 'flag',     tint: 'tint-rose' },
  fng:     { icon: 'gauge',    tint: 'tint-violet' },
  fomc:    { icon: 'calendar', tint: 'tint-blue' },
};

export default function MarketEnvGrid({ cards, updatedAt }: { cards: EnvCard[]; updatedAt?: number }) {
  const time = updatedAt ? new Date(updatedAt).toLocaleTimeString('ko-KR', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;
  const timeShort = updatedAt ? new Date(updatedAt).toLocaleTimeString('ko-KR', { hour12: true, hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <section>
      {/* 모바일 헤더 */}
      <div className="fin-sec md:hidden">
        <h3>시장환경</h3>
        {timeShort && <span className="text-[11px] font-semibold text-[var(--faint)]">{timeShort} 갱신</span>}
      </div>
      {/* 데스크탑 헤더 */}
      <div className="hidden md:flex items-baseline gap-2 mb-3">
        <h2 className="text-base font-bold text-[var(--text)]">시장환경</h2>
        <span className="text-xs text-[var(--text-muted)]">금리 · 유가 · 환율 · 심리</span>
        {time && <span className="text-xs text-[var(--text-muted)]">{time} 갱신</span>}
      </div>

      {/* 모바일: 2열 미니 카드 */}
      <div className="grid grid-cols-2 gap-3 md:hidden">
        {cards.map((c) => {
          const st = ENV_STYLE[c.key] ?? { icon: 'percent', tint: 'tint-blue' };
          return (
            <div key={c.key} className="fin-card fin-mini">
              <span className={`fin-badge ${st.tint}`}><FinIcon name={st.icon} /></span>
              <div className="lb">{c.label}</div>
              <div className="vl tabular-nums">{c.value}</div>
              {c.sub && <span className={`fin-chip ${CHIP[c.subTone]} mt-1.5 tabular-nums`}>{c.sub.replace('전일 대비 ', '')}</span>}
              <div className="cm">{c.comment}</div>
            </div>
          );
        })}
      </div>

      {/* 데스크탑: 기존 4열 */}
      <div className="hidden md:grid md:grid-cols-4 gap-3">
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
