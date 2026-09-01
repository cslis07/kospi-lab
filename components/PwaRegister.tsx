'use client';

// PWA 서비스워커 등록 — 설치 가능 + 오프라인 실행을 켠다.
// 등록 실패는 조용히 무시한다(SW 없어도 앱은 그대로 동작).
import { useEffect } from 'react';

export default function PwaRegister() {
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
