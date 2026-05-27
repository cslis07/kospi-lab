'use client';

import { useState, useEffect } from 'react';
import type { WatchlistItem } from '@/lib/types';

const DEFAULT_WATCHLIST: WatchlistItem[] = [
  { ticker: '005930', name: '삼성전자', market: 'KOSPI' },
  { ticker: '000660', name: 'SK하이닉스', market: 'KOSPI' },
  { ticker: '005380', name: '현대차', market: 'KOSPI' },
];

const KEY = 'kospi-lab-watchlist';

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(DEFAULT_WATCHLIST);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(KEY);
      if (stored) setWatchlist(JSON.parse(stored));
    } catch {}
  }, []);

  const save = (items: WatchlistItem[]) => {
    setWatchlist(items);
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
  };

  const add = (item: WatchlistItem) => {
    if (watchlist.some((w) => w.ticker === item.ticker)) return;
    save([...watchlist, item]);
  };

  const remove = (ticker: string) => {
    save(watchlist.filter((w) => w.ticker !== ticker));
  };

  const updateMemo = (ticker: string, memo: string) => {
    save(
      watchlist.map((w) =>
        w.ticker === ticker ? { ...w, memo: memo.trim() || undefined } : w
      )
    );
  };

  return { watchlist, add, remove, updateMemo, mounted };
}
