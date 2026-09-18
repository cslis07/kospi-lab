'use client';

/**
 * 관심목록 안에서 이전/다음 종목으로 넘기기 — 헤더 카드를 옆으로 밀거나(모바일) 아래 바의 버튼으로.
 * 현재 종목이 관심목록에 없으면(검색으로 들어온 경우) 아무것도 붙이지 않는다.
 * 뒤로가기가 목록으로 돌아가도록 replace 로 이동(종목마다 기록이 쌓이지 않게).
 */
import { useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

export interface NavItem { key: string; href: string; label: string }

const THRESHOLD = 70;

export default function SwipeNav({ items, current, children }: { items: NavItem[]; current: string; children: ReactNode }) {
  const router = useRouter();
  const idx = items.findIndex((i) => i.key === current);
  const prev = idx > 0 ? items[idx - 1] : null;
  const next = idx >= 0 && idx < items.length - 1 ? items[idx + 1] : null;
  const start = useRef<{ x: number; y: number; lock?: 'h' | 'v' } | null>(null);
  const [dx, setDx] = useState(0);
  // 손을 뗄 때는 ref 로 판정 — 빠른 플릭은 마지막 이동과 떼기가 같은 프레임이라 상태값이 아직 옛 값이다
  const dxRef = useRef(0);
  const [dragging, setDragging] = useState(false);

  if (idx < 0 || items.length < 2) return <>{children}</>;

  const onEnd = () => {
    setDragging(false);
    const d = dxRef.current;
    if (d <= -THRESHOLD && next) router.replace(next.href);
    else if (d >= THRESHOLD && prev) router.replace(prev.href);
    dxRef.current = 0;
    setDx(0);
    start.current = null;
  };

  return (
    <div>
      <div
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dragging ? 'none' : 'transform .22s var(--ease)', touchAction: 'pan-y' }}
        onTouchStart={(e) => { start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; setDragging(true); }}
        onTouchMove={(e) => {
          const s = start.current;
          if (!s) return;
          const mx = e.touches[0].clientX - s.x, my = e.touches[0].clientY - s.y;
          if (!s.lock) {
            if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my)) s.lock = 'h';
            else if (Math.abs(my) > 10) s.lock = 'v';
          }
          // 이웃이 없는 쪽으로는 저항을 줘서 끝임을 알린다
          if (s.lock === 'h') {
            const v = (mx < 0 && !next) || (mx > 0 && !prev) ? mx * 0.25 : mx;
            dxRef.current = v;
            setDx(v);
          }
        }}
        onTouchEnd={onEnd}
        onTouchCancel={onEnd}
      >
        {children}
      </div>
      <div className="swipe-nav">
        <button type="button" disabled={!prev} onClick={() => prev && router.replace(prev.href)} aria-label={prev ? `이전 종목 ${prev.label}` : '이전 종목 없음'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
          <span className="truncate">{prev?.label ?? ''}</span>
        </button>
        <span className="swipe-pos">관심 {idx + 1}/{items.length}</span>
        <button type="button" disabled={!next} onClick={() => next && router.replace(next.href)} aria-label={next ? `다음 종목 ${next.label}` : '다음 종목 없음'}>
          <span className="truncate">{next?.label ?? ''}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
    </div>
  );
}
