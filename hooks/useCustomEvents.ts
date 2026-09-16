'use client';
// 사용자가 직접 넣는 시장 이벤트 — CLARITY 통과 같은 정확한 날짜를 본인이 등록. localStorage 저장(동기화 대상).
import { useCallback, useEffect, useState } from 'react';
import type { MarketEvent } from '@/lib/marketEvents';

const KEY = 'kospi-lab-custom-events';
export interface CustomEvent extends MarketEvent { id: string }

export function useCustomEvents() {
  const [events, setEvents] = useState<CustomEvent[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    try { const r = localStorage.getItem(KEY); if (r) setEvents(JSON.parse(r)); } catch {}
  }, []);
  const save = (next: CustomEvent[]) => { setEvents(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {} };
  const add = useCallback((dateIso: string, title: string, scope: MarketEvent['scope']) => {
    const ts = Date.parse(dateIso);
    if (!Number.isFinite(ts) || !title.trim()) return;
    save([{ id: `${ts}-${Math.random().toString(36).slice(2, 7)}`, ts, title: title.trim(), type: 'CUSTOM', impact: 'high', scope }, ...events]);
  }, [events]);
  const remove = useCallback((id: string) => save(events.filter((e) => e.id !== id)), [events]);
  return { events, add, remove, mounted };
}
