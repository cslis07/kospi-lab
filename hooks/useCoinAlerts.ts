'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * 코인선물 조건 알림 (localStorage + 브라우저 Notification)
 *  - 심볼별로 "진입 조건 충족 시" 또는 "방향(롱/숏) 전환 시" 알림 설정
 *  - 분석 응답이 갱신될 때마다 check()를 호출해 조건 충족 시 알림 발사
 *  - 서버 푸시 없이 페이지가 열려 있을 때만 동작(자동 새로고침과 함께 사용)
 */
export interface CoinAlertRule {
  symbol: string;
  onEntryOk: boolean;                 // 진입 조건 충족 시 알림
  onDirection: 'long' | 'short' | null; // 특정 방향 전환 시 알림
  lastFiredTs?: number;
  lastDirection?: 'long' | 'short' | 'wait';
}

const KEY = 'kospi-lab-coin-alerts';
const COOLDOWN = 5 * 60 * 1000; // 같은 알림 5분 쿨다운

export function useCoinAlerts() {
  const [rules, setRules] = useState<Record<string, CoinAlertRule>>({});
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const rulesRef = useRef(rules);
  rulesRef.current = rules;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored) setRules(JSON.parse(stored));
    } catch {}
    if (typeof Notification !== 'undefined') setPermission(Notification.permission);
  }, []);

  const persist = useCallback((next: Record<string, CoinAlertRule>) => {
    setRules(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'denied' as NotificationPermission;
    const p = await Notification.requestPermission();
    setPermission(p);
    return p;
  }, []);

  const setRule = useCallback((symbol: string, patch: Partial<CoinAlertRule>) => {
    const cur = rulesRef.current[symbol] ?? { symbol, onEntryOk: false, onDirection: null };
    persist({ ...rulesRef.current, [symbol]: { ...cur, ...patch } });
  }, [persist]);

  const removeRule = useCallback((symbol: string) => {
    const next = { ...rulesRef.current };
    delete next[symbol];
    persist(next);
  }, [persist]);

  const fire = useCallback((title: string, body: string) => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification(title, { body, icon: '/favicon.ico' }); } catch {}
    }
  }, []);

  /** 분석 결과 갱신 시 호출 */
  const check = useCallback((symbol: string, name: string, direction: 'long' | 'short' | 'wait', entryOk: boolean, score: number) => {
    const rule = rulesRef.current[symbol];
    if (!rule) return;
    const now = Date.now();
    const onCooldown = rule.lastFiredTs && now - rule.lastFiredTs < COOLDOWN;

    let fired = false;
    if (rule.onEntryOk && entryOk && !onCooldown) {
      fire(`${name} 진입 조건 충족`, `${direction === 'long' ? '롱' : '숏'} · 종합점수 ${score > 0 ? '+' : ''}${score}`);
      fired = true;
    } else if (rule.onDirection && direction === rule.onDirection && rule.lastDirection !== direction && !onCooldown) {
      fire(`${name} ${direction === 'long' ? '롱' : '숏'} 전환`, `종합점수 ${score > 0 ? '+' : ''}${score}`);
      fired = true;
    }

    if (fired || rule.lastDirection !== direction) {
      persist({ ...rulesRef.current, [symbol]: { ...rule, lastDirection: direction, ...(fired ? { lastFiredTs: now } : {}) } });
    }
  }, [fire, persist]);

  return { rules, permission, requestPermission, setRule, removeRule, check, fire };
}
