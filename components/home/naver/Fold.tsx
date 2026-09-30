'use client';

/**
 * 스프링 아코디언 폴드 — 모바일에서만 접힘(enabled), 데스크탑은 항상 펼침.
 * max-height 전이(cubic-bezier(.16,1,.3,1))로 여닫고, 콘텐츠 높이가 SWR 로딩으로 바뀌어도
 * 펼친 상태는 transitionend 후 max-height:none 으로 풀어 자유롭게 커지게 한다(첨부 레시피 확장).
 */
import { useEffect, useRef } from 'react';
import { useState } from 'react';

/**
 * ssrDefault = 정적 HTML·첫 렌더에서 쓸 값. 서버는 화면 폭을 모르므로 **모바일 기준**으로 넘길 것
 * (주 사용 환경이 폰·APK — 첫 렌더를 PC로 그리면 JS 실행 순간 모바일로 바뀌며 화면이 크게 밀린다, CLS 0.27 실측).
 * 레이아웃 차이는 가능하면 CSS 미디어쿼리(nv-m-only·nv-fold-closed·nv-board-chart)로 처리하고, 이 훅은 동작(클릭 등)에만.
 */
export function useMediaQuery(query: string, ssrDefault = false): boolean {
  const [match, setMatch] = useState(ssrDefault);
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
  const first = useRef(true);

  useEffect(() => {
    const el = outer.current, content = inner.current;
    if (!el || !content) return;

    if (!enabled) {
      // PC: 인라인 스타일을 비우고 CSS(항상 펼침)에 맡긴다. 이후 모바일로 바뀌면 그 첫 활성화도 '첫 마운트'로 취급.
      el.style.maxHeight = '';
      el.style.overflow = '';
      first.current = true;
      return;
    }
    el.style.overflow = 'hidden';

    // 첫 마운트는 애니메이션 없이 최종 상태로. ⚠️ 여기서 scrollHeight(px)로 고정하면
    // 'none→px' 은 트랜지션이 없어 transitionend 가 안 와서, 데이터가 늦게 오면 아래가 잘린다(실측 버그).
    if (first.current) {
      first.current = false;
      el.style.maxHeight = open ? 'none' : '0px';
      return;
    }

    if (open) {
      el.style.maxHeight = content.scrollHeight + 'px';
      const done = () => { if (outer.current) outer.current.style.maxHeight = 'none'; };
      el.addEventListener('transitionend', done, { once: true });
      const t = setTimeout(done, 600); // transitionend 누락 대비
      return () => { clearTimeout(t); el.removeEventListener('transitionend', done); };
    }
    // 닫기: 'none' 이면 먼저 현재 높이로 고정 → 두 프레임 뒤 0 (트랜지션이 걸리게)
    el.style.maxHeight = content.scrollHeight + 'px';
    let id2 = 0;
    const id1 = requestAnimationFrame(() => { id2 = requestAnimationFrame(() => { if (outer.current) outer.current.style.maxHeight = '0px'; }); });
    return () => { cancelAnimationFrame(id1); cancelAnimationFrame(id2); };
  }, [open, enabled]);

  return (
    // 접힘 초기 상태는 클래스(CSS, 모바일 폭에서만)로도 표현 — JS 실행 전 정적 HTML부터 최종 모양이라 밀림 없음
    <div ref={outer} className={`nv-fold${open ? '' : ' nv-fold-closed'}`} style={{ transition: 'max-height .45s cubic-bezier(.16,1,.3,1)' }}>
      <div ref={inner}>{children}</div>
    </div>
  );
}
