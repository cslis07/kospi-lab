'use client';

/**
 * 복기 태그 선택 UI — 셋업·실수(토글 칩)와 확신(1~5) 공용 컴포넌트.
 * 성과(R)·주식 판정 기록 등 여러 곳에서 같은 모양으로 태그를 매기게 한다. 방향 예측 아님 — 복기용.
 */
import { CONVICTIONS } from '@/lib/tradeTags';

export function TagPickRow({ label, metas, active, onToggle, tone }: {
  label: string; metas: { key: string; label: string; emoji: string }[]; active: string[]; onToggle: (k: string) => void; tone: string;
}) {
  return (
    <div className="flex items-start gap-1.5 flex-wrap">
      <span className="text-[10px] text-[var(--text-muted)] w-7 pt-1.5 shrink-0">{label}</span>
      {metas.map((m) => {
        const on = active.includes(m.key);
        return (
          <button key={m.key} type="button" onClick={() => onToggle(m.key)}
            className="px-2 py-1 rounded-lg border text-[11px] font-semibold"
            style={on ? { borderColor: tone, background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: 'var(--text)' } : { borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            {m.emoji} {m.label}
          </button>
        );
      })}
    </div>
  );
}

export function ConvictionPickRow({ value, onPick }: { value: number | undefined; onPick: (lv: number) => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] text-[var(--text-muted)] w-7 shrink-0">확신</span>
      {CONVICTIONS.map((c) => (
        <button key={c.level} type="button" onClick={() => onPick(c.level)}
          className="px-2 py-1 rounded-lg border text-[11px] font-semibold"
          style={value === c.level ? { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--text)' } : { borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          {c.emoji} {c.level}
        </button>
      ))}
    </div>
  );
}
