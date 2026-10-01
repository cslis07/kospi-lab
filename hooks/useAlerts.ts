'use client';

/**
 * 국내 종목 가격 알림(localStorage 'kospi-lab-alerts', 클라우드 동기화 대상).
 * 여러 곳(종목 상세·알림 관리·백그라운드 감시)에서 동시에 쓰므로, 저장할 때 'kl:alerts' 이벤트로 서로 갱신한다
 * (다른 탭은 storage 이벤트). 판정 규칙은 lib/priceAlert(테스트 고정).
 */
import { useState, useEffect, useCallback } from 'react';
import type { AlertEntry } from '@/lib/types';

const KEY = 'kospi-lab-alerts';
const EVT = 'kl:alerts';

function read(): Record<string, AlertEntry> {
  try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : {}; } catch { return {}; }
}

const CLEARED = { firedAt: undefined, firedSide: undefined, firedPrice: undefined };

export function useAlerts() {
  const [alerts, setAlerts] = useState<Record<string, AlertEntry>>({});
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

  // 항상 저장소의 최신본 위에 고친다(다른 화면이 방금 바꾼 것을 덮어쓰지 않게)
  const write = useCallback((fn: (cur: Record<string, AlertEntry>) => Record<string, AlertEntry>) => {
    const next = fn(read());
    setAlerts(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
    window.dispatchEvent(new Event(EVT));
  }, []);

  /** 설정·수정 — 켜진 상태로 저장하고 지난 발동 기록은 지운다 */
  const setAlert = useCallback((ticker: string, entry: AlertEntry) => {
    write((cur) => ({ ...cur, [ticker]: { ...cur[ticker], ...entry, enabled: entry.enabled ?? true, ...CLEARED } }));
  }, [write]);

  const patchAlert = useCallback((ticker: string, patch: Partial<AlertEntry>) => {
    write((cur) => (cur[ticker] ? { ...cur, [ticker]: { ...cur[ticker], ...patch } } : cur));
  }, [write]);

  /** 켜기/끄기 — 다시 켜면 발동 기록을 지워 다음 돌파를 기다린다 */
  const toggleAlert = useCallback((ticker: string, on: boolean) => {
    write((cur) => (cur[ticker] ? { ...cur, [ticker]: { ...cur[ticker], enabled: on, ...(on ? CLEARED : {}) } } : cur));
  }, [write]);

  const removeAlert = useCallback((ticker: string) => {
    write((cur) => { const next = { ...cur }; delete next[ticker]; return next; });
  }, [write]);

  return { alerts, mounted, setAlert, patchAlert, toggleAlert, removeAlert };
}
