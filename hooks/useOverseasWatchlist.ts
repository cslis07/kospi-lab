'use client';

import { useState, useEffect } from 'react';
import type { OverseasWatchlistItem } from '@/lib/types';

const DEFAULT: OverseasWatchlistItem[] = [
  { symbol: 'AAPL',  name: 'Apple',  exchange: 'NASDAQ' },
  { symbol: 'NVDA',  name: 'NVIDIA', exchange: 'NASDAQ' },
  { symbol: 'MSFT',  name: 'Microsoft', exchange: 'NASDAQ' },
  { symbol: 'TSLA',  name: 'Tesla',  exchange: 'NASDAQ' },
  { symbol: 'AMZN',  name: 'Amazon', exchange: 'NASDAQ' },
];

const KEY = 'kospi-lab-overseas-watchlist';

export function useOverseasWatchlist() {
  const [watchlist, setWatchlist] = useState<OverseasWatchlistItem[]>(DEFAULT);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(KEY);
      if (stored) setWatchlist(JSON.parse(stored));
    } catch {}
  }, []);

  const save = (items: OverseasWatchlistItem[]) => {
    setWatchlist(items);
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
  };

  const add = (item: OverseasWatchlistItem) => {
    if (watchlist.some((w) => w.symbol === item.symbol)) return;
    save([...watchlist, item]);
  };

  const remove = (symbol: string) => {
    save(watchlist.filter((w) => w.symbol !== symbol));
  };

  return { watchlist, add, remove, mounted };
}
