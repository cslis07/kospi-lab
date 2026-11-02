'use client';

/**
 * 자동 갱신 절약 — 탭이 안 보이거나 입력(터치·클릭·마우스 이동·키·스크롤)이 IDLE_MS 넘게 없으면 SWR 주기 갱신을 멈춘다.
 * 화면 요소는 없다(문맥 제공자만). 다시 손대면 다음 주기부터 그대로 갱신되고, 탭 복귀 땐 SWR 이 즉시 다시 받는다.
 *
 * 왜: Vercel 함수 실행(Active CPU)은 대부분 '켜 둔 채 방치된 탭'의 주기 요청이었다(2026-11-02 요청 로그 —
 * 사람이 안 보는 브라우저 1개가 3시간에 함수 500회). 보고 있지 않은 화면은 새 값이 필요 없다.
 * 가격 알림 감시(PriceAlertWatcher)처럼 방치 중에도 돌아야 하는 것은 그 훅에서 isPaused 를 따로 준다.
 */
import { useEffect, type ReactNode } from 'react';
import { SWRConfig } from 'swr';

export const IDLE_MS = 10 * 60_000;
let lastInput = 0;

/** 지금 자동 갱신을 쉬어도 되는가 — 탭이 숨겨졌거나 입력이 IDLE_MS 넘게 없음 */
export function pollingIdle(now = Date.now()): boolean {
  if (typeof document === 'undefined') return false;
  if (document.visibilityState === 'hidden') return true;
  return lastInput > 0 && now - lastInput > IDLE_MS;
}

const isPaused = () => pollingIdle();

export default function PollingGovernor({ children }: { children: ReactNode }) {
  useEffect(() => {
    lastInput = Date.now();
    const mark = () => { lastInput = Date.now(); };
    // window 캡처 단계 — 탭 복귀(visibilitychange·focus) 때 SWR 의 복귀 갱신 처리보다 먼저 '활동'으로 기록돼야 멈춤이 풀린다
    const evs = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll', 'focus', 'visibilitychange'] as const;
    for (const e of evs) window.addEventListener(e, mark, { passive: true, capture: true });
    return () => { for (const e of evs) window.removeEventListener(e, mark, { capture: true }); };
  }, []);
  return <SWRConfig value={{ isPaused }}>{children}</SWRConfig>;
}
