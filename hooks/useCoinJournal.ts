'use client';

import { useState, useEffect, useCallback } from 'react';

export interface JournalEntry {
  id: string;
  ts: number;                 // 기록 시각
  symbol: string;
  name: string;
  direction: 'long' | 'short' | 'wait';
  state: string;
  score: number;
  price: number;              // 기록 시점 가격
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  leverage: number;           // 리스크 패널에서 사용자가 실제 설정한 배율 (엔진 권장값 아님)
  reasonsTop: string[];       // 핵심 근거 요약
  result: 'open' | 'win' | 'loss' | 'even';
  resultR: number | null;     // 실현 R (win: +, loss: -)
  realizedUsdt?: number | null; // 실제 실현손익 (USDT) — 엔진 판정 vs 실제 성적 비교용
  /** 거래소 청산 포지션 id — 자동 대조에서 같은 체결을 두 번 반영하지 않기 위한 표식 */
  exchangePositionId?: string | null;
  // 기록 시점 리스크 패널 값 — "엔진 판정 vs 내 실제 사이징" 복기용
  seedUsdt?: number | null;   // 시드
  riskPct?: number | null;    // 1회 허용손실 %
  notionUsdt?: number | null; // 계획 노션
  memo: string;
}

const KEY = 'kospi-lab-coin-journal';

export function useCoinJournal() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(KEY);
      if (stored) setEntries(JSON.parse(stored));
    } catch {}
  }, []);

  const save = useCallback((next: JournalEntry[]) => {
    setEntries(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  }, []);

  const add = useCallback((e: Omit<JournalEntry, 'id' | 'result' | 'resultR' | 'memo'>) => {
    const entry: JournalEntry = {
      ...e,
      id: `${e.symbol}-${e.ts}`,
      result: 'open',
      resultR: null,
      memo: '',
    };
    setEntries((prev) => {
      const next = [entry, ...prev].slice(0, 1000);   // 성적 실측이 핵심 가치라 상한을 넉넉히
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const update = useCallback((id: string, patch: Partial<JournalEntry>) => {
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

  const clear = useCallback(() => save([]), [save]);

  /**
   * 거래소 대조 결과를 한 번에 반영한다(갱신 + 신규를 원자적으로).
   * 낱개 update/add 를 여러 번 부르면 setState 배칭 때문에 일부가 유실될 수 있어 하나로 묶는다.
   */
  const applyReconcile = useCallback((
    updates: { id: string; patch: Partial<JournalEntry> }[],
    additions: JournalEntry[],
  ) => {
    if (!updates.length && !additions.length) return;
    setEntries((prev) => {
      const patchMap = new Map(updates.map((u) => [u.id, u.patch]));
      const patched = prev.map((x) => (patchMap.has(x.id) ? { ...x, ...patchMap.get(x.id)! } : x));
      const have = new Set(patched.map((x) => x.id));
      const fresh = additions.filter((a) => !have.has(a.id));
      const next = [...fresh, ...patched].sort((a, b) => b.ts - a.ts).slice(0, 1000);
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // 통계: 마감된 기록만 집계
  const closed = entries.filter((e) => e.result !== 'open');
  const wins = closed.filter((e) => e.result === 'win');
  const withUsdt = closed.filter((e) => e.realizedUsdt !== null && e.realizedUsdt !== undefined);
  const stats = {
    total: entries.length,
    closed: closed.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : null,
    avgR: closed.length
      ? closed.reduce((a, e) => a + (e.resultR ?? 0), 0) / closed.length
      : null,
    // 실제 실현손익 합계 (입력된 건만) — "엔진 승률 vs 내 실제 성적" 비교의 기준
    totalUsdt: withUsdt.length ? withUsdt.reduce((a, e) => a + (e.realizedUsdt ?? 0), 0) : null,
    usdtCount: withUsdt.length,
  };

  return { entries, mounted, add, update, remove, clear, applyReconcile, stats };
}
