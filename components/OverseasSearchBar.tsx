'use client';

import { useState, useRef, useEffect } from 'react';
import type { OverseasWatchlistItem } from '@/lib/types';
import type { OverseasItem } from '@/lib/overseasList';

interface Props {
  onAdd: (item: OverseasWatchlistItem) => void;
}

export default function OverseasSearchBar({ onAdd }: Props) {
  const [query, setQuery]   = useState('');
  const [results, setResults] = useState<OverseasItem[]>([]);
  const [open, setOpen]     = useState(false);
  const [sel, setSel]       = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const search = (q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/overseas/search?q=${encodeURIComponent(q)}`);
      const data: OverseasItem[] = await res.json();
      setResults(data);
      setOpen(true);
      setSel(-1);
    }, 200);
  };

  const pick = (r: OverseasItem) => {
    onAdd({ symbol: r.symbol, name: r.name, exchange: r.exchange });
    setQuery(''); setResults([]); setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s+1, results.length-1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSel(s => Math.max(s-1, -1)); }
    if (e.key === 'Enter' && sel >= 0) pick(results[sel]);
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div ref={ref} className="relative w-full max-w-sm">
      <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 focus-within:border-sky-500/50 transition-all">
        <svg className="w-4 h-4 text-[var(--text-muted)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          placeholder="종목명·심볼 검색  (AAPL, Tesla…)"
          className="w-full bg-transparent text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none"
          onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl overflow-hidden">
          {results.map((r, i) => (
            <li key={r.symbol}>
              <button
                className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${
                  i === sel ? 'bg-sky-500/20 text-sky-300' : 'text-[var(--text)] hover:bg-white/5'
                }`}
                onClick={() => pick(r)}
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-sky-400 w-14 shrink-0">{r.symbol}</span>
                  <span className="text-[var(--text-muted)]">{r.name}</span>
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 font-mono">
                  {r.exchange}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
