'use client';

/** 52주 범위 내 현재가 위치 바 — 홈 보드(Stat52)·레일과 동일한 시각 언어. 카드 테두리 없이 섹션 안에 삽입. */
export default function Range52Bar({ low, high, value, fmt, label = '52주 위치' }: {
  low?: number | null; high?: number | null; value: number; fmt: (n: number) => string; label?: string;
}) {
  if (low == null || high == null || high <= low) return null;
  const pct = Math.round(Math.max(0, Math.min(100, ((value - low) / (high - low)) * 100)));
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1.5">
        <span className="text-[var(--text-muted)] font-semibold">{label}</span>
        <span className="tabular-nums font-bold text-[var(--text)]">{pct}%</span>
      </div>
      <div style={{ position: 'relative', height: 4, borderRadius: 99, background: 'var(--surface-2)' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 99, background: 'color-mix(in srgb, var(--accent) 35%, transparent)' }} />
        <div style={{ position: 'absolute', left: `calc(${pct}% - 6px)`, top: -4, width: 12, height: 12, borderRadius: '50%', background: 'var(--ink)', border: '2px solid var(--surface)' }} />
      </div>
      <div className="flex justify-between mt-2 text-[12px] font-semibold tabular-nums text-[var(--text)]">
        <span>{fmt(low)}</span><span>{fmt(high)}</span>
      </div>
    </div>
  );
}
