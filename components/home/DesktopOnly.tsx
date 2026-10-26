'use client';

/**
 * 데스크탑(md+)에서만 보이고, 보일 때만 마운트(데이터 조회)하는 래퍼 — 모바일 홈 축소(2026-10-26 메뉴 2단계).
 * 폭을 JS로 재지 않는다: CSS(hidden md:block)로 숨기고, 숨겨진(display:none) 상자는 IntersectionObserver 에 잡히지 않으니
 * 모바일에선 자식이 끝내 마운트되지 않아 지수 차트·뉴스 조회도 하지 않는다.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

export default function DesktopOnly({ children, minHeight = 0 }: { children: ReactNode; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setOn(true); io.disconnect(); } }, { rootMargin: '800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className="hidden md:block" style={on ? undefined : { minHeight }}>{on ? children : null}</div>;
}
