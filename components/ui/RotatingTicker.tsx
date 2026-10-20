'use client';

/**
 * 회전 티커 — 네이버 뉴스스탠드처럼 평소엔 한 줄만 보이고 N초마다 다음 항목으로 넘어간다.
 * 펼치기를 누르면 회전을 멈추고 전체 목록(children)을 드롭다운으로 보여 준다.
 * 접근성: 펼침 버튼은 aria-expanded, 회전 줄은 aria-live="polite".
 */
import { useEffect, useState, type ReactNode } from 'react';

export default function RotatingTicker({
  title, badge, lines, children, intervalMs = 3000, emptyText = '대기 중…', defaultOpen = false,
}: {
  title: ReactNode;
  badge?: ReactNode;
  lines: ReactNode[];
  children?: ReactNode;
  intervalMs?: number;
  emptyText?: string;
  defaultOpen?: boolean;
}) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(defaultOpen);
  const n = lines.length;
  useEffect(() => {
    if (open || n <= 1) return; // 펼쳐지면 회전 멈춤
    const t = setInterval(() => setI((p) => (p + 1) % n), intervalMs);
    return () => clearInterval(t);
  }, [open, n, intervalMs]);
  // 목록이 줄어들어 인덱스가 범위를 벗어나면 보정
  useEffect(() => { if (n > 0 && i >= n) setI(0); }, [i, n]);

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <div className="flex items-center gap-2">
        <div className="text-[12px] font-bold text-[var(--text)] shrink-0">{title}</div>
        {badge}
        {!open && n > 1 && <span className="text-[9px] text-[var(--text-muted)] tabular-nums shrink-0">{(i % n) + 1}/{n}</span>}
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          className="ml-auto text-[11px] text-sky-400 shrink-0 flex items-center gap-1 hover:underline">
          {open ? '접기' : '펼치기'}
          <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
        </button>
      </div>
      {!open && (
        <div className="mt-1.5 text-[12px] min-h-[20px]" aria-live="polite">
          {n ? <div key={i} className="mfade">{lines[i % n]}</div> : <span className="text-[var(--text-muted)]">{emptyText}</span>}
        </div>
      )}
      {open && <div className="mt-2">{children ?? (n ? <ul className="space-y-1.5 text-[12px]">{lines.map((l, k) => <li key={k}>{l}</li>)}</ul> : <p className="text-[var(--text-muted)] text-[12px]">{emptyText}</p>)}</div>}
    </section>
  );
}
