'use client';

import { useState, useRef, useEffect } from 'react';
import type { SearchResult, WatchlistItem } from '@/lib/types';

interface Props {
  onAdd: (item: WatchlistItem) => void;
}

export default function SearchBar({ onAdd }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = (q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
        setOpen(true);
        setSelected(-1);
      } catch {}
      setLoading(false);
    }, 250);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, -1)); }
    if (e.key === 'Enter' && selected >= 0) pick(results[selected]);
    if (e.key === 'Escape') setOpen(false);
  };

  const pick = (r: SearchResult) => {
    onAdd({ ticker: r.ticker, name: r.name, market: r.market });
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative w-full max-w-sm">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 focus-within:border-sky-500/50 focus-within:bg-white/8 transition-all">
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          placeholder="종목명·코드 검색"
          className="w-full bg-transparent text-sm text-white placeholder-gray-500 outline-none"
          onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {loading && (
          <div className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin shrink-0" />
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1.5 w-full rounded-xl border border-white/10 bg-gray-900 shadow-2xl overflow-hidden">
          {results.map((r, i) => (
            <li key={r.ticker}>
              <button
                className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${
                  i === selected ? 'bg-sky-500/20 text-sky-300' : 'text-gray-300 hover:bg-white/5'
                }`}
                onClick={() => pick(r)}
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-xs text-gray-500">{r.ticker}</span>
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                  r.market === 'KOSDAQ' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                }`}>{r.market}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
