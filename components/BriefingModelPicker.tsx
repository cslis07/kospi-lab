'use client';

import { BRIEFING_MODELS } from '@/lib/anthropic';

interface Props {
  value: string;
  onChange: (id: string) => void;
  /** 브리핑을 다시 받아오는 중이면 전환을 막는다 */
  busy?: boolean;
}

export default function BriefingModelPicker({ value, onChange, busy = false }: Props) {
  return (
    <div
      role="group"
      aria-label="AI 브리핑 모델 선택"
      className="flex flex-wrap items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-1"
    >
      {BRIEFING_MODELS.map((m) => {
        const active = m.id === value;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            disabled={busy || active}
            aria-pressed={active}
            title={m.hint}
            className={[
              'px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors',
              active
                ? 'bg-sky-500/15 text-sky-400 border border-sky-500/40'
                : 'text-[var(--text-muted)] border border-transparent hover:text-[var(--text)] hover:bg-white/5',
              busy && !active ? 'opacity-50 cursor-not-allowed' : '',
            ].join(' ')}
          >
            {m.label}
          </button>
        );
      })}
      <span className="pl-1 pr-1.5 text-[10px] text-[var(--text-muted)] hidden sm:inline">
        {busy ? '생성 중…' : BRIEFING_MODELS.find((m) => m.id === value)?.hint}
      </span>
    </div>
  );
}
