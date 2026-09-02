'use client';

// 손실 서킷브레이커 한도 — 사용자가 정하는 규율 설정. localStorage 에 저장(동기화 대상).
import { useEffect, useState, useCallback } from 'react';
import type { BreakerLimits } from '@/lib/circuitBreaker';
import { DEFAULT_LIMITS } from '@/lib/circuitBreaker';

const KEY = 'kospi-lab-risk-limits';

export function useRiskLimits() {
  const [limits, setLimits] = useState<BreakerLimits>(DEFAULT_LIMITS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setLimits({ ...DEFAULT_LIMITS, ...JSON.parse(raw) });
    } catch {}
  }, []);

  const update = useCallback((patch: Partial<BreakerLimits>) => {
    setLimits((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return { limits, update, mounted };
}
