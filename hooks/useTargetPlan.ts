'use client';
// 목표 수익률 설정 — 시드·월 목표%·회당 리스크%·월 매매수. localStorage 저장(동기화 대상 키 규칙 준수)
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_TARGET, type TargetSettings } from '@/lib/targetPlan';

const KEY = 'kospi-lab-target';

export function useTargetPlan() {
  const [settings, setSettings] = useState<TargetSettings>(DEFAULT_TARGET);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    try { const raw = localStorage.getItem(KEY); if (raw) setSettings({ ...DEFAULT_TARGET, ...JSON.parse(raw) }); } catch {}
  }, []);
  const update = useCallback((patch: Partial<TargetSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  return { settings, update, mounted };
}
