'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * 주식 판정 기록 — "그때 신호가 실제로 맞았는가"를 검증하는 이력.
 * useCoinJournal과 같은 패턴 (localStorage, 최근 100건).
 */
export interface StockJournalEntry {
  id: string;
  ts: number;
  ticker: string;
  name: string;
  stance: 'buy' | 'neutral' | 'reduce';
  state: string;
  score: number;
  price: number;    // 기록 시점 가격
  stop: number;
  target1: number;
  target2: number;
  reasonsTop: string[];
  result: 'open' | 'win' | 'loss' | 'even';
  resultR: number | null;
  memo: string;
}

const KEY = 'kospi-lab-stock-journal';

export function useStockJournal() {
  const [entries, setEntries] = useState<StockJournalEntry[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(KEY);
      if (stored) setEntries(JSON.parse(stored));
    } catch {}
  }, []);

  const add = useCallback((e: Omit<StockJournalEntry, 'id' | 'result' | 'resultR' | 'memo'>) => {
    const entry: StockJournalEntry = { ...e, id: `${e.ticker}-${e.ts}`, result: 'open', resultR: null, memo: '' };
    setEntries((prev) => {
      const next = [entry, ...prev].slice(0, 100);
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const update = useCallback((id: string, patch: Partial<StockJournalEntry>) => {
    setEntries((prev) => {
      const next = prev.map((x) => (x.id === id ? { ...x, ...patch } : x));
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setEntries((prev) => {
      const next = prev.filter((x) => x.id !== id);
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
    try { localStorage.setItem(KEY, '[]'); } catch {}
  }, []);

  const closed = entries.filter((e) => e.result !== 'open');
  const wins = closed.filter((e) => e.result === 'win');
  const stats = {
    total: entries.length,
    closed: closed.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : null,
    avgR: closed.length ? closed.reduce((a, e) => a + (e.resultR ?? 0), 0) / closed.length : null,
  };

  return { entries, mounted, add, update, remove, clear, stats };
}
