'use client';

/**
 * 매매(청산 포지션)별 진입 당시 기분 오버레이.
 * 거래소가 매매 목록의 소스이고, 기분은 positionId로 키를 잡아 이 브라우저에만 덧입힌다.
 * (기존 useCoinJournal의 복잡한 계획/R 파이프라인과 디커플 — 단순 객체 저장)
 */
import { useCallback, useEffect, useState } from 'react';
import type { MoodKey } from '@/lib/tradeMood';

export interface TradeMood {
  mood: MoodKey;
  note?: string;
  ts: number; // 기록 시각
}

const KEY = 'kospi-lab-trade-mood';

export function useTradeMood() {
  const [moods, setMoods] = useState<Record<string, TradeMood>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const s = localStorage.getItem(KEY);
      if (s) setMoods(JSON.parse(s));
    } catch { /* 무시 */ }
  }, []);

  const setMood = useCallback((id: string, mood: MoodKey, note?: string) => {
    setMoods((prev) => {
      const next = { ...prev, [id]: { mood, note: note?.trim() || undefined, ts: Date.now() } };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 무시 */ }
      return next;
    });
  }, []);

  const clearMood = useCallback((id: string) => {
    setMoods((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 무시 */ }
      return next;
    });
  }, []);

  return { moods, mounted, setMood, clearMood };
}
