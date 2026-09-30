'use client';

/**
 * 긴 목록 점진 렌더 — 처음엔 step 개만 그리고, 목록 끝(sentinel)이 화면 800px 앞에 오면 step 개씩 더 그린다.
 * 국내 184행·해외 100여 행을 한 번에 그리면 DOM 수천 개 + 메인 스레드 수백 ms 정지(저사양 폰에서 체감).
 * resetKey(검색어·정렬·필터)가 바뀌면 처음 개수로 되돌린다. 시세 갱신(데이터만 바뀜)에는 초기화하지 않는다.
 */
import { useEffect, useState } from 'react';

export function useProgressiveList(total: number, resetKey: string, step = 40) {
  const [count, setCount] = useState(step);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) { setKey(resetKey); setCount(step); }   // 렌더 중 상태 조정(React 권장 패턴)

  // 콜백 ref: 목록이 로딩 스켈레톤 뒤에 늦게 나타나도(sentinel이 나중에 생겨도) 감시를 다시 건다
  const [el, sentinelRef] = useState<HTMLDivElement | null>(null);
  const shown = Math.min(count, total);
  useEffect(() => {
    if (!el || shown >= total) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) setCount((c) => c + step); },
      { rootMargin: '800px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, shown, total, step]);

  return { shown, hasMore: shown < total, sentinelRef };
}
