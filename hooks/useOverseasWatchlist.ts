'use client';

import type { OverseasWatchlistItem } from '@/lib/types';
import { useSyncedList } from './useSyncedList';

const DEFAULT: OverseasWatchlistItem[] = [
  { symbol: 'AAPL',  name: 'Apple',  exchange: 'NASDAQ' },
  { symbol: 'NVDA',  name: 'NVIDIA', exchange: 'NASDAQ' },
  { symbol: 'MSFT',  name: 'Microsoft', exchange: 'NASDAQ' },
  { symbol: 'TSLA',  name: 'Tesla',  exchange: 'NASDAQ' },
  { symbol: 'AMZN',  name: 'Amazon', exchange: 'NASDAQ' },
];

const KEY = 'kospi-lab-overseas-watchlist';

export function useOverseasWatchlist() {
  const { list: watchlist, mounted, save, current } = useSyncedList<OverseasWatchlistItem>(KEY, DEFAULT);

  const add = (item: OverseasWatchlistItem) => {
    const cur = current();
    if (cur.some((w) => w.symbol === item.symbol)) return;
    save([...cur, item]);
  };

  const remove = (symbol: string) => {
    save(current().filter((w) => w.symbol !== symbol));
  };

  return { watchlist, add, remove, mounted };
}
