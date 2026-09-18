'use client';

import type { WatchlistItem } from '@/lib/types';
import { useSyncedList } from './useSyncedList';

const DEFAULT_WATCHLIST: WatchlistItem[] = [
  { ticker: '005930', name: '삼성전자', market: 'KOSPI' },
  { ticker: '000660', name: 'SK하이닉스', market: 'KOSPI' },
  { ticker: '005380', name: '현대차', market: 'KOSPI' },
];

const KEY = 'kospi-lab-watchlist';

export function useWatchlist() {
  const { list: watchlist, mounted, save, current } = useSyncedList<WatchlistItem>(KEY, DEFAULT_WATCHLIST);

  const add = (item: WatchlistItem) => {
    const cur = current();
    if (cur.some((w) => w.ticker === item.ticker)) return;
    save([...cur, item]);
  };

  const remove = (ticker: string) => {
    save(current().filter((w) => w.ticker !== ticker));
  };

  const updateMemo = (ticker: string, memo: string) => {
    save(
      current().map((w) =>
        w.ticker === ticker ? { ...w, memo: memo.trim() || undefined } : w
      )
    );
  };

  return { watchlist, add, remove, updateMemo, mounted };
}
