'use client';

import { useState, useEffect } from 'react';
import type { CryptoWatchlistItem } from '@/lib/types';

const DEFAULT: CryptoWatchlistItem[] = [
  { symbol: 'BTCUSDT', base: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETHUSDT', base: 'ETH', name: 'Ethereum' },
  { symbol: 'XRPUSDT', base: 'XRP', name: 'XRP' },
];

const KEY = 'kospi-lab-crypto-watchlist';

export function useCryptoWatchlist() {
  const [watchlist, setWatchlist] = useState<CryptoWatchlistItem[]>(DEFAULT);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(KEY);
      if (stored) setWatchlist(JSON.parse(stored));
    } catch {}
  }, []);

  const save = (items: CryptoWatchlistItem[]) => {
    setWatchlist(items);
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
  };

  const add = (item: CryptoWatchlistItem) => {
    if (watchlist.some((w) => w.symbol === item.symbol)) return;
    save([...watchlist, item]);
  };

  const remove = (symbol: string) => {
    save(watchlist.filter((w) => w.symbol !== symbol));
  };

  return { watchlist, add, remove, mounted };
}
