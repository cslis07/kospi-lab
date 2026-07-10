'use client';

import { useEffect, useState } from 'react';
import { BRIEFING_MODELS, DEFAULT_BRIEFING_MODEL } from '@/lib/anthropic';

const KEY = 'kl_briefing_model';

const isValid = (id: string) => BRIEFING_MODELS.some((m) => m.id === id);

/**
 * AI 브리핑 모델 선택. localStorage에 저장해 페이지·세션 간 유지한다.
 *
 * SSR에서는 항상 기본값을 반환하고 마운트 후 저장값으로 교체한다(하이드레이션 불일치 방지).
 * `ready`가 false인 동안 SWR 키를 만들지 않으면, 저장값이 Sonnet이 아닌데도
 * 기본 모델로 한 번 요청이 나가는 낭비를 막을 수 있다.
 */
export function useBriefingModel() {
  const [model, setModelState] = useState(DEFAULT_BRIEFING_MODEL);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (saved && isValid(saved)) setModelState(saved);
    setReady(true);
  }, []);

  const setModel = (id: string) => {
    if (!isValid(id)) return;
    setModelState(id);
    localStorage.setItem(KEY, id);
  };

  return { model, setModel, ready };
}
