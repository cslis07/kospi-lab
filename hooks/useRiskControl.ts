'use client';

/**
 * /risk-control 전용 저장소 — 위험관리 설정·진입 판정 기록. 기존 키(kospi-lab-risk-limits·coin-journal)는 건드리지 않는다.
 * 'kospi-lab-' 접두사라 기기 동기화(lib/cloudSync) 대상이 된다.
 */
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_RISK_SETTINGS, sanitizeSettings, type RiskSettings } from '@/lib/riskControl';
import type { RiskDecisionRecord } from '@/lib/riskReview';

const SETTINGS_KEY = 'kospi-lab-risk-control';
const DECISIONS_KEY = 'kospi-lab-risk-decisions';
const MAX_DECISIONS = 500;

const read = <T,>(key: string): T | null => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
};
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 저장 실패는 무시(화면 값은 유지) */ } };

export function useRiskSettings() {
  const [settings, setSettings] = useState<RiskSettings>(DEFAULT_RISK_SETTINGS);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const saved = read<unknown>(SETTINGS_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 는 마운트 후에만 읽을 수 있다(SSR 불일치 방지)
    if (saved) setSettings(sanitizeSettings(saved));
    setMounted(true);
  }, []);
  const update = useCallback((patch: Partial<RiskSettings>) => {
    setSettings((prev) => { const next = sanitizeSettings({ ...prev, ...patch }); write(SETTINGS_KEY, next); return next; });
  }, []);
  const reset = useCallback(() => { setSettings(DEFAULT_RISK_SETTINGS); write(SETTINGS_KEY, DEFAULT_RISK_SETTINGS); }, []);
  return { settings, update, reset, mounted };
}

export function useRiskDecisions() {
  const [items, setItems] = useState<RiskDecisionRecord[]>([]);
  useEffect(() => {
    const saved = read<RiskDecisionRecord[]>(DECISIONS_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 는 마운트 후에만 읽을 수 있다
    if (Array.isArray(saved)) setItems(saved);
  }, []);
  const add = useCallback((d: RiskDecisionRecord) => {
    setItems((prev) => { const next = [d, ...prev].slice(0, MAX_DECISIONS); write(DECISIONS_KEY, next); return next; });
  }, []);
  const patch = useCallback((id: string, p: Partial<RiskDecisionRecord>) => {
    setItems((prev) => { const next = prev.map((x) => (x.id === id ? { ...x, ...p } : x)); write(DECISIONS_KEY, next); return next; });
  }, []);
  const remove = useCallback((id: string) => {
    setItems((prev) => { const next = prev.filter((x) => x.id !== id); write(DECISIONS_KEY, next); return next; });
  }, []);
  return { items, add, patch, remove };
}
