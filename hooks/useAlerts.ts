'use client';

import { useState, useEffect } from 'react';
import type { AlertEntry } from '@/lib/types';

const KEY = 'kospi-lab-alerts';

export function useAlerts() {
  const [alerts, setAlerts] = useState<Record<string, AlertEntry>>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored) setAlerts(JSON.parse(stored));
    } catch {}
  }, []);

  const save = (data: Record<string, AlertEntry>) => {
    setAlerts(data);
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  };

  const setAlert = (ticker: string, entry: AlertEntry) => {
    save({ ...alerts, [ticker]: entry });
  };

  const removeAlert = (ticker: string) => {
    const next = { ...alerts };
    delete next[ticker];
    save(next);
  };

  return { alerts, setAlert, removeAlert };
}
