'use client';

/**
 * 바텀시트 — 모바일에서 복잡한 선택지·필터·메뉴를 화면 아래에서 올려 숨기고 펼치는 공용 컨테이너.
 * - 딤 배경 탭/ESC/헤더를 아래로 끌기(110px↑)로 닫힘, 열린 동안 배경 스크롤 잠금
 * - body 포털 렌더(부모 overflow·z-index 영향 없음), 안전영역(제스처바) 하단 여백
 * - 데스크탑(md+)에선 가운데 폭 제한 시트로 같은 동작
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export default function BottomSheet({
  open, onClose, title, children, footer, full = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** 화면 높이 거의 전체(메뉴·긴 목록) */
  full?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [dragY, setDragY] = useState(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  // 호출부가 매 렌더 새 함수를 넘겨도 효과가 재실행되지 않게 ref 로 보관
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setDragY(0);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="sheet-root" role="dialog" aria-modal="true" aria-label={title ?? '시트'}>
      <div className="sheet-dim mfade" onClick={() => closeRef.current()} />
      <div
        className={`sheet ${full ? 'full' : ''} ${dragY === 0 ? 'msheet' : ''}`}
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragging.current ? 'none' : 'transform .25s var(--ease)' }}
      >
        <div
          className="sheet-head"
          onTouchStart={(e) => { startY.current = e.touches[0].clientY; dragging.current = true; }}
          onTouchMove={(e) => { if (dragging.current) setDragY(Math.max(0, e.touches[0].clientY - startY.current)); }}
          onTouchEnd={() => { dragging.current = false; if (dragY > 110) closeRef.current(); else setDragY(0); }}
        >
          <span className="sheet-grab" aria-hidden />
          {title && <h2>{title}</h2>}
          <button type="button" className="sheet-x" onClick={() => closeRef.current()} aria-label="닫기">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
