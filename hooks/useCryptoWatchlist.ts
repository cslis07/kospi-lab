'use client';

import type { CryptoWatchlistItem } from '@/lib/types';
import { useSyncedList } from './useSyncedList';

const DEFAULT: CryptoWatchlistItem[] = [
  { symbol: 'BTCUSDT', base: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETHUSDT', base: 'ETH', name: 'Ethereum' },
  { symbol: 'XRPUSDT', base: 'XRP', name: 'XRP' },
];

const KEY = 'kospi-lab-crypto-watchlist';

export function useCryptoWatchlist() {
  const { list: watchlist, mounted, save, current } = useSyncedList<CryptoWatchlistItem>(KEY, DEFAULT);

  const add = (item: CryptoWatchlistItem) => {
    const cur = current();
    if (cur.some((w) => w.symbol === item.symbol)) return;
    save([...cur, item]);
  };

  const remove = (symbol: string) => {
    save(current().filter((w) => w.symbol !== symbol));
  };

  return { watchlist, add, remove, mounted };
}
