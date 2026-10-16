'use client';

/** 목록 행용 컴팩트 52주 위치 미니 바 — 상세의 Range52Bar와 같은 개념(범위 내 현재가 위치). */
export default function Mini52({ price, high, low }: { price: number; high?: number | null; low?: number | null }) {
  if (!high || !low || high <= low) return null;
  const pct = Math.round(Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100)));
  return (
    <div className="mt-1 flex items-center gap-1.5" title={`52주 범위 중 ${pct}%`}>
      <span className="text-[9px] text-[var(--text-muted)] shrink-0">52주</span>
      <div style={{ position: 'relative', height: 3, borderRadius: 99, background: 'var(--surface-2)', width: 72 }}>
        <div style={{ position: 'absolute', top: -1, width: 5, height: 5, borderRadius: '50%', background: 'var(--ink)', left: `calc(${pct}% - 2.5px)` }} />
      </div>
      <span className="text-[9px] tabular-nums text-[var(--text-muted)] shrink-0">{pct}%</span>
    </div>
  );
}
