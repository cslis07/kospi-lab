'use client';

/**
 * 밀어서 여는 행 동작 — 관심종목 행을 왼쪽으로 밀면 뒤에 숨은 버튼(분석·삭제 등)이 드러난다.
 * 세로 스크롤은 그대로(touch-action: pan-y), 가로로 먼저 움직일 때만 행이 따라온다.
 * 열린 상태에서 행을 탭하면 이동하지 않고 닫힌다. 마우스 환경은 행의 ⋮ 메뉴를 쓴다.
 */
import { useRef, useState, type ReactNode } from 'react';
import { ICON } from '@/lib/menu';

export interface RowAction { label: string; icon: string; tone: 'danger' | 'accent' | 'muted'; onClick: () => void }

const BTN = 76;

export default function SwipeRow({ actions, children }: { actions: RowAction[]; children: ReactNode }) {
  const W = actions.length * BTN;
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const s = useRef<{ x: number; y: number; base: number; lock?: 'h' | 'v' } | null>(null);

  const end = () => {
    setDragging(false);
    setX((v) => (v < -W / 2 ? -W : 0));
    s.current = null;
  };

  return (
    <div className="swr">
      {/* 닫힌 상태에선 숨김 — 소수점 레이아웃에서 뒤 버튼 색이 1px 비치지 않게 */}
      <div className="swr-acts" style={{ width: W, visibility: x === 0 && !dragging ? 'hidden' : 'visible' }} aria-hidden={x === 0}>
        {actions.map((a) => (
          <button key={a.label} type="button" tabIndex={x === 0 ? -1 : 0} className={`swr-a ${a.tone}`} onClick={() => { a.onClick(); setX(0); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICON[a.icon]} /></svg>
            {a.label}
          </button>
        ))}
      </div>
      <div
        className="swr-fg"
        style={{ transform: x ? `translateX(${x}px)` : undefined, transition: dragging ? 'none' : 'transform .22s var(--ease)' }}
        onTouchStart={(e) => { s.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, base: x }; setDragging(true); }}
        onTouchMove={(e) => {
          const c = s.current;
          if (!c) return;
          const dx = e.touches[0].clientX - c.x, dy = e.touches[0].clientY - c.y;
          if (!c.lock) {
            if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) c.lock = 'h';
            else if (Math.abs(dy) > 8) c.lock = 'v';
          }
          if (c.lock === 'h') setX(Math.max(-W - 24, Math.min(0, c.base + dx)));
        }}
        onTouchEnd={end}
        onTouchCancel={end}
        onClickCapture={(e) => { if (x !== 0) { e.preventDefault(); e.stopPropagation(); setX(0); } }}
      >
        {children}
      </div>
    </div>
  );
}
