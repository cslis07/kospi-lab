'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Hit { ticker: string; name: string; market?: string; code?: string }

export default function GlobalSearch() {
  const router = useRouter();
  const [q, setQ]         = useState('');
  const [hits, setHits]   = useState<Hit[]>([]);
  const [open, setOpen]   = useState(false);
  const [sel, setSel]     = useState(-1);
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const k = (e: KeyboardEvent) => {
      // Ctrl/Cmd+K → focus
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ref.current?.querySelector('input')?.focus();
      }
    };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
    };
  }, []);

  const search = (val: string) => {
    setQ(val);
    if (timer.current) clearTimeout(timer.current);
    const t = val.trim();
    if (!t) { setHits([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(t)}`);
        const data = await res.json();
        setHits(Array.isArray(data) ? data.slice(0, 8) : []);
        setOpen(true);
        setSel(-1);
      } catch { /* 무시 */ }
    }, 250);
  };

  const goto = (h: Hit) => {
    const code = (h.code ?? h.ticker).replace(/\.(KS|KQ)$/, '');
    router.push(`/stock/${code}`);
    setOpen(false); setQ('');
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSel((s) => Math.max(s - 1, -1)); }
    if (e.key === 'Enter' && hits.length) goto(hits[sel >= 0 ? sel : 0]);
    if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={ref} className="relative w-full max-w-[260px]">
      <div className={`flex items-center gap-1.5 border rounded-full px-3 py-1 transition-all bg-[var(--pill-bg)] ${
        focused ? 'border-sky-500/50' : 'border-[var(--border)]'
      }`}>
        <svg className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 110-16 8 8 0 010 16z" />
        </svg>
        <input
          type="text" placeholder="종목 검색"
          value={q}
          onChange={(e) => search(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => { setFocused(true); if (hits.length) setOpen(true); }}
          onBlur={() => setFocused(false)}
          className="flex-1 bg-transparent text-xs text-[var(--text)] placeholder-[var(--text-muted)] outline-none min-w-0"
        />
        <kbd className="hidden lg:inline text-[9px] text-[var(--text-muted)] border border-[var(--border)] rounded px-1 py-0.5">⌘K</kbd>
      </div>

      {open && hits.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl overflow-hidden">
          {hits.map((h, i) => (
            <button key={`${h.ticker}-${i}`} onClick={() => goto(h)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors border-b border-[var(--border)] last:border-0 ${
                sel === i ? 'bg-sky-500/10' : 'hover:bg-white/5'
              }`}>
              <span className="text-xs text-[var(--text)] truncate">{h.name}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {h.market && <span className="text-[9px] px-1 py-0.5 rounded bg-white/5 text-[var(--text-muted)]">{h.market}</span>}
                <span className="text-[10px] font-mono text-[var(--text-muted)]">{(h.code ?? h.ticker).replace(/\.(KS|KQ)$/, '')}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
