'use client';

/**
 * 코인 선물 가격 알림 저장소(localStorage 'kospi-lab-coin-price-alerts', 이 기기 전용).
 * 심볼당 여러 레벨(목표·손절·추적). 여러 화면이 동시에 쓰므로 'kl:coin-price-alerts' 이벤트로 서로 갱신.
 * 판정은 lib/coinPriceAlert(테스트 고정).
 */
import { useState, useEffect, useCallback } from 'react';
import type { CoinPriceAlert } from '@/lib/coinPriceAlert';

const KEY = 'kospi-lab-coin-price-alerts';
const EVT = 'kl:coin-price-alerts';

function read(): CoinPriceAlert[] {
  try { const s = localStorage.getItem(KEY); const a = s ? JSON.parse(s) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}

export function useCoinPriceAlerts() {
  const [alerts, setAlerts] = useState<CoinPriceAlert[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setAlerts(read());
    setMounted(true);
    const sync = () => setAlerts(read());
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) sync(); };
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener('storage', onStorage); };
  }, []);

  const write = useCallback((fn: (cur: CoinPriceAlert[]) => CoinPriceAlert[]) => {
    const next = fn(read());
    setAlerts(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 용량·사생활 모드 */ }
    window.dispatchEvent(new Event(EVT));
  }, []);

  /** 같은 id는 교체(중복 등록 방지). 최대 40개 유지(최근 우선) */
  const addMany = useCallback((list: CoinPriceAlert[]) => {
    write((cur) => {
      const byId = new Map(cur.map((a) => [a.id, a]));
      for (const a of list) byId.set(a.id, a);
      return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 40);
    });
  }, [write]);

  const patch = useCallback((id: string, p: Partial<CoinPriceAlert>) => {
    write((cur) => cur.map((a) => (a.id === id ? { ...a, ...p } : a)));
  }, [write]);

  const remove = useCallback((id: string) => { write((cur) => cur.filter((a) => a.id !== id)); }, [write]);
  const removeBySymbol = useCallback((symbol: string) => { write((cur) => cur.filter((a) => a.symbol !== symbol)); }, [write]);

  return { alerts, mounted, addMany, patch, remove, removeBySymbol };
}
