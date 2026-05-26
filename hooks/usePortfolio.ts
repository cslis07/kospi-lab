'use client';

import { useState, useEffect } from 'react';
import type { PortfolioEntry } from '@/lib/types';

const KEY = 'kospi-lab-portfolio';

export function usePortfolio() {
  const [portfolio, setPortfolio] = useState<Record<string, PortfolioEntry>>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored) setPortfolio(JSON.parse(stored));
    } catch {}
  }, []);

  const save = (data: Record<string, PortfolioEntry>) => {
    setPortfolio(data);
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  };

  const setEntry = (ticker: string, entry: PortfolioEntry) => {
    save({ ...portfolio, [ticker]: entry });
  };

  const removeEntry = (ticker: string) => {
    const next = { ...portfolio };
    delete next[ticker];
    save(next);
  };

  return { portfolio, setEntry, removeEntry };
}
