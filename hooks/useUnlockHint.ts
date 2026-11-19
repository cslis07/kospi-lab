'use client';

/**
 * 잠금 해제 여부(lib/unlockHint)를 마운트 후에 알아낸다 — null = 아직 모름(서버가 그린 첫 화면과 같게 '불러오는 중'으로 둔다),
 * true = 게이트 API 를 불러도 됨, false = 잠긴 기기(부르지 않음 → 401 콘솔 오류 없음).
 */
import { useEffect, useState } from 'react';
import { probeUnlocked } from '@/lib/unlockHint';

export function useUnlockHint(): boolean | null {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    probeUnlocked().then((v) => { if (alive) setOn(v); });
    return () => { alive = false; };
  }, []);
  return on;
}
