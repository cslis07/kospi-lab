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
  // 복기 태그(선택) — 셋업·실수·확신(1~5). 성과 복기 교차표용
  setups?: string[];
  mistakes?: string[];
  conviction?: number;
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
      const next = [entry, ...prev].slice(0, 1000);   // 성적 실측이 핵심 가치라 상한을 넉넉히
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
  // /journal 성적 탭(lib/journalStats.scoreboard)과 같은 정의 — 승률 분모=승+패(본전 제외), 평균 R=R 기록된 건만
  const decided = closed.filter((e) => e.result === 'win' || e.result === 'loss').length;
  const rVals = closed.map((e) => e.resultR).filter((x): x is number => x != null && Number.isFinite(x));
  const stats = {
    total: entries.length,
    closed: closed.length,
    winRate: decided ? (wins.length / decided) * 100 : null,
    avgR: rVals.length ? rVals.reduce((a, v) => a + v, 0) / rVals.length : null,
  };

  return { entries, mounted, add, update, remove, clear, stats };
}
