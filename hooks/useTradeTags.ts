'use client';

/**
 * 매매(청산 포지션)별 셋업·실수 태그 오버레이 — positionId로 키를 잡아 이 브라우저에만 덧입힌다.
 * 기분(useTradeMood)과 같은 방식이되 별도 저장소로 디커플.
 */
import { useCallback, useEffect, useState } from 'react';
import type { TradeTagSet } from '@/lib/tradeTags';

interface StoredTagSet extends TradeTagSet { ts: number }

const KEY = 'kospi-lab-trade-tags';

export function useTradeTags() {
  const [tags, setTags] = useState<Record<string, StoredTagSet>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const s = localStorage.getItem(KEY);
      if (s) setTags(JSON.parse(s));
    } catch { /* 무시 */ }
  }, []);

  /** 셋업·실수 배열을 통째로 저장(둘 다 비면 삭제) */
  const saveTags = useCallback((id: string, setups: string[], mistakes: string[]) => {
    setTags((prev) => {
      const next = { ...prev };
      if (!setups.length && !mistakes.length) delete next[id];
      else next[id] = { setups, mistakes, ts: Date.now() };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 무시 */ }
      return next;
    });
  }, []);

  const clearTags = useCallback((id: string) => {
    setTags((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 무시 */ }
      return next;
    });
  }, []);

  return { tags, mounted, saveTags, clearTags };
}
