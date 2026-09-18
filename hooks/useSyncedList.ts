'use client';

/**
 * localStorage 에 저장되는 목록의 공용 상태 훅 — 같은 key 를 쓰는 모든 컴포넌트·탭이 동기화된다.
 *
 * 왜: 관심목록 훅을 쓰는 곳(검색 시트·홈·관심종목 화면)이 각자 상태를 들고 있어서
 *   ① 검색 시트에서 ☆로 추가해도 열려 있는 목록엔 새로고침 전까지 안 보였고
 *   ② add/remove 가 렌더 당시 목록을 참조해, 삭제 전 렌더에서 만든 '되돌리기'가 "이미 있음"으로 무시됐다.
 * 해결: 저장 시 커스텀 이벤트(같은 탭)·storage 이벤트(다른 탭)로 알리고, 조작은 항상 최신 목록(ref)을 기준으로 한다.
 */
import { useEffect, useRef, useState } from 'react';

const EVT = 'kl:list-change';

export function useSyncedList<T>(key: string, defaults: T[]) {
  const [list, setList] = useState<T[]>(defaults);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<T[]>(defaults);

  useEffect(() => {
    const load = () => {
      try {
        const s = localStorage.getItem(key);
        if (s) { const v = JSON.parse(s) as T[]; ref.current = v; setList(v); }
      } catch { /* 손상된 값·저장 불가 환경은 기본값 유지 */ }
    };
    setMounted(true);
    load();
    const onLocal = (e: Event) => { if ((e as CustomEvent<string>).detail === key) load(); };
    const onStorage = (e: StorageEvent) => { if (e.key === key) load(); };
    window.addEventListener(EVT, onLocal);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVT, onLocal);
      window.removeEventListener('storage', onStorage);
    };
  }, [key]);

  const save = (items: T[]) => {
    ref.current = items;
    setList(items);
    try { localStorage.setItem(key, JSON.stringify(items)); } catch { /* 저장 불가 환경 무시 */ }
    window.dispatchEvent(new CustomEvent(EVT, { detail: key }));
  };

  /** 항상 최신 목록 — 오래된 렌더에서 만든 콜백(되돌리기 등)에서도 안전 */
  const current = () => ref.current;

  return { list, mounted, save, current };
}
