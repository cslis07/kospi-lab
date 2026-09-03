'use client';

import { useState, useEffect } from 'react';

// 기본 = 라이트 모드. 다크는 사용자가 명시적으로 고른 경우(html.dark)만.
// 초기 클래스는 layout 의 인라인 스크립트가 페인트 전에 적용한다(깜빡임 방지).
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  return (
    <button
      onClick={toggle}
      title={dark ? '라이트 모드' : '다크 모드'}
      aria-label={dark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors text-base"
    >
      {dark ? '☀' : '🌙'}
    </button>
  );
}
