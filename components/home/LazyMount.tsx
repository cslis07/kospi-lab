'use client';

/**
 * 화면 800px 앞에 다가오면 마운트 — 홈 아래쪽 카드가 첫 로드에 API를 한꺼번에 부르지 않게(옛 PcMarketSections 에서 분리).
 * 한 번 마운트되면 유지. IntersectionObserver 가 없으면 바로 마운트.
 */
import { useEffect, useState } from 'react';

export default function LazyMount({ minHeight, children }: { minHeight: number; children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!el || on) return;
    if (typeof IntersectionObserver === 'undefined') { const t = setTimeout(() => setOn(true), 0); return () => clearTimeout(t); }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setOn(true); }, { rootMargin: '800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [el, on]);
  return <div ref={setEl} className="h-full" style={on ? undefined : { minHeight }}>{on ? children : null}</div>;
}
