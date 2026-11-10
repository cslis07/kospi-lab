'use client';

import { usePathname } from 'next/navigation';

/**
 * usePathname 대신 쓰는 경로 훅 — Vercel 이 홈('/')을 ISR 로 다시 만들 때 서버 렌더의 경로가 '/index' 로 잡힌다
 * (2026-11-10 운영 확인: 재생성 HTML 의 라우터 경로 ["","index"], 빌드 때 HTML 은 ["",""]).
 * 그러면 헤더·메뉴가 홈이 아닌 모양으로 그려져, 브라우저('/')에서 하이드레이션 불일치(React #418)가 났다.
 * '/index' 라는 실제 페이지는 없으므로 '/' 로 맞춘다. 레이아웃에 있는 컴포넌트는 반드시 이 훅을 쓸 것.
 */
export function useAppPathname(): string {
  const p = usePathname();
  return p === '/index' ? '/' : p;
}
