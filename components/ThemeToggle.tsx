'use client';

import { useState, useEffect } from 'react';

// 다크/라이트 토글. 기본 = 다크(html.dark). 라이트는 html.light.
// 초기 클래스는 layout 의 인라인 스크립트가 페인트 전에 적용(깜빡임 방지).
// DOM 클래스를 진실원으로 삼아 연속 클릭이 어긋나지 않게 한다.
export default function ThemeToggle({ className = 'appbar-ic' }: { className?: string }) {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.classList.contains('light'));
  }, []);

  const toggle = () => {
    const el = document.documentElement;
    const nowLight = !el.classList.contains('light');
    el.classList.toggle('light', nowLight);
    el.classList.toggle('dark', !nowLight);
    try { localStorage.setItem('kl-theme', nowLight ? 'light' : 'dark'); } catch {}
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', nowLight ? '#ffffff' : '#000814');
    setLight(nowLight);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={className}
      aria-label={light ? '다크 모드로 전환' : '라이트 모드로 전환'}
      title={light ? '다크 모드' : '라이트 모드'}
    >
      {light ? (
        /* 라이트 상태 → 달(다크로 전환) */
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      ) : (
        /* 다크 상태 → 해(라이트로 전환) */
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2v2.2M12 19.8V22M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2 12h2.2M19.8 12H22M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
        </svg>
      )}
    </button>
  );
}
