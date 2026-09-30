'use client';

/**
 * 스프링 아코디언 폴드 — 모바일에서만 접힘(enabled), 데스크탑은 항상 펼침.
 * max-height 전이(cubic-bezier(.16,1,.3,1))로 여닫고, 콘텐츠 높이가 SWR 로딩으로 바뀌어도
 * 펼친 상태는 transitionend 후 max-height:none 으로 풀어 자유롭게 커지게 한다(첨부 레시피 확장).
 */
import { useEffect, useRef } from 'react';
import { useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

export function Chevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      className={className}
      width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .35s cubic-bezier(.34,1.56,.64,1)' }}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export default function Fold({ open, enabled, children }: { open: boolean; enabled: boolean; children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = outer.current, content = inner.current;
    if (!el || !content) return;

    if (!enabled) {
      el.style.maxHeight = 'none';
      el.style.overflow = 'visible';
      return;
    }
    el.style.overflow = 'hidden';

    if (open) {
      el.style.maxHeight = content.scrollHeight + 'px';
      const done = () => { el.style.maxHeight = 'none'; el.removeEventListener('transitionend', done); };
      el.addEventListener('transitionend', done);
      return () => el.removeEventListener('transitionend', done);
    } else {
      // 'none' 상태였다면 먼저 현재 높이로 고정한 뒤 다음 프레임에 0 으로 — 트랜지션이 걸리게
      el.style.maxHeight = content.scrollHeight + 'px';
      const id = requestAnimationFrame(() => { if (outer.current) outer.current.style.maxHeight = '0px'; });
      return () => cancelAnimationFrame(id);
    }
  }, [open, enabled, children]);

  return (
    <div ref={outer} style={{ transition: 'max-height .45s cubic-bezier(.16,1,.3,1)' }}>
      <div ref={inner}>{children}</div>
    </div>
  );
}
